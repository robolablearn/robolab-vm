/**
 * Vision Sense: finding things, naming pictures and reading printed text.
 *
 * One block takes a picture -- from the camera, off the stage, from the
 * camera after a countdown, or from a web address -- and looks in it for one
 * kind of thing: objects with their boxes, labels for the picture as a whole,
 * or printed words. The reporters read from that last look, the same
 * "look, then read" shape as the other Sense extensions.
 *
 * Everything runs on this computer, offline except for downloading a picture
 * from a web address:
 *
 * - objects: Object Sense's detector and model, reused, not copied;
 * - picture labels: MediaPipe's image classifier (labeler.js);
 * - printed text: Tesseract (text-reader.js).
 *
 * Deliberately not included: famous-landmark and celebrity recognition. The
 * first needs a cloud service or models far too large to ship; the second is
 * face recognition of real people, which is a privacy and legal risk that an
 * extension for children should not carry.
 *
 * The blocks, their wording, the artwork and this code are Robolab's own
 * design; the models and engines are open source (see the notices shipped in
 * external-resources/visionSense and third-party-notices/).
 */
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const Video = require('../../io/video');
const formatMessage = require('format-message');
const StageLayering = require('../../engine/stage-layering');
const {registerOverlay, unregisterOverlay, captureStage} = require('../../extension-support/stage-overlays');

const ObjectDetector = require('../scratch3_object_sense/detector');
const PictureLabeler = require('./labeler');
const TextReader = require('./text-reader');
const PictureLoader = require('./picture-loader');

const [STAGE_WIDTH, STAGE_HEIGHT] = Video.DIMENSIONS;

const CATEGORY_COLOUR = '#3E5C76';

/** Pictures are looked at at twice the stage's size, in its 4:3 shape. */
const PICTURE_WIDTH = STAGE_WIDTH * 2;
const PICTURE_HEIGHT = STAGE_HEIGHT * 2;

/** The camera is asked for its own usual size rather than the stage's. */
const CAMERA_DIMENSIONS = [640, 480];

/** The marks layer is drawn at twice the stage's resolution, for sharp text. */
const MARK_RESOLUTION = 2;

const MAX_COUNTDOWN_SECONDS = 10;

/** Object Sense's detector has no idle release of its own; this one gives it one. */
const OBJECT_IDLE_RELEASE_MS = 2 * 60 * 1000;

const KINDS = [
    {name: 'objects', value: 'objects'},
    {name: 'picture labels', value: 'labels'},
    {name: 'printed text', value: 'text'}
];

const PROPERTIES = ['name', 'confidence', 'x', 'y', 'width', 'height'];

const STATUS = Object.assign({
    READY: 'ready',
    OK: 'ok',
    CAMERA_OFF: 'camera is off',
    NO_STAGE: 'no stage',
    STOPPED: 'stopped',
    NOT_INSTALLED: 'not installed',
    FAILED: 'failed'
}, PictureLoader.STATUS);

/** An eye inside scan corners. */
const VISION_PATHS = [
    '<path d="M5 11V7a2 2 0 0 1 2-2h4M29 5h4a2 2 0 0 1 2 2v4M35 29v4a2 2 0 0 1-2 2h-4M11 35H7a2 2 0 0 1-2-2v-4"/>',
    '<path d="M8 20c3.2-5 7.2-7.5 12-7.5S28.8 15 32 20c-3.2 5-7.2 7.5-12 7.5S11.2 25 8 20z"/>',
    '<circle cx="20" cy="20" r="3.6"/>'
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
    VISION_PATHS,
    '</g></svg>'
].join(''))}`;

/**
 * Text as blocks compare it: spare spaces gone, case ignored.
 * @param {*} value - anything a block might hand over.
 * @returns {string} - the text.
 */
const plain = value => Cast.toString(value)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const round = (value, places) => {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
};

/**
 * A kind from a block, by value or by menu text.
 * @param {*} value - what the block holds.
 * @returns {string} - 'objects', 'labels' or 'text'.
 */
const kindOf = value => {
    const wanted = plain(value);
    const match = KINDS.find(kind => kind.value === wanted || kind.name === wanted);
    if (match) return match.value;
    if (/label|what|thing/.test(wanted)) return 'labels';
    if (/text|word|read/.test(wanted)) return 'text';
    return 'objects';
};

/**
 * A box flipped left to right, for a picture shown mirrored.
 * @param {?object} box - fractions of the picture, or null.
 * @returns {?object} - the flipped box.
 */
const mirrorBox = box => (box ? {left: 1 - box.right, right: 1 - box.left, top: box.top, bottom: box.bottom} : null);

/**
 * Whether a word or phrase appears, whole, in some text.
 * @param {string} text - where to look.
 * @param {string} wanted - what to look for, already plain.
 * @returns {boolean} - true if it is there.
 */
const containsWhole = (text, wanted) => {
    if (!wanted) return false;
    const haystack = ` ${plain(text).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
    const needle = wanted.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    return needle !== '' && haystack.includes(` ${needle} `);
};

class Scratch3VisionSenseBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this._objects = new ObjectDetector();
        this._labeler = new PictureLabeler();
        this._reader = new TextReader();
        this._loader = new PictureLoader();

        /** What the last look found. */
        this._results = {kind: 'objects', items: [], text: '', picture: null};
        this._status = STATUS.READY;
        this._minConfidence = 0.5;

        /** Looks run one after another, so two scripts cannot tangle a model. */
        this._queue = Promise.resolve();
        this._objectsBusy = false;
        this._objectIdleTimer = null;
        this._countdowns = new Set();

        this._showMarks = false;
        this._markSkin = null;
        this._markDrawable = null;
        this._markCanvas = null;
        this._stageCanvas = null;
        this._cameraCanvas = null;
        this._lastWarning = '';

        this._onStopAll = () => {
            this._cancelCountdowns();
            this._clearMarks();
        };
        this.runtime.on('PROJECT_STOP_ALL', this._onStopAll);
    }

    get EXTENSION_ID () {
        return 'visionSense';
    }

    _menu (entries) {
        return entries.map(entry => (typeof entry === 'string' ?
            {text: entry, value: entry} :
            {text: entry.name, value: entry.value}));
    }

    getInfo () {
        return [{
            id: 'visionSense',
            name: formatMessage({
                id: 'visionSense.categoryName',
                default: 'Vision Sense',
                description: 'Label for the picture recognition extension category'
            }),
            blockIconURI: iconURI(40, '#FFF', 2.6),
            menuIconURI: iconURI(20, CATEGORY_COLOUR, 3),
            color1: CATEGORY_COLOUR,
            color2: '#354F66',
            color3: '#2C4255',
            blocks: [
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'visionSense.group.settings',
                        default: 'Settings',
                        description: 'palette heading above the camera and marks blocks'
                    })
                },
                {
                    opcode: 'useCamera',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'visionSense.useCamera',
                        default: 'switch camera [STATE] with picture [FADE] % faded',
                        description: 'switch the camera picture on the stage on or off'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'CAMERA_STATE', defaultValue: 'on'},
                        FADE: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'showMarks',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'visionSense.showMarks',
                        default: '[STATE] boxes and names on the stage',
                        description: 'draw or hide what the last look found'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'MARK_STATE', defaultValue: 'show'}
                    }
                },
                {
                    opcode: 'setConfidence',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'visionSense.setConfidence',
                        default: 'only keep results at least [LEVEL] % sure',
                        description: 'results the models are less sure of than this are left out'
                    }),
                    arguments: {
                        LEVEL: {type: ArgumentType.NUMBER, defaultValue: 50}
                    }
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'visionSense.group.look',
                        default: 'Look',
                        description: 'palette heading above the blocks that take and look at a picture'
                    })
                },
                {
                    opcode: 'findIn',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'visionSense.findIn',
                        default: 'find [KIND] in [SOURCE]',
                        description: 'take a picture from the camera or the stage and look in it'
                    }),
                    arguments: {
                        KIND: {type: ArgumentType.STRING, menu: 'KIND', defaultValue: 'objects'},
                        SOURCE: {type: ArgumentType.STRING, menu: 'SOURCE', defaultValue: 'arena'}
                    }
                },
                {
                    opcode: 'findAfterCountdown',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'visionSense.findAfterCountdown',
                        default: 'count down [SECONDS] then find [KIND] in a camera picture',
                        description: 'show a countdown on the stage, then take a camera picture and look in it'
                    }),
                    arguments: {
                        SECONDS: {type: ArgumentType.NUMBER, defaultValue: 3},
                        KIND: {type: ArgumentType.STRING, menu: 'KIND', defaultValue: 'objects'}
                    }
                },
                {
                    opcode: 'findAtAddress',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'visionSense.findAtAddress',
                        default: 'find [KIND] in the picture at web address [ADDRESS]',
                        description: 'download a picture and look in it'
                    }),
                    arguments: {
                        KIND: {type: ArgumentType.STRING, menu: 'KIND', defaultValue: 'labels'},
                        ADDRESS: {type: ArgumentType.STRING, defaultValue: ''}
                    }
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'visionSense.group.results',
                        default: 'Results',
                        description: 'palette heading above the blocks that read what was found'
                    })
                },
                {
                    opcode: 'resultCount',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'visionSense.resultCount',
                        default: 'number of results',
                        description: 'how many things, labels or words the last look found'
                    })
                },
                {
                    opcode: 'resultProperty',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'visionSense.resultProperty',
                        default: '[PROPERTY] of result [INDEX]',
                        description: 'one detail of one result; results with a box are counted left to right'
                    }),
                    arguments: {
                        PROPERTY: {type: ArgumentType.STRING, menu: 'PROPERTY', defaultValue: 'name'},
                        INDEX: {type: ArgumentType.NUMBER, defaultValue: 1}
                    }
                },
                {
                    opcode: 'allResults',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'visionSense.allResults',
                        default: 'everything found, as text',
                        description: 'the names found, the labels, or the text that was read'
                    })
                },
                {
                    opcode: 'wasFound',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'visionSense.wasFound',
                        default: 'was [WORD] found ?',
                        description: 'whether a result, or the text read, has this word'
                    }),
                    arguments: {
                        WORD: {type: ArgumentType.STRING, defaultValue: 'cup'}
                    }
                },
                {
                    opcode: 'visionStatus',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'visionSense.visionStatus',
                        default: 'vision status',
                        description: 'ok, or what went wrong with the last look'
                    })
                }
            ],
            menus: {
                CAMERA_STATE: {acceptReporters: true, items: this._menu(['on', 'off'])},
                MARK_STATE: {acceptReporters: true, items: this._menu(['show', 'hide'])},
                KIND: {acceptReporters: true, items: this._menu(KINDS)},
                SOURCE: {acceptReporters: true, items: this._menu(['camera', 'arena'])},
                PROPERTY: {acceptReporters: true, items: this._menu(PROPERTIES)}
            }
        }];
    }

    /**
     * Say what went wrong, once per message, on the console: a project that
     * looks inside a loop must not open a dialog on every pass.
     * @param {Error} err - what went wrong.
     * @private
     */
    _warn (err) {
        const message = `Vision Sense: ${err && err.message ? err.message : err}`;
        if (message === this._lastWarning) return;
        this._lastWarning = message;
        // eslint-disable-next-line no-console
        console.warn(message);
    }

    _fail (err) {
        if (err && err.status) {
            this._status = err.status;
        } else if (err && /not installed/.test(err.message)) {
            this._status = STATUS.NOT_INSTALLED;
        } else {
            this._status = STATUS.FAILED;
        }
        this._warn(err);
    }

    // ------------------------------------------------------------ settings

    useCamera (args) {
        const video = this.runtime.ioDevices.video;
        if (!video) return;
        if (plain(args.STATE) === 'off') {
            video.disableVideo();
            return;
        }
        video.enableVideo();
        video.mirror = true;
        // Scratch calls this a ghost: 0 % faded is a fully solid picture.
        video.setPreviewGhost(Cast.toNumber(args.FADE));
    }

    showMarks (args) {
        this._showMarks = plain(args.STATE) !== 'hide';
        if (this._showMarks) this._drawMarks();
        else this._clearMarks();
    }

    setConfidence (args) {
        const level = Math.max(1, Math.min(100, Cast.toNumber(args.LEVEL))) / 100;
        this._minConfidence = level;
        return this._objects.setConfidence(level);
    }

    // ------------------------------------------------------------ pictures

    _workCanvas (key, width, height) {
        if (!this[key]) this[key] = document.createElement('canvas');
        const canvas = this[key];
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        return canvas;
    }

    /**
     * A camera picture, unmirrored: printed text in a mirror cannot be read,
     * so every kind looks at the picture the right way round and the boxes
     * are flipped afterwards to match the mirrored preview.
     * @returns {?object} - {canvas, mirrored, shown}, or null with the status set.
     * @private
     */
    _grabCamera () {
        const video = this.runtime.ioDevices.video;
        const frame = video && video.getFrame({
            format: Video.FORMAT_CANVAS,
            dimensions: CAMERA_DIMENSIONS,
            mirror: false
        });
        if (!frame) {
            this._status = STATUS.CAMERA_OFF;
            this._warn(new Error('the camera is off: use "switch camera on" first'));
            return null;
        }
        // A copy: the camera redraws its own canvas for every frame.
        const canvas = this._workCanvas('_cameraCanvas', CAMERA_DIMENSIONS[0], CAMERA_DIMENSIONS[1]);
        canvas.getContext('2d').drawImage(frame, 0, 0);
        return {canvas, mirrored: !!video.mirror, shown: null};
    }

    /**
     * The stage as it looks, without any extension's marks on it: see
     * extension-support/stage-overlays.js.
     * @returns {?object} - {canvas, mirrored, shown}, or null with the status set.
     * @private
     */
    _grabStage () {
        const canvas = captureStage(this.runtime,
            this._workCanvas('_stageCanvas', PICTURE_WIDTH, PICTURE_HEIGHT), '#FFFFFF');
        if (!canvas) {
            this._status = STATUS.NO_STAGE;
            return null;
        }
        return {canvas, mirrored: false, shown: null};
    }

    // ------------------------------------------------------------ looking

    /**
     * Look for one kind of thing in a picture from somewhere, one look at a
     * time, and keep what was found.
     * @param {*} kindValue - the kind, from a block.
     * @param {Function} getPicture - gives {canvas, mirrored, shown}, maybe
     *                               asynchronously; null if there is none.
     * @returns {Promise} - resolved when the look is over.
     * @private
     */
    _look (kindValue, getPicture) {
        const kind = kindOf(kindValue);
        const run = async () => {
            let picture = null;
            try {
                picture = await getPicture();
            } catch (err) {
                this._keep(kind, [], '', null);
                this._fail(err);
                return;
            }
            if (!picture) {
                this._keep(kind, [], '', null);
                return;
            }
            try {
                const found = await this._recognise(kind, picture.canvas);
                const items = picture.mirrored ?
                    found.items.map(item => Object.assign({}, item, {box: mirrorBox(item.box)})) :
                    found.items;
                if (kind !== 'labels') items.sort((a, b) => a.box.left - b.box.left);
                this._keep(kind, items, found.text, picture.shown);
                this._status = STATUS.OK;
            } catch (err) {
                this._keep(kind, [], '', picture.shown);
                this._fail(err);
            }
        };
        const job = this._queue.then(run, run);
        this._queue = job.catch(() => null);
        return job;
    }

    /**
     * Ask the right model about a picture.
     * @param {string} kind - 'objects', 'labels' or 'text'.
     * @param {HTMLCanvasElement} canvas - the picture.
     * @returns {Promise<{items: Array, text: string}>} - what was found.
     * @private
     */
    async _recognise (kind, canvas) {
        const sure = item => item.score >= this._minConfidence;
        if (kind === 'labels') {
            const items = (await this._labeler.label(canvas))
                .filter(sure)
                .map(label => ({name: label.name, score: label.score, box: null}));
            return {items, text: items.map(item => item.name).join(', ')};
        }
        if (kind === 'text') {
            const read = await this._reader.read(canvas);
            return {items: read.words.filter(sure), text: read.text};
        }
        this._objectsBusy = true;
        this._cancelObjectRelease();
        try {
            const items = (await this._objects.scan(canvas))
                .filter(sure)
                .map(object => ({name: object.name, score: object.score, box: object.box}));
            return {items, text: items.map(item => item.name).join(', ')};
        } finally {
            this._objectsBusy = false;
            this._armObjectRelease();
        }
    }

    _keep (kind, items, text, shown) {
        this._results = {kind, items, text: String(text || '').trim(), picture: shown};
        this._drawMarks();
    }

    _cancelObjectRelease () {
        if (this._objectIdleTimer !== null) {
            clearTimeout(this._objectIdleTimer);
            this._objectIdleTimer = null;
        }
    }

    _armObjectRelease () {
        this._cancelObjectRelease();
        this._objectIdleTimer = setTimeout(() => {
            this._objectIdleTimer = null;
            if (this._objectsBusy) this._armObjectRelease();
            else this._objects.dispose();
        }, OBJECT_IDLE_RELEASE_MS);
    }

    findIn (args) {
        const fromStage = plain(args.SOURCE) === 'arena' || plain(args.SOURCE) === 'stage';
        return this._look(args.KIND, () => (fromStage ? this._grabStage() : this._grabCamera()));
    }

    findAtAddress (args) {
        return this._look(args.KIND, async () => {
            const canvas = await this._loader.load(args.ADDRESS);
            return {canvas, mirrored: false, shown: canvas};
        });
    }

    findAfterCountdown (args) {
        const seconds = Math.max(0, Math.min(MAX_COUNTDOWN_SECONDS, Math.round(Cast.toNumber(args.SECONDS))));
        return this._countDown(seconds).then(carryOn => {
            if (!carryOn) {
                this._status = STATUS.STOPPED;
                return;
            }
            return this._look(args.KIND, () => this._grabCamera());
        });
    }

    /**
     * Show a countdown on the stage, a second per number.
     * @param {number} seconds - where to start.
     * @returns {Promise<boolean>} - true when it reaches zero, false if the project was stopped.
     * @private
     */
    _countDown (seconds) {
        return new Promise(resolve => {
            let left = seconds;
            const entry = {timer: null, finish: null};
            const finish = carryOn => {
                clearTimeout(entry.timer);
                this._countdowns.delete(entry);
                this._drawMarks();
                resolve(carryOn);
            };
            entry.finish = finish;
            const tick = () => {
                if (left <= 0) {
                    finish(true);
                    return;
                }
                this._drawCountdown(left);
                left -= 1;
                entry.timer = setTimeout(tick, 1000);
            };
            this._countdowns.add(entry);
            tick();
        });
    }

    _cancelCountdowns () {
        Array.from(this._countdowns).forEach(entry => entry.finish(false));
    }

    // ------------------------------------------------------------ results

    resultCount () {
        return this._results.items.length;
    }

    resultProperty (args) {
        const property = plain(args.PROPERTY);
        const item = this._results.items[Math.round(Cast.toNumber(args.INDEX)) - 1];
        if (!item) return property === 'name' ? '' : 0;
        const box = item.box;
        switch (property) {
        case 'name':
            return item.name;
        case 'confidence':
            return Math.round(item.score * 100);
        case 'x':
            return box ? round((((box.left + box.right) / 2) - 0.5) * STAGE_WIDTH, 2) : 0;
        case 'y':
            return box ? round((0.5 - ((box.top + box.bottom) / 2)) * STAGE_HEIGHT, 2) : 0;
        case 'width':
            return round(box ? (box.right - box.left) * STAGE_WIDTH : STAGE_WIDTH, 2);
        case 'height':
            return round(box ? (box.bottom - box.top) * STAGE_HEIGHT : STAGE_HEIGHT, 2);
        default:
            return '';
        }
    }

    allResults () {
        return this._results.text;
    }

    wasFound (args) {
        const wanted = plain(args.WORD);
        if (!wanted) return false;
        return containsWhole(this._results.text, wanted) ||
            this._results.items.some(item => containsWhole(item.name, wanted));
    }

    visionStatus () {
        return this._status;
    }

    // ------------------------------------------------------------ marks

    _ensureMarkLayer () {
        const renderer = this.runtime.renderer;
        if (!renderer) return false;
        if (this._markDrawable !== null) return true;
        try {
            this._markSkin = renderer.createBitmapSkin(
                new ImageData(STAGE_WIDTH * MARK_RESOLUTION, STAGE_HEIGHT * MARK_RESOLUTION), MARK_RESOLUTION);
            this._markDrawable = renderer.createDrawable(StageLayering.PEN_LAYER);
            renderer.updateDrawableSkinId(this._markDrawable, this._markSkin);
            registerOverlay(this.runtime, this._markDrawable);
        } catch (err) {
            this._markDrawable = null;
            return false;
        }
        return true;
    }

    _publishMarks (context) {
        const canvas = context.canvas;
        this.runtime.renderer.updateBitmapSkin(
            this._markSkin, context.getImageData(0, 0, canvas.width, canvas.height), MARK_RESOLUTION);
        this.runtime.requestRedraw();
    }

    _markContext () {
        if (!this._ensureMarkLayer()) return null;
        const canvas = this._workCanvas('_markCanvas', STAGE_WIDTH * MARK_RESOLUTION, STAGE_HEIGHT * MARK_RESOLUTION);
        const context = canvas.getContext('2d');
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.scale(MARK_RESOLUTION, MARK_RESOLUTION);
        return context;
    }

    /**
     * A name tag: a filled strip with white text, kept inside the stage.
     * @param {CanvasRenderingContext2D} context - where to draw.
     * @param {string} text - the tag.
     * @param {number} x - left edge, stage pixels from the left.
     * @param {number} y - bottom edge, stage pixels from the top.
     * @private
     */
    static _tag (context, text, x, y) {
        context.font = 'bold 11px "Helvetica Neue", Helvetica, Arial, sans-serif';
        const width = Math.ceil(context.measureText(text).width) + 8;
        const left = Math.max(0, Math.min(STAGE_WIDTH - width, x));
        const top = Math.max(0, Math.min(STAGE_HEIGHT - 16, y - 16));
        context.fillStyle = CATEGORY_COLOUR;
        context.fillRect(left, top, width, 16);
        context.fillStyle = '#FFFFFF';
        context.textBaseline = 'middle';
        context.fillText(text, left + 4, top + 8.5);
    }

    _drawMarks () {
        if (!this._showMarks || this._countdowns.size > 0) return;
        const context = this._markContext();
        if (!context) return;
        const {items, picture, kind} = this._results;
        // A picture from a web address is shown under its marks: there is no
        // other way to see what was looked at.
        if (picture) context.drawImage(picture, 0, 0, STAGE_WIDTH, STAGE_HEIGHT);

        context.lineWidth = kind === 'text' ? 1.5 : 3;
        context.strokeStyle = CATEGORY_COLOUR;
        items.forEach(item => {
            if (!item.box) return;
            const x = item.box.left * STAGE_WIDTH;
            const y = item.box.top * STAGE_HEIGHT;
            context.strokeRect(x, y, (item.box.right - item.box.left) * STAGE_WIDTH,
                (item.box.bottom - item.box.top) * STAGE_HEIGHT);
            if (kind === 'objects') {
                Scratch3VisionSenseBlocks._tag(context, `${item.name} ${Math.round(item.score * 100)}%`, x, y);
            }
        });
        if (kind === 'labels') {
            items.forEach((item, i) => {
                const tag = `${item.name} ${Math.round(item.score * 100)}%`;
                Scratch3VisionSenseBlocks._tag(context, tag, 6, 22 + (i * 18));
            });
        }
        this._publishMarks(context);
    }

    _drawCountdown (number) {
        const context = this._markContext();
        if (!context) return;
        context.fillStyle = 'rgba(0, 0, 0, 0.35)';
        context.beginPath();
        context.arc(STAGE_WIDTH / 2, STAGE_HEIGHT / 2, 56, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#FFFFFF';
        context.font = 'bold 72px "Helvetica Neue", Helvetica, Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(String(number), STAGE_WIDTH / 2, (STAGE_HEIGHT / 2) + 4);
        context.textAlign = 'start';
        this._publishMarks(context);
    }

    _clearMarks () {
        if (this._markSkin === null || !this.runtime.renderer) return;
        this.runtime.renderer.updateBitmapSkin(this._markSkin,
            new ImageData(STAGE_WIDTH * MARK_RESOLUTION, STAGE_HEIGHT * MARK_RESOLUTION), MARK_RESOLUTION);
        this.runtime.requestRedraw();
    }

    /**
     * Give back everything this extension holds when it is removed: the three
     * recognisers and their workers, countdowns, the marks layer and the
     * stop-sign listener. Safe to call more than once; anything used again
     * afterwards is simply loaded again.
     */
    dispose () {
        this.runtime.removeListener('PROJECT_STOP_ALL', this._onStopAll);
        this._cancelCountdowns();
        this._cancelObjectRelease();
        this._objects.dispose();
        this._labeler.dispose();
        this._reader.dispose();
        const renderer = this.runtime.renderer;
        if (renderer && this._markDrawable !== null) {
            unregisterOverlay(this.runtime, this._markDrawable);
            renderer.destroyDrawable(this._markDrawable, StageLayering.PEN_LAYER);
        }
        if (renderer && this._markSkin !== null) renderer.destroySkin(this._markSkin);
        this._markDrawable = null;
        this._markSkin = null;
        this._results = {kind: 'objects', items: [], text: '', picture: null};
        if (renderer) this.runtime.requestRedraw();
    }
}

Scratch3VisionSenseBlocks.STATUS = STATUS;
Scratch3VisionSenseBlocks.kindOf = kindOf;
Scratch3VisionSenseBlocks.containsWhole = containsWhole;
Scratch3VisionSenseBlocks.mirrorBox = mirrorBox;

module.exports = Scratch3VisionSenseBlocks;
