/**
 * Talking to ThingSpeak channels for the IoT Cloud extension.
 *
 * ThingSpeak's REST API answers requests from any web page, so the editor
 * sends and reads channel data itself: no board firmware, no library, no
 * download. That is also what makes it work with the robot in Arena mode --
 * a sensor reporter from the board goes straight into a send block.
 *
 * Two limits of the service shape this file:
 *
 * - A free channel takes at most one update every 15 seconds and quietly
 *   refuses the rest. So sends wait for their turn instead: a send inside a
 *   forever loop simply paces the loop, and every value arrives.
 * - Reads of the same field are kept for 3 seconds, so a reporter in a
 *   forever loop does not hammer the service dozens of times a second.
 *
 * Keys are remembered on this computer (localStorage), not in the project,
 * so a project can be shared without handing out the keys once the blocks
 * that set them have been removed.
 */

const API_BASE = 'https://api.thingspeak.com';

/** The shortest gap a free channel accepts between two updates. */
const MIN_SEND_GAP_MS = 15 * 1000;

/** How long a read of one field is reused. */
const READ_MAX_AGE_MS = 3 * 1000;

/** How long to wait for the service before calling it unreachable. */
const REQUEST_TIMEOUT_MS = 10 * 1000;

const FIELD_COUNT = 8;
const MAX_VALUE_LENGTH = 255;

const WRITE_KEY_STORAGE = 'robolab.iotCloud.writeKey';
const READ_KEYS_STORAGE = 'robolab.iotCloud.readKeys';

/** What the "cloud status" reporter says. */
const STATUS = {
    READY: 'ready',
    OK: 'ok',
    NO_WRITE_KEY: 'no write key',
    WRONG_KEY: 'wrong key',
    NOTHING_TO_SEND: 'nothing to send',
    REFUSED: 'send refused',
    NOT_FOUND: 'channel not found',
    NO_DATA: 'no data yet',
    BAD_FIELD: 'no such field',
    OFFLINE: 'no internet',
    FAILED: 'service problem'
};

class CloudError extends Error {
    /**
     * @param {string} status - one of STATUS.
     * @param {string} message - a plain sentence for the console.
     */
    constructor (status, message) {
        super(message);
        this.status = status;
    }
}

const browserStorage = () => {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch (err) {
        return null;
    }
};

/**
 * A field number from a block, 1-8, or null.
 * @param {*} value - what the block holds.
 * @returns {?number} - the field number.
 */
const fieldNumber = value => {
    const n = Number(String(value).trim());
    return Number.isInteger(n) && n >= 1 && n <= FIELD_COUNT ? n : null;
};

class CloudClient {
    /**
     * @param {object} [options] - for tests: fetch, now and storage stand-ins.
     */
    constructor (options = {}) {
        this._fetch = options.fetch || ((url, init) => fetch(url, init));
        this._now = options.now || (() => Date.now());
        this._storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : browserStorage();
        this._writeKey = '';
        this._readKeys = {};
        /** When each write key last sent, so the gap is kept per channel. */
        this._lastSendAt = new Map();
        this._sendChain = Promise.resolve();
        this._cache = new Map();
        this._inFlight = new Map();
    }

    _load (name, fallback) {
        try {
            const text = this._storage && this._storage.getItem(name);
            return text ? JSON.parse(text) : fallback;
        } catch (err) {
            return fallback;
        }
    }

    _save (name, value) {
        try {
            if (this._storage) this._storage.setItem(name, JSON.stringify(value));
        } catch (err) {
            // Storage switched off: the key still works for this session.
        }
    }

    /** The write key in use: the one set this session, or the one remembered here. */
    get writeKey () {
        return this._writeKey || this._load(WRITE_KEY_STORAGE, '') || '';
    }

    /**
     * Use a write key, and remember it on this computer. Blank changes nothing.
     * @param {*} key - the key.
     * @returns {boolean} - whether a key was given.
     */
    setWriteKey (key) {
        const trimmed = String(key || '').trim();
        if (!trimmed) return false;
        this._writeKey = trimmed;
        this._save(WRITE_KEY_STORAGE, trimmed);
        return true;
    }

    /**
     * The read key for a channel, if one has been set here.
     * @param {string} channel - the channel number.
     * @returns {string} - the key, or ''.
     */
    readKeyFor (channel) {
        if (this._readKeys[channel]) return this._readKeys[channel];
        return this._load(READ_KEYS_STORAGE, {})[channel] || '';
    }

    /**
     * Use a read key for a private channel, and remember it on this computer.
     * @param {*} channel - the channel number.
     * @param {*} key - the key; blank changes nothing.
     * @returns {boolean} - whether a key was given for a real channel number.
     */
    setReadKey (channel, key) {
        const id = CloudClient.channelId(channel);
        const trimmed = String(key || '').trim();
        if (!id || !trimmed) return false;
        this._readKeys[id] = trimmed;
        const stored = this._load(READ_KEYS_STORAGE, {});
        stored[id] = trimmed;
        this._save(READ_KEYS_STORAGE, stored);
        this._cache.clear();
        return true;
    }

    /**
     * How long a send made now would have to wait for its turn.
     * @returns {number} - milliseconds; 0 if it can go straight away.
     */
    waitBeforeSend () {
        const last = this._lastSendAt.get(this.writeKey);
        return typeof last === 'number' ? Math.max(0, last + MIN_SEND_GAP_MS - this._now()) : 0;
    }

    /**
     * A request with a time limit, and "could not connect" as a status.
     * @param {string} url - where.
     * @param {object} init - fetch options.
     * @returns {Promise<{response: Response, text: string}>} - the answer and its body.
     * @private
     */
    async _call (url, init) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
        try {
            const options = Object.assign({}, init, controller ? {signal: controller.signal} : {});
            const response = await this._fetch(url, options);
            const text = await response.text();
            return {response, text: String(text || '').trim()};
        } catch (err) {
            throw new CloudError(STATUS.OFFLINE, 'could not reach the IoT cloud: check the internet connection');
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /**
     * Send field values as one update. Sends are queued, so two scripts
     * sending at once still keep the channel's gap between updates.
     * @param {object} fields - field number to value.
     * @param {Function} wait - called with milliseconds to wait; resolves true
     *                          to carry on, false if the project was stopped.
     * @returns {Promise<boolean>} - true if sent, false if stopped while waiting.
     */
    send (fields, wait) {
        const run = () => this._send(fields, wait);
        const result = this._sendChain.then(run, run);
        this._sendChain = result.catch(() => null);
        return result;
    }

    async _send (fields, wait) {
        const key = this.writeKey;
        if (!key) {
            throw new CloudError(STATUS.NO_WRITE_KEY,
                'there is no write key yet: copy the Write API Key from the channel\'s "API Keys" tab ' +
                'into "set channel write key"');
        }
        const numbers = Object.keys(fields).filter(n => fieldNumber(n) !== null);
        if (!numbers.length) {
            throw new CloudError(STATUS.NOTHING_TO_SEND, 'set at least one field before sending');
        }

        const delay = this.waitBeforeSend();
        if (delay > 0 && !(await wait(delay))) return false;

        const body = new URLSearchParams({api_key: key});
        numbers.forEach(n => body.append(`field${n}`, String(fields[n]).slice(0, MAX_VALUE_LENGTH)));
        const {response, text} = await this._call(`${API_BASE}/update.json`, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: body.toString()
        });
        // Any answer starts the gap again: a refused update counts too.
        this._lastSendAt.set(key, this._now());

        if (response.ok && text !== '0' && text !== '-1') {
            let entry = null;
            try {
                entry = JSON.parse(text);
            } catch (err) {
                entry = null;
            }
            if (entry && entry.entry_id > 0) return true;
        }
        if (response.status === 400 || response.status === 401) {
            throw new CloudError(STATUS.WRONG_KEY, 'the IoT cloud did not accept the write key');
        }
        if (response.ok) {
            throw new CloudError(STATUS.REFUSED,
                'the IoT cloud refused the update: a free channel takes one update every 15 seconds');
        }
        throw new CloudError(STATUS.FAILED, `the IoT cloud had a problem (HTTP ${response.status})`);
    }

    /**
     * The newest value of one field of a channel.
     * @param {*} channel - the channel number.
     * @param {*} field - the field number, 1-8.
     * @returns {Promise<?string>} - the value, or null if the field has no data yet.
     */
    read (channel, field) {
        const id = CloudClient.channelId(channel);
        if (!id) {
            return Promise.reject(new CloudError(STATUS.NOT_FOUND, 'a channel is a number, like 12345'));
        }
        const n = fieldNumber(field);
        if (n === null) {
            return Promise.reject(new CloudError(STATUS.BAD_FIELD, `fields go from 1 to ${FIELD_COUNT}`));
        }
        const readKey = this.readKeyFor(id);
        const cacheId = `${id}/${n}#${readKey}`;
        const kept = this._cache.get(cacheId);
        if (kept && this._now() - kept.at < READ_MAX_AGE_MS) return Promise.resolve(kept.value);
        if (this._inFlight.has(cacheId)) return this._inFlight.get(cacheId);

        const query = readKey ? `?api_key=${encodeURIComponent(readKey)}` : '';
        const request = this._call(`${API_BASE}/channels/${id}/fields/${n}/last.json${query}`, {method: 'GET'})
            .then(({response, text}) => {
                if (response.status === 404 || text === '-1') {
                    throw new CloudError(STATUS.NOT_FOUND,
                        `channel ${id} was not found, or it is private: set its read key first`);
                }
                if (response.status === 400 || response.status === 401) {
                    throw new CloudError(STATUS.WRONG_KEY,
                        `the IoT cloud did not accept the read key for channel ${id}`);
                }
                if (!response.ok) {
                    throw new CloudError(STATUS.FAILED, `the IoT cloud had a problem (HTTP ${response.status})`);
                }
                let entry = null;
                try {
                    entry = JSON.parse(text);
                } catch (err) {
                    throw new CloudError(STATUS.FAILED, 'the IoT cloud sent an answer that could not be read');
                }
                const raw = entry ? entry[`field${n}`] : null;
                const value = raw === null || typeof raw === 'undefined' ? null : String(raw).trim();
                this._cache.set(cacheId, {at: this._now(), value});
                return value;
            })
            .finally(() => {
                this._inFlight.delete(cacheId);
            });
        this._inFlight.set(cacheId, request);
        return request;
    }

    /**
     * A channel number from a block, as text, or '' if it is not one.
     * @param {*} value - what the block holds.
     * @returns {string} - the channel number.
     */
    static channelId (value) {
        const text = String(value).trim();
        return /^\d{1,10}$/.test(text) ? text : '';
    }
}

CloudClient.STATUS = STATUS;
CloudClient.FIELD_COUNT = FIELD_COUNT;
CloudClient.MIN_SEND_GAP_MS = MIN_SEND_GAP_MS;
CloudClient.READ_MAX_AGE_MS = READ_MAX_AGE_MS;
CloudClient.fieldNumber = fieldNumber;

module.exports = CloudClient;
