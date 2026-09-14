/**
 * Weather Sense: the weather now and in the next few days, for any place.
 *
 * One block looks the weather up for a city or a map position; the
 * reporters and the boolean read from that last lookup, the same "look, then
 * read" shape as the other Sense extensions. The forecast blocks use the
 * place of that last lookup and fetch the forecast when first asked.
 *
 * Data comes from OpenWeather with the user's own free key (see
 * weather-client.js). Lookups are kept for ten minutes per place, so they
 * are safe inside a forever loop.
 *
 * The blocks, their wording, the artwork and this code are Robolab's own
 * design. "OpenWeather" is a trademark of OpenWeather Ltd; the extension
 * uses its public API and is not affiliated with or endorsed by it.
 */
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const StageLayering = require('../../engine/stage-layering');
const {registerOverlay, unregisterOverlay, setOverlayVisible} = require('../../extension-support/stage-overlays');
const Video = require('../../io/video');

const WeatherClient = require('./weather-client');

const {STATUS} = WeatherClient;

const [STAGE_WIDTH, STAGE_HEIGHT] = Video.DIMENSIONS;

/**
 * The credit OpenWeather's licence (ODbL) requires on the screen where its
 * data appears -- not only in documentation -- in the wording it recommends.
 */
const ATTRIBUTION = 'Weather data © OpenWeather';

/** Pixels per stage unit for the credit, so its small text stays sharp. */
const CAPTION_RESOLUTION = 2;

const CATEGORY_COLOUR = '#E0891B';

/** A sun half behind a cloud. */
const WEATHER_PATHS = [
    '<circle cx="15" cy="15" r="6"/>',
    '<path d="M15 4v2.5M4 15h2.5M7.2 7.2l1.8 1.8M22.8 7.2L21 9"/>',
    '<path d="M13 32h17a6 6 0 0 0 0-12 8.5 8.5 0 0 0-16.3 2.6A4.8 4.8 0 0 0 13 32z"/>'
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
    WEATHER_PATHS,
    '</g></svg>'
].join(''))}`;

/** What "weather [ ]" can report about now. */
const NOW_READINGS = [
    'temperature', 'feels like', 'lowest temperature', 'highest temperature',
    'humidity', 'pressure', 'wind speed', 'wind direction', 'cloud cover', 'visibility',
    'rain in last hour', 'snow in last hour', 'condition', 'description',
    'place', 'country', 'sunrise', 'sunset'
];

/** What "forecast [ ]" can report about a later time. */
const FORECAST_READINGS = [
    'temperature', 'feels like', 'humidity', 'pressure', 'wind speed', 'wind direction',
    'cloud cover', 'chance of rain', 'rain', 'snow', 'condition', 'description', 'time'
];

/**
 * Text as blocks compare it: spare spaces gone, case ignored.
 * @param {*} value - anything a block might hand over.
 * @returns {string} - the text.
 */
const plain = value => Cast.toString(value)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const reading = (readings, name) => {
    const key = plain(name);
    return readings && Object.prototype.hasOwnProperty.call(readings, key) ? readings[key] : '';
};

class Scratch3WeatherSenseBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this._client = new WeatherClient();
        this._units = 'metric';
        /** The place of the last lookup, as the service's query parameters. */
        this._place = null;
        /** The readings from the last lookup, or null. */
        this._now = null;
        this._status = this._client.key ? STATUS.NO_PLACE : STATUS.NO_KEY;
        this._lastWarning = '';
        this._attributionSkin = null;
        this._attributionDrawable = null;
        this._attributionShown = false;
    }

    get EXTENSION_ID () {
        return 'weatherSense';
    }

    _menu (names) {
        return names.map(name => ({text: name, value: name}));
    }

    getInfo () {
        return [{
            id: 'weatherSense',
            name: formatMessage({
                id: 'weatherSense.categoryName',
                default: 'Weather Sense',
                description: 'Label for the weather extension category'
            }),
            blockIconURI: iconURI(40, '#FFF', 2.6),
            menuIconURI: iconURI(20, CATEGORY_COLOUR, 3),
            color1: CATEGORY_COLOUR,
            color2: '#C77716',
            color3: '#AD6612',
            blocks: [
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'weatherSense.group.setup',
                        default: 'Setup',
                        description: 'palette heading above the key and units blocks'
                    })
                },
                {
                    opcode: 'setKey',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'weatherSense.setKey',
                        default: 'set weather service key to [KEY]',
                        description: 'the OpenWeather API key; it is remembered on this computer'
                    }),
                    arguments: {
                        KEY: {type: ArgumentType.STRING, defaultValue: ''}
                    }
                },
                {
                    opcode: 'setUnits',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'weatherSense.setUnits',
                        default: 'measure weather in [UNITS]',
                        description: 'metric (°C, metres per second) or imperial (°F, miles per hour)'
                    }),
                    arguments: {
                        UNITS: {type: ArgumentType.STRING, menu: 'UNITS', defaultValue: 'metric'}
                    }
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'weatherSense.group.now',
                        default: 'Weather Now',
                        description: 'palette heading above the current weather blocks'
                    })
                },
                {
                    opcode: 'lookUpCity',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'weatherSense.lookUpCity',
                        default: 'look up weather in city [CITY]',
                        description: 'fetch the weather now for a city; "Paris,FR" narrows it to a country'
                    }),
                    arguments: {
                        CITY: {type: ArgumentType.STRING, defaultValue: 'Mumbai'}
                    }
                },
                {
                    opcode: 'lookUpPosition',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'weatherSense.lookUpPosition',
                        default: 'look up weather at latitude [LAT] longitude [LON]',
                        description: 'fetch the weather now for a map position'
                    }),
                    arguments: {
                        LAT: {type: ArgumentType.NUMBER, defaultValue: 19.08},
                        LON: {type: ArgumentType.NUMBER, defaultValue: 72.88}
                    }
                },
                {
                    opcode: 'weatherNow',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'weatherSense.weatherNow',
                        default: 'weather [READING]',
                        description: 'one reading from the last weather lookup'
                    }),
                    arguments: {
                        READING: {type: ArgumentType.STRING, menu: 'NOW_READING', defaultValue: 'temperature'}
                    }
                },
                {
                    opcode: 'isItNow',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'weatherSense.isItNow',
                        default: 'is it [CONDITION] ?',
                        description: 'whether the last lookup found this kind of weather'
                    }),
                    arguments: {
                        CONDITION: {type: ArgumentType.STRING, menu: 'CONDITION', defaultValue: 'raining'}
                    }
                },
                {
                    opcode: 'lookupStatus',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'weatherSense.lookupStatus',
                        default: 'weather lookup status',
                        description: 'ok, or what went wrong with the last lookup'
                    })
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'weatherSense.group.forecast',
                        default: 'Forecast',
                        description: 'palette heading above the forecast blocks'
                    })
                },
                {
                    opcode: 'forecast',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'weatherSense.forecast',
                        default: 'forecast [READING] in [HOURS] hours',
                        description: 'a reading for the last looked-up place, up to 5 days ahead in 3-hour steps'
                    }),
                    arguments: {
                        READING: {type: ArgumentType.STRING, menu: 'FORECAST_READING', defaultValue: 'temperature'},
                        HOURS: {type: ArgumentType.NUMBER, defaultValue: 6}
                    }
                },
                {
                    opcode: 'willItBe',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'weatherSense.willItBe',
                        default: 'will it be [CONDITION] in [HOURS] hours ?',
                        description: 'whether the forecast for the last looked-up place shows this weather'
                    }),
                    arguments: {
                        CONDITION: {type: ArgumentType.STRING, menu: 'CONDITION', defaultValue: 'raining'},
                        HOURS: {type: ArgumentType.NUMBER, defaultValue: 6}
                    }
                }
            ],
            menus: {
                UNITS: {acceptReporters: true, items: this._menu(['metric', 'imperial'])},
                NOW_READING: {acceptReporters: true, items: this._menu(NOW_READINGS)},
                FORECAST_READING: {acceptReporters: true, items: this._menu(FORECAST_READINGS)},
                CONDITION: {acceptReporters: true, items: this._menu(WeatherClient.CONDITIONS)}
            }
        }];
    }

    /**
     * Say what went wrong, once per message, on the console: a project that
     * looks the weather up in a loop must not open a dialog on every pass.
     * @param {Error} err - what went wrong.
     * @private
     */
    _warn (err) {
        const message = `Weather Sense: ${err && err.message ? err.message : err}`;
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
     * Show or hide the credit line OpenWeather's licence asks for wherever its
     * data is shown: small, in the stage's bottom-right corner, for as long as
     * the extension is holding weather data. It sits on the pen layer, above
     * the camera picture and below every sprite, so it never covers a
     * project's own artwork, and erasing the pen drawing does not remove it.
     * @param {boolean} visible - whether it should show.
     * @private
     */
    _showAttribution (visible) {
        const renderer = this.runtime.renderer;
        if (!renderer || visible === this._attributionShown) return;
        if (this._attributionDrawable === null) {
            if (!visible) return;
            try {
                const canvas = document.createElement('canvas');
                canvas.width = STAGE_WIDTH * CAPTION_RESOLUTION;
                canvas.height = STAGE_HEIGHT * CAPTION_RESOLUTION;
                const context = canvas.getContext('2d');
                context.scale(CAPTION_RESOLUTION, CAPTION_RESOLUTION);
                context.font = '11px "Helvetica Neue", Helvetica, Arial, sans-serif';
                const width = Math.ceil(context.measureText(ATTRIBUTION).width) + 10;
                const x = STAGE_WIDTH - width - 4;
                const y = STAGE_HEIGHT - 20;
                context.fillStyle = 'rgba(255, 255, 255, 0.85)';
                context.fillRect(x, y, width, 16);
                context.fillStyle = '#333333';
                context.textBaseline = 'middle';
                context.fillText(ATTRIBUTION, x + 5, y + 8.5);
                this._attributionSkin = renderer.createBitmapSkin(
                    context.getImageData(0, 0, canvas.width, canvas.height), CAPTION_RESOLUTION);
                this._attributionDrawable = renderer.createDrawable(StageLayering.PEN_LAYER);
                renderer.updateDrawableSkinId(this._attributionDrawable, this._attributionSkin);
                registerOverlay(this.runtime, this._attributionDrawable);
            } catch (err) {
                this._attributionDrawable = null;
                return;
            }
        }
        setOverlayVisible(this.runtime, this._attributionDrawable, visible);
        this._attributionShown = visible;
        this.runtime.requestRedraw();
    }

    // ------------------------------------------------------------ setup

    setKey (args) {
        if (this._client.setKey(args.KEY)) {
            if (this._status === STATUS.NO_KEY || this._status === STATUS.WRONG_KEY) {
                this._status = this._place ? STATUS.OK : STATUS.NO_PLACE;
            }
        } else if (!this._client.key) {
            this._status = STATUS.NO_KEY;
        }
    }

    setUnits (args) {
        this._units = plain(args.UNITS) === 'imperial' ? 'imperial' : 'metric';
    }

    // ------------------------------------------------------------ now

    _lookUp (place) {
        this._place = place;
        return this._client.current(place, this._units)
            .then(body => {
                this._now = WeatherClient.describeCurrent(body);
                this._status = STATUS.OK;
                this._showAttribution(true);
            })
            .catch(err => {
                this._now = null;
                this._showAttribution(false);
                this._fail(err);
            });
    }

    lookUpCity (args) {
        const city = Cast.toString(args.CITY).trim();
        if (!city) {
            this._now = null;
            this._fail(Object.assign(new Error('type a city name to look up'), {status: STATUS.NO_PLACE}));
            return;
        }
        return this._lookUp({q: city});
    }

    lookUpPosition (args) {
        const lat = Cast.toNumber(args.LAT);
        const lon = Cast.toNumber(args.LON);
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            this._now = null;
            this._fail(Object.assign(
                new Error('latitude goes from -90 to 90 and longitude from -180 to 180'),
                {status: STATUS.NOT_FOUND}
            ));
            return;
        }
        return this._lookUp({lat: String(lat), lon: String(lon)});
    }

    weatherNow (args) {
        return reading(this._now, args.READING);
    }

    isItNow (args) {
        return !!this._now && WeatherClient.isCondition(this._now.condition, plain(args.CONDITION));
    }

    lookupStatus () {
        return this._status;
    }

    // ------------------------------------------------------------ forecast

    /**
     * The forecast slot for some hours ahead, for the last looked-up place.
     * @param {*} hours - how far ahead.
     * @returns {Promise<?object>} - the readings, or null.
     * @private
     */
    _forecastSlot (hours) {
        if (!this._place) {
            this._fail(Object.assign(
                new Error('look up the weather for a place first; the forecast is for that place'),
                {status: STATUS.NO_PLACE}
            ));
            return Promise.resolve(null);
        }
        return this._client.forecast(this._place, this._units)
            .then(body => {
                this._status = STATUS.OK;
                this._showAttribution(true);
                return WeatherClient.describeForecast(body, Cast.toNumber(hours), Date.now());
            })
            .catch(err => {
                this._fail(err);
                return null;
            });
    }

    forecast (args) {
        return this._forecastSlot(args.HOURS).then(slot => reading(slot, args.READING));
    }

    willItBe (args) {
        return this._forecastSlot(args.HOURS)
            .then(slot => !!slot && WeatherClient.isCondition(slot.condition, plain(args.CONDITION)));
    }

    /**
     * Give back what this extension holds when it is removed: the credit
     * layer on the stage. With the extension gone no weather data is shown,
     * so the credit goes with it. Safe to call more than once.
     */
    dispose () {
        const renderer = this.runtime.renderer;
        if (renderer && this._attributionDrawable !== null) {
            unregisterOverlay(this.runtime, this._attributionDrawable);
            renderer.destroyDrawable(this._attributionDrawable, StageLayering.PEN_LAYER);
        }
        if (renderer && this._attributionSkin !== null) renderer.destroySkin(this._attributionSkin);
        this._attributionDrawable = null;
        this._attributionSkin = null;
        this._attributionShown = false;
        if (renderer) this.runtime.requestRedraw();
    }
}

module.exports = Scratch3WeatherSenseBlocks;
