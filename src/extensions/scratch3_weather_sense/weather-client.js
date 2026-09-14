/**
 * Fetching weather for the Weather Sense extension, from OpenWeather.
 *
 * The editor asks OpenWeather's free "current weather" and "5 day / 3 hour
 * forecast" services directly -- they answer requests from any web page --
 * with the API key the user types into a block. Nothing is bundled and
 * nothing is installed: the whole extension is this file and the blocks.
 *
 * Answers are kept for a while per place. OpenWeather only refreshes its
 * readings about every ten minutes, and a free key allows 60 calls a
 * minute, so a project that looks the weather up inside a forever loop would
 * otherwise use its key up within a second and then see "too many requests".
 *
 * The key is remembered on this computer (localStorage), not in the project,
 * so once it has been set the block holding it can be deleted and the
 * project shared without handing the key out with it.
 *
 * Everything OpenWeather-shaped lives here; the blocks are handed plain
 * values with plain names.
 */

const API_BASE = 'https://api.openweathermap.org/data/2.5';

/** How long a current-weather answer is reused for the same place. */
const CURRENT_MAX_AGE_MS = 10 * 60 * 1000;

/** How long a forecast is reused: it only changes every few hours. */
const FORECAST_MAX_AGE_MS = 30 * 60 * 1000;

/** How long to wait for the service before calling it unreachable. */
const REQUEST_TIMEOUT_MS = 10 * 1000;

/** How many places' answers to keep at once. */
const MAX_CACHED = 50;

const KEY_STORAGE = 'robolab.weatherSense.key';

/** What the "weather lookup status" reporter says. */
const STATUS = {
    OK: 'ok',
    NO_KEY: 'no key',
    WRONG_KEY: 'wrong key',
    NOT_FOUND: 'place not found',
    NO_PLACE: 'no place chosen',
    TOO_MANY: 'too many requests',
    OFFLINE: 'no internet',
    FAILED: 'service problem'
};

/**
 * Which of OpenWeather's condition groups each block choice covers. A
 * thunderstorm is rain as well as a storm, as anyone out in one would say.
 * @readonly
 */
const CONDITION_GROUPS = {
    clear: ['Clear'],
    cloudy: ['Clouds'],
    raining: ['Rain', 'Drizzle', 'Thunderstorm'],
    snowing: ['Snow'],
    stormy: ['Thunderstorm', 'Squall', 'Tornado'],
    misty: ['Mist', 'Fog', 'Haze', 'Smoke', 'Dust', 'Sand', 'Ash']
};

class WeatherError extends Error {
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

const numberOr0 = value => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * A moment as the clock reads at the place itself, "HH:MM".
 * @param {number} unixSeconds - the moment.
 * @param {number} offsetSeconds - the place's offset from UTC.
 * @returns {string} - the local time, or '' if there is none.
 */
const localTime = (unixSeconds, offsetSeconds) => {
    if (typeof unixSeconds !== 'number') return '';
    const date = new Date((unixSeconds + numberOr0(offsetSeconds)) * 1000);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};

/**
 * The readings that current weather and a forecast slot have in common.
 * @param {object} entry - an OpenWeather weather object.
 * @returns {object} - plain names to values.
 */
const commonReadings = entry => {
    const main = entry.main || {};
    const wind = entry.wind || {};
    const sky = (entry.weather && entry.weather[0]) || {};
    return {
        'temperature': numberOr0(main.temp),
        'feels like': numberOr0(main.feels_like),
        'lowest temperature': numberOr0(main.temp_min),
        'highest temperature': numberOr0(main.temp_max),
        'humidity': numberOr0(main.humidity),
        'pressure': numberOr0(main.pressure),
        'wind speed': numberOr0(wind.speed),
        'wind direction': numberOr0(wind.deg),
        'cloud cover': numberOr0(entry.clouds && entry.clouds.all),
        'visibility': numberOr0(entry.visibility),
        'condition': sky.main || '',
        'description': sky.description || ''
    };
};

class WeatherClient {
    /**
     * @param {object} [options] - for tests: fetch, now and storage stand-ins.
     */
    constructor (options = {}) {
        this._fetch = options.fetch || ((url, init) => fetch(url, init));
        this._now = options.now || (() => Date.now());
        this._storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : browserStorage();
        this._key = '';
        this._cache = new Map();
        this._inFlight = new Map();
    }

    /** The key in use: the one set this session, or the one remembered here. */
    get key () {
        if (this._key) return this._key;
        try {
            return (this._storage && this._storage.getItem(KEY_STORAGE)) || '';
        } catch (err) {
            return '';
        }
    }

    /**
     * Use a key, and remember it on this computer. A blank key changes
     * nothing, so the block can be left in with the box emptied.
     * @param {*} key - the key.
     * @returns {boolean} - whether a key was given.
     */
    setKey (key) {
        const trimmed = String(key || '').trim();
        if (!trimmed) return false;
        if (trimmed !== this.key) this._cache.clear();
        this._key = trimmed;
        try {
            if (this._storage) this._storage.setItem(KEY_STORAGE, trimmed);
        } catch (err) {
            // Storage switched off: the key still works for this session.
        }
        return true;
    }

    /**
     * Ask the service, reusing a recent answer for the same question.
     * @param {string} path - 'weather' or 'forecast'.
     * @param {object} params - the place and units.
     * @param {number} maxAge - how old a kept answer may be, in ms.
     * @returns {Promise<object>} - the service's answer.
     * @private
     */
    _get (path, params, maxAge) {
        const key = this.key;
        if (!key) {
            return Promise.reject(new WeatherError(STATUS.NO_KEY,
                'there is no weather service key yet: get a free key at openweathermap.org ' +
                'and put it in "set weather service key"'));
        }
        const query = new URLSearchParams(params).toString();
        const id = `${path}?${query}#${key}`;
        const kept = this._cache.get(id);
        if (kept && this._now() - kept.at < maxAge) return Promise.resolve(kept.data);
        if (this._inFlight.has(id)) return this._inFlight.get(id);

        const request = this._request(`${API_BASE}/${path}?${query}&appid=${encodeURIComponent(key)}`)
            .then(data => {
                this._cache.delete(id);
                this._cache.set(id, {at: this._now(), data});
                if (this._cache.size > MAX_CACHED) this._cache.delete(this._cache.keys().next().value);
                return data;
            })
            .finally(() => {
                this._inFlight.delete(id);
            });
        this._inFlight.set(id, request);
        return request;
    }

    /**
     * One request, with its failures turned into statuses.
     * @param {string} url - the full URL, key included.
     * @returns {Promise<object>} - the parsed answer.
     * @private
     */
    async _request (url) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
        let response;
        try {
            response = await this._fetch(url, controller ? {signal: controller.signal} : {});
        } catch (err) {
            throw new WeatherError(STATUS.OFFLINE,
                'could not reach the weather service: check the internet connection');
        } finally {
            if (timer) clearTimeout(timer);
        }

        let body = null;
        try {
            body = await response.json();
        } catch (err) {
            body = null;
        }
        if (response.ok && body) return body;

        const detail = body && body.message ? body.message : `HTTP ${response.status}`;
        switch (response.status) {
        case 401:
            throw new WeatherError(STATUS.WRONG_KEY,
                `the weather service did not accept the key (${detail}); a brand-new key can take ` +
                'a couple of hours to start working');
        case 404:
            throw new WeatherError(STATUS.NOT_FOUND, `the weather service does not know that place (${detail})`);
        case 429:
            throw new WeatherError(STATUS.TOO_MANY, 'too many weather lookups with this key: wait a minute');
        default:
            throw new WeatherError(STATUS.FAILED, `the weather service had a problem (${detail})`);
        }
    }

    /**
     * The weather now.
     * @param {object} place - {q: city} or {lat, lon}.
     * @param {string} units - 'metric' or 'imperial'.
     * @returns {Promise<object>} - the service's answer.
     */
    current (place, units) {
        return this._get('weather', Object.assign({}, place, {units}), CURRENT_MAX_AGE_MS);
    }

    /**
     * The next five days, in three-hour steps.
     * @param {object} place - {q: city} or {lat, lon}.
     * @param {string} units - 'metric' or 'imperial'.
     * @returns {Promise<object>} - the service's answer.
     */
    forecast (place, units) {
        return this._get('forecast', Object.assign({}, place, {units}), FORECAST_MAX_AGE_MS);
    }

    /**
     * Current weather as the blocks read it.
     * @param {object} body - the service's current-weather answer.
     * @returns {object} - plain names to values.
     */
    static describeCurrent (body) {
        const readings = commonReadings(body);
        const sys = body.sys || {};
        return Object.assign(readings, {
            'rain in last hour': numberOr0(body.rain && body.rain['1h']),
            'snow in last hour': numberOr0(body.snow && body.snow['1h']),
            'place': body.name || '',
            'country': sys.country || '',
            'sunrise': localTime(sys.sunrise, body.timezone),
            'sunset': localTime(sys.sunset, body.timezone)
        });
    }

    /**
     * The forecast slot nearest to some hours from now, as the blocks read it.
     * @param {object} body - the service's forecast answer.
     * @param {number} hoursAhead - how far ahead.
     * @param {number} nowMs - the time now.
     * @returns {?object} - plain names to values, or null for an empty forecast.
     */
    static describeForecast (body, hoursAhead, nowMs) {
        const slots = (body && Array.isArray(body.list)) ? body.list : [];
        if (!slots.length) return null;
        const target = (nowMs / 1000) + (Math.max(0, hoursAhead) * 3600);
        const slot = slots.reduce((best, entry) => (
            Math.abs(entry.dt - target) < Math.abs(best.dt - target) ? entry : best
        ), slots[0]);
        const city = body.city || {};
        return Object.assign(commonReadings(slot), {
            'chance of rain': Math.round(numberOr0(slot.pop) * 100),
            'rain': numberOr0(slot.rain && slot.rain['3h']),
            'snow': numberOr0(slot.snow && slot.snow['3h']),
            'time': localTime(slot.dt, city.timezone)
        });
    }

    /**
     * Whether a condition group name matches a block's choice.
     * @param {string} condition - OpenWeather's group, e.g. 'Rain'.
     * @param {string} choice - a key of CONDITION_GROUPS.
     * @returns {boolean} - true if it matches.
     */
    static isCondition (condition, choice) {
        const group = CONDITION_GROUPS[choice];
        return !!group && group.indexOf(condition) >= 0;
    }
}

WeatherClient.STATUS = STATUS;
WeatherClient.CONDITIONS = Object.keys(CONDITION_GROUPS);
WeatherClient.CURRENT_MAX_AGE_MS = CURRENT_MAX_AGE_MS;
WeatherClient.FORECAST_MAX_AGE_MS = FORECAST_MAX_AGE_MS;
WeatherClient.KEY_STORAGE = KEY_STORAGE;

module.exports = WeatherClient;
