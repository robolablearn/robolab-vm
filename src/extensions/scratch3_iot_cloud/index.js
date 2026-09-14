/**
 * IoT Cloud: sending values to ThingSpeak channels and reading them back.
 *
 * Field values are set one by one and sent together as one update, or a
 * single value is sent straight to one field. Reading asks for the newest
 * value of a field of any channel, private ones with their read key. It all
 * runs in the editor (see cloud-client.js), so board sensor reporters in
 * Arena mode can go straight into the send blocks.
 *
 * The blocks, their wording, the artwork and this code are Robolab's own
 * design. "ThingSpeak" is a trademark of The MathWorks, Inc.; the extension
 * uses its public API and is not affiliated with or endorsed by MathWorks.
 */
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');

const CloudClient = require('./cloud-client');

const {STATUS} = CloudClient;

const CATEGORY_COLOUR = '#4E8F2E';

/** A cloud with an arrow up and an arrow down. */
const CLOUD_PATHS = [
    '<path d="M11 29h19a6.5 6.5 0 0 0 0-13 9 9 0 0 0-17.4 2.2A5.4 5.4 0 0 0 11 29z"/>',
    '<path d="M17 36v-6M14.5 32.5L17 30l2.5 2.5M24 30v6M21.5 33.5L24 36l2.5-2.5"/>'
].join('');

/**
 * The icon as a data URI.
 * @param {number} size - the drawn size in pixels.
 * @param {string} colour - the stroke colour.
 * @param {number} stroke - the stroke width, in the 40-unit view box.
 * @returns {string} - the data URI.
 */
const iconURI = (size, colour, stroke) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent([
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40">`,
    `<g fill="none" stroke="${colour}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">`,
    CLOUD_PATHS,
    '</g></svg>'
].join(''))}`;

class Scratch3IotCloudBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this._client = new CloudClient();
        /** Field values waiting for "send fields", by field number. */
        this._fields = {};
        this._lastSendWorked = false;
        this._status = this._client.writeKey ? STATUS.READY : STATUS.NO_WRITE_KEY;
        this._lastWarning = '';
        /** Sends waiting for their turn, so the stop sign can let them go. */
        this._waits = new Set();

        this._onStopAll = () => this._cancelWaits();
        this.runtime.on('PROJECT_STOP_ALL', this._onStopAll);
    }

    get EXTENSION_ID () {
        return 'iotCloud';
    }

    getInfo () {
        const fieldMenu = Array.from({length: CloudClient.FIELD_COUNT}, (_, i) => ({
            text: String(i + 1), value: String(i + 1)
        }));
        return [{
            id: 'iotCloud',
            name: formatMessage({
                id: 'iotCloud.categoryName',
                default: 'IoT Cloud',
                description: 'Label for the IoT channel extension category'
            }),
            blockIconURI: iconURI(40, '#FFF', 2.6),
            menuIconURI: iconURI(20, CATEGORY_COLOUR, 3),
            color1: CATEGORY_COLOUR,
            color2: '#437B27',
            color3: '#386821',
            blocks: [
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'iotCloud.group.setup',
                        default: 'Setup',
                        description: 'palette heading above the key blocks'
                    })
                },
                {
                    opcode: 'setWriteKey',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'iotCloud.setWriteKey',
                        default: 'set channel write key to [KEY]',
                        description: 'the channel\'s Write API Key; it is remembered on this computer'
                    }),
                    arguments: {
                        KEY: {type: ArgumentType.STRING, defaultValue: ''}
                    }
                },
                {
                    opcode: 'setReadKey',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'iotCloud.setReadKey',
                        default: 'set read key of channel [CHANNEL] to [KEY]',
                        description: 'only needed for private channels; remembered on this computer'
                    }),
                    arguments: {
                        CHANNEL: {type: ArgumentType.NUMBER, defaultValue: 12345},
                        KEY: {type: ArgumentType.STRING, defaultValue: ''}
                    }
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'iotCloud.group.send',
                        default: 'Send',
                        description: 'palette heading above the sending blocks'
                    })
                },
                {
                    opcode: 'setField',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'iotCloud.setField',
                        default: 'put [VALUE] in field [FIELD]',
                        description: 'get a value ready to go in the next "send fields"'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.STRING, defaultValue: '0'},
                        FIELD: {type: ArgumentType.STRING, menu: 'FIELD', defaultValue: '1'}
                    }
                },
                {
                    opcode: 'sendFields',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'iotCloud.sendFields',
                        default: 'send fields to channel',
                        description: 'send every field that was put in, as one update; waits its turn'
                    })
                },
                {
                    opcode: 'sendValue',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'iotCloud.sendValue',
                        default: 'send [VALUE] to field [FIELD] now',
                        description: 'send one value on its own; waits its turn'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.STRING, defaultValue: '0'},
                        FIELD: {type: ArgumentType.STRING, menu: 'FIELD', defaultValue: '1'}
                    }
                },
                {
                    opcode: 'lastSendWorked',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'iotCloud.lastSendWorked',
                        default: 'last send worked?',
                        description: 'whether the channel accepted the last update'
                    })
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'iotCloud.group.read',
                        default: 'Read',
                        description: 'palette heading above the reading blocks'
                    })
                },
                {
                    opcode: 'readField',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'iotCloud.readField',
                        default: 'newest value of field [FIELD] in channel [CHANNEL]',
                        description: 'the latest value stored in a field of any channel'
                    }),
                    arguments: {
                        FIELD: {type: ArgumentType.STRING, menu: 'FIELD', defaultValue: '1'},
                        CHANNEL: {type: ArgumentType.NUMBER, defaultValue: 9}
                    }
                },
                {
                    opcode: 'cloudStatus',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'iotCloud.cloudStatus',
                        default: 'cloud status',
                        description: 'ok, or what went wrong with the last send or read'
                    })
                }
            ],
            menus: {
                FIELD: {acceptReporters: true, items: fieldMenu}
            }
        }];
    }

    /**
     * Say what went wrong, once per message, on the console: a project that
     * sends in a loop must not open a dialog on every pass.
     * @param {Error} err - what went wrong.
     * @private
     */
    _warn (err) {
        const message = `IoT Cloud: ${err && err.message ? err.message : err}`;
        if (message === this._lastWarning) return;
        this._lastWarning = message;
        // eslint-disable-next-line no-console
        console.warn(message);
    }

    _fail (err) {
        this._status = err && err.status ? err.status : STATUS.FAILED;
        this._warn(err);
    }

    /**
     * Wait before a send, unless the project is stopped meanwhile.
     * @param {number} ms - how long.
     * @returns {Promise<boolean>} - true to carry on, false if stopped.
     * @private
     */
    _wait (ms) {
        return new Promise(resolve => {
            const entry = {resolve, timer: null};
            entry.timer = setTimeout(() => {
                this._waits.delete(entry);
                resolve(true);
            }, ms);
            this._waits.add(entry);
        });
    }

    _cancelWaits () {
        this._waits.forEach(entry => {
            clearTimeout(entry.timer);
            entry.resolve(false);
        });
        this._waits.clear();
    }

    // ------------------------------------------------------------ setup

    setWriteKey (args) {
        if (this._client.setWriteKey(args.KEY)) {
            if (this._status === STATUS.NO_WRITE_KEY || this._status === STATUS.WRONG_KEY) this._status = STATUS.READY;
        } else if (!this._client.writeKey) {
            this._status = STATUS.NO_WRITE_KEY;
        }
    }

    setReadKey (args) {
        if (!CloudClient.channelId(args.CHANNEL)) {
            this._fail(Object.assign(new Error('a channel is a number, like 12345'), {status: STATUS.NOT_FOUND}));
            return;
        }
        this._client.setReadKey(args.CHANNEL, args.KEY);
    }

    // ------------------------------------------------------------ send

    _field (value) {
        const n = CloudClient.fieldNumber(value);
        if (n === null) {
            this._fail(Object.assign(
                new Error(`fields go from 1 to ${CloudClient.FIELD_COUNT}`),
                {status: STATUS.BAD_FIELD}
            ));
        }
        return n;
    }

    /**
     * Send some fields and record how it went.
     * @param {object} fields - field number to value.
     * @returns {Promise<boolean>} - whether it was sent.
     * @private
     */
    _send (fields) {
        return this._client.send(fields, ms => this._wait(ms))
            .then(sent => {
                if (sent) {
                    this._lastSendWorked = true;
                    this._status = STATUS.OK;
                }
                return sent;
            })
            .catch(err => {
                this._lastSendWorked = false;
                this._fail(err);
                return false;
            });
    }

    setField (args) {
        const n = this._field(args.FIELD);
        if (n !== null) this._fields[n] = Cast.toString(args.VALUE);
    }

    sendFields () {
        // What goes out is what was put in by now. A send can wait up to 15
        // seconds for its turn, and a value put in meanwhile belongs to the
        // next send: it must neither sneak into this one nor be cleared by it.
        const fields = Object.assign({}, this._fields);
        return this._send(fields).then(sent => {
            if (!sent) return;
            Object.keys(fields).forEach(n => {
                if (this._fields[n] === fields[n]) delete this._fields[n];
            });
        });
    }

    sendValue (args) {
        const n = this._field(args.FIELD);
        if (n === null) return;
        return this._send({[n]: Cast.toString(args.VALUE)}).then(() => null);
    }

    lastSendWorked () {
        return this._lastSendWorked;
    }

    // ------------------------------------------------------------ read

    readField (args) {
        return this._client.read(args.CHANNEL, args.FIELD)
            .then(value => {
                if (value === null) {
                    this._status = STATUS.NO_DATA;
                    return '';
                }
                this._status = STATUS.OK;
                return value;
            })
            .catch(err => {
                this._fail(err);
                return '';
            });
    }

    cloudStatus () {
        return this._status;
    }

    /**
     * Give back what this extension holds when it is removed: sends waiting
     * for their turn, and the stop-sign listener. Safe to call more than once.
     */
    dispose () {
        this.runtime.removeListener('PROJECT_STOP_ALL', this._onStopAll);
        this._cancelWaits();
    }
}

module.exports = Scratch3IotCloudBlocks;
