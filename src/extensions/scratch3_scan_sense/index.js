/**
 * Scan Sense: reading QR codes through the camera, or off the stage.
 *
 * One block takes a picture and looks for a code in it; the reporters and
 * booleans read from that last scan, so a script that wants fresh answers
 * scans again inside its loop -- the same shape as the other Sense
 * extensions. Decoding runs in a worker (see scanner.js), so it works with
 * any board or none, offline, and does not stall the editor.
 *
 * The blocks, their wording, the artwork and this code are Robolab's own
 * design. The decoder is jsQR (Apache License 2.0); see scanner.js and
 * third-party-notices/ in the app. "QR Code" is a registered trademark of
 * DENSO WAVE INCORPORATED, which is why the blocks themselves only say
 * "code".
 */
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const Video = require('../../io/video');
const formatMessage = require('format-message');
const StageLayering = require('../../engine/stage-layering');
const {registerOverlay, unregisterOverlay, captureStage} = require('../../extension-support/stage-overlays');

const CodeScanner = require('./scanner');

const [STAGE_WIDTH, STAGE_HEIGHT] = Video.DIMENSIONS;

/** The colour of the outline drawn round a code, and of the category. */
const CATEGORY_COLOUR = '#7A55C9';

/** Scan corners round three squares: a code being read, drawn from scratch. */
const SCAN_PATHS = [
    '<path d="M5 12V7a2 2 0 0 1 2-2h5M28 5h5a2 2 0 0 1 2 2v5M35 28v5a2 2 0 0 1-2 2h-5M12 35H7a2 2 0 0 1-2-2v-5"/>',
    '<path d="M12 12h6v6h-6zM22 12h6v6h-6zM12 22h6v6h-6zM23 23h1.5M27 27h1.5"/>'
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
    SCAN_PATHS,
    '</g></svg>'
].join(''))}`;

const blockIconURI = iconURI(40, '#FFF', 2.6);
const menuIconURI = iconURI(20, CATEGORY_COLOUR, 3.2);

/** The points of a code a block can ask about. */
const POINTS = ['middle', 'top left', 'top right', 'bottom left', 'bottom right'];

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

class Scratch3ScanSenseBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this._scanner = new CodeScanner();

        /** What the last scan found, or null. */
        this._code = null;
        /** Scans in flight, by source, so that a loop does not pile them up. */
        this._pending = {camera: null, arena: null};

        this._showOutline = false;
        this._markerSkin = null;
        this._markerDrawable = null;
        this._markerCanvas = null;
        this._stageCanvas = null;
        this._lastWarning = '';

        this._onStopAll = () => this._clearOutline();
        this.runtime.on('PROJECT_STOP_ALL', this._onStopAll);
    }

    get EXTENSION_ID () {
        return 'scanSense';
    }

    get CAMERA_STATE_INFO () {
        return [
            {name: 'on', value: 'on'},
            {name: 'off', value: 'off'}
        ];
    }

    get OUTLINE_STATE_INFO () {
        return [
            {name: 'show', value: 'show'},
            {name: 'hide', value: 'hide'}
        ];
    }

    get SOURCE_INFO () {
        return [
            {name: 'camera', value: 'camera'},
            {name: 'arena', value: 'arena'}
        ];
    }

    get POINT_INFO () {
        return POINTS.map(name => ({name, value: name}));
    }

    _buildMenu (info) {
        return info.map(entry => ({text: entry.name, value: entry.value}));
    }

    getInfo () {
        return [{
            id: 'scanSense',
            name: formatMessage({
                id: 'scanSense.categoryName',
                default: 'Scan Sense',
                description: 'Label for the code scanning extension category'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            color1: CATEGORY_COLOUR,
            color2: '#6A48B3',
            color3: '#5B3C9C',
            blocks: [
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'scanSense.group.settings',
                        default: 'Settings',
                        description: 'palette heading above the camera blocks'
                    })
                },
                {
                    opcode: 'useCamera',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'scanSense.useCamera',
                        default: 'switch camera [STATE] with picture [FADE] % faded',
                        description: 'switch the camera picture on the stage on or off'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'CAMERA_STATE', defaultValue: 'on'},
                        FADE: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'showOutline',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'scanSense.showOutline',
                        default: '[STATE] code outline',
                        description: 'draw or hide the frame round a scanned code'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'OUTLINE_STATE', defaultValue: 'show'}
                    }
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'scanSense.group.scanning',
                        default: 'Scanning',
                        description: 'palette heading above the blocks that read a code'
                    })
                },
                {
                    opcode: 'scanFor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'scanSense.scanFor',
                        default: 'scan [SOURCE] for a code',
                        description: 'take a picture and look for a code in it'
                    }),
                    arguments: {
                        SOURCE: {type: ArgumentType.STRING, menu: 'SOURCE', defaultValue: 'arena'}
                    }
                },
                {
                    opcode: 'whenCodeSays',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'scanSense.whenCodeSays',
                        default: 'when a code saying [TEXT] is found',
                        description: 'runs once when a scan finds a code with this text; blank means any code'
                    }),
                    arguments: {
                        TEXT: {type: ArgumentType.STRING, defaultValue: 'go'}
                    }
                },
                {
                    opcode: 'isCodeFound',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'scanSense.isCodeFound',
                        default: 'code found?',
                        description: 'whether the last scan found a code'
                    })
                },
                {
                    opcode: 'codeText',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'scanSense.codeText',
                        default: 'code text',
                        description: 'what the code found by the last scan says'
                    })
                },
                {
                    opcode: 'codeSays',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'scanSense.codeSays',
                        default: 'code says [TEXT] ?',
                        description: 'whether the last scanned code has exactly this text, ignoring case'
                    }),
                    arguments: {
                        TEXT: {type: ArgumentType.STRING, defaultValue: 'go'}
                    }
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'scanSense.group.where',
                        default: 'Where It Is',
                        description: 'palette heading above the blocks about where a code is'
                    })
                },
                {
                    opcode: 'codeX',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'scanSense.codeX',
                        default: 'x of code [POINT]',
                        description: 'the stage x of a point of the scanned code'
                    }),
                    arguments: {
                        POINT: {type: ArgumentType.STRING, menu: 'POINT', defaultValue: 'middle'}
                    }
                },
                {
                    opcode: 'codeY',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'scanSense.codeY',
                        default: 'y of code [POINT]',
                        description: 'the stage y of a point of the scanned code'
                    }),
                    arguments: {
                        POINT: {type: ArgumentType.STRING, menu: 'POINT', defaultValue: 'middle'}
                    }
                },
                {
                    opcode: 'codeTilt',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'scanSense.codeTilt',
                        default: 'code tilt',
                        description: 'degrees the code is turned clockwise from upright, as seen on the stage'
                    })
                },
                {
                    opcode: 'codeSize',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'scanSense.codeSize',
                        default: 'code size',
                        description: 'how wide the code looks on the stage; bigger means closer'
                    })
                }
            ],
            menus: {
                CAMERA_STATE: {acceptReporters: true, items: this._buildMenu(this.CAMERA_STATE_INFO)},
                OUTLINE_STATE: {acceptReporters: true, items: this._buildMenu(this.OUTLINE_STATE_INFO)},
                SOURCE: {acceptReporters: true, items: this._buildMenu(this.SOURCE_INFO)},
                POINT: {acceptReporters: true, items: this._buildMenu(this.POINT_INFO)}
            }
        }];
    }

    // ------------------------------------------------------------ the camera

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

    showOutline (args) {
        this._showOutline = plain(args.STATE) !== 'hide';
        if (this._showOutline) this._drawOutline();
        else this._clearOutline();
    }

    // ------------------------------------------------------------ the scanning

    _workCanvas (key, width, height) {
        if (!this[key]) {
            this[key] = document.createElement('canvas');
        }
        const canvas = this[key];
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        return canvas;
    }

    /**
     * One picture to scan, unmirrored: a mirrored code still decodes, but
     * the decoder then reports its corners turned a quarter turn, so the
     * mirroring the preview shows is put back afterwards instead.
     * @param {string} source - 'camera' or 'arena'.
     * @returns {?ImageData} - the picture, or null if there is none.
     * @private
     */
    _grabFrame (source) {
        if (source === 'arena') {
            // Without any extension's marks in it, this outline included, which
            // would sit right against the code: see
            // extension-support/stage-overlays.js. A see-through stage is white
            // to the eye, so it is white here.
            const canvas = captureStage(this.runtime,
                this._workCanvas('_stageCanvas', STAGE_WIDTH, STAGE_HEIGHT), '#FFFFFF');
            return canvas && canvas.getContext('2d').getImageData(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
        }

        const video = this.runtime.ioDevices.video;
        if (!video) return null;
        return video.getFrame({
            format: Video.FORMAT_IMAGE_DATA,
            dimensions: Video.DIMENSIONS,
            mirror: false
        });
    }

    scanFor (args) {
        const source = plain(args.SOURCE) === 'arena' ? 'arena' : 'camera';
        if (this._pending[source]) return this._pending[source];

        const frame = this._grabFrame(source);
        if (!frame) {
            if (source === 'camera') {
                this._warn(new Error('the camera is off: use "switch camera on" before scanning it'));
            }
            this._setCode(null);
            return Promise.resolve();
        }
        const video = this.runtime.ioDevices.video;
        const mirrored = source === 'camera' && !!(video && video.mirror);

        const scan = this._scanner.scan(frame)
            .then(found => this._setCode(found ? Scratch3ScanSenseBlocks.describe(found, mirrored) : null))
            .catch(err => {
                this._setCode(null);
                this._warn(err);
            })
            .finally(() => {
                this._pending[source] = null;
            });
        this._pending[source] = scan;
        return scan;
    }

    /**
     * Turn the decoder's corners, in picture pixels, into what the blocks
     * report: stage coordinates as they appear on the stage.
     *
     * The camera preview is a mirror, so a picture scanned unmirrored is
     * flipped back here. Corner names are kept as they look on the stage:
     * hold a card upright and its "top left" is at the top left of the
     * picture you see, even though in the mirror that is the code's own
     * top-right corner. The tilt is measured along that visible top edge,
     * in degrees clockwise, so an upright code is 0 and a mirror reverses
     * which way a turn looks, just as a real mirror does.
     * @param {object} found - text and four corners from the scanner.
     * @param {boolean} mirrored - whether the stage shows the picture mirrored.
     * @returns {object} - the code as the blocks use it.
     */
    static describe (found, mirrored) {
        const flip = p => ({x: STAGE_WIDTH - p.x, y: p.y});
        const corners = mirrored ? {
            'top left': flip(found.topRight),
            'top right': flip(found.topLeft),
            'bottom left': flip(found.bottomRight),
            'bottom right': flip(found.bottomLeft)
        } : {
            'top left': found.topLeft,
            'top right': found.topRight,
            'bottom left': found.bottomLeft,
            'bottom right': found.bottomRight
        };
        const tl = corners['top left'];
        const tr = corners['top right'];
        const bl = corners['bottom left'];
        const br = corners['bottom right'];
        const pixels = Object.assign({
            middle: {x: (tl.x + tr.x + bl.x + br.x) / 4, y: (tl.y + tr.y + bl.y + br.y) / 4}
        }, corners);

        const points = {};
        Object.keys(pixels).forEach(name => {
            points[name] = {
                x: round(pixels[name].x - (STAGE_WIDTH / 2), 2),
                y: round((STAGE_HEIGHT / 2) - pixels[name].y, 2)
            };
        });
        const tilt = Math.atan2(tr.y - tl.y, tr.x - tl.x) * 180 / Math.PI;
        const width = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2;

        return {
            text: String(found.text),
            points,
            pixels,
            tilt: round(tilt, 1),
            size: round(width, 2)
        };
    }

    _setCode (code) {
        this._code = code;
        this._drawOutline();
    }

    // ------------------------------------------------------------ the answers

    /**
     * Whether the last scan found a code with this text. Blank text asks
     * about any code at all.
     * @param {*} text - the text to look for.
     * @returns {boolean} - true if it matches.
     * @private
     */
    _codeMatches (text) {
        if (!this._code) return false;
        const wanted = plain(text);
        return wanted === '' || plain(this._code.text) === wanted;
    }

    whenCodeSays (args) {
        return this._codeMatches(args.TEXT);
    }

    isCodeFound () {
        return this._code !== null;
    }

    codeText () {
        return this._code ? this._code.text : '';
    }

    codeSays (args) {
        return this._codeMatches(args.TEXT);
    }

    _point (name) {
        if (!this._code) return null;
        return this._code.points[plain(name)] || null;
    }

    codeX (args) {
        const point = this._point(args.POINT);
        return point ? point.x : 0;
    }

    codeY (args) {
        const point = this._point(args.POINT);
        return point ? point.y : 0;
    }

    codeTilt () {
        return this._code ? this._code.tilt : 0;
    }

    codeSize () {
        return this._code ? this._code.size : 0;
    }

    // ------------------------------------------------------------ the outline

    /**
     * Say what went wrong, once per message, on the console: a project that
     * scans inside a loop must not open a dialog on every pass.
     * @param {Error} err - what went wrong.
     * @private
     */
    _warn (err) {
        const message = `Scan Sense: ${err && err.message ? err.message : err}`;
        if (message === this._lastWarning) return;
        this._lastWarning = message;
        // eslint-disable-next-line no-console
        console.warn(message);
    }

    /**
     * Make the layer the outline is drawn on, once. The pen layer, as Body
     * Sense does, because it sits above the camera picture and below sprites.
     * @returns {boolean} - whether there is a layer to draw on.
     * @private
     */
    _ensureMarkerLayer () {
        const renderer = this.runtime.renderer;
        if (!renderer) return false;
        if (this._markerDrawable !== null) return true;
        try {
            this._markerSkin = renderer.createBitmapSkin(new ImageData(STAGE_WIDTH, STAGE_HEIGHT), 1);
            this._markerDrawable = renderer.createDrawable(StageLayering.PEN_LAYER);
            renderer.updateDrawableSkinId(this._markerDrawable, this._markerSkin);
            registerOverlay(this.runtime, this._markerDrawable);
        } catch (err) {
            this._markerDrawable = null;
            return false;
        }
        return true;
    }

    _drawOutline () {
        if (!this._showOutline) return;
        if (!this._ensureMarkerLayer()) return;

        const canvas = this._workCanvas('_markerCanvas', STAGE_WIDTH, STAGE_HEIGHT);
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

        const code = this._code;
        if (code) {
            const p = code.pixels;
            context.lineWidth = 4;
            context.lineJoin = 'round';
            context.strokeStyle = CATEGORY_COLOUR;
            context.beginPath();
            context.moveTo(p['top left'].x, p['top left'].y);
            context.lineTo(p['top right'].x, p['top right'].y);
            context.lineTo(p['bottom right'].x, p['bottom right'].y);
            context.lineTo(p['bottom left'].x, p['bottom left'].y);
            context.closePath();
            context.stroke();
            // A dot on the top-left corner, so the tilt can be read by eye.
            context.fillStyle = '#FFFFFF';
            context.beginPath();
            context.arc(p['top left'].x, p['top left'].y, 5, 0, Math.PI * 2);
            context.fill();
            context.stroke();
        }

        this.runtime.renderer.updateBitmapSkin(
            this._markerSkin,
            context.getImageData(0, 0, STAGE_WIDTH, STAGE_HEIGHT),
            1
        );
        this.runtime.requestRedraw();
    }

    _clearOutline () {
        if (this._markerSkin === null || !this.runtime.renderer) return;
        this.runtime.renderer.updateBitmapSkin(this._markerSkin, new ImageData(STAGE_WIDTH, STAGE_HEIGHT), 1);
        this.runtime.requestRedraw();
    }

    /**
     * Give back everything this extension holds when it is removed: the
     * decoding worker, the outline layer and the stop-sign listener. Safe to
     * call more than once; a scan afterwards simply starts a new worker.
     */
    dispose () {
        this.runtime.removeListener('PROJECT_STOP_ALL', this._onStopAll);
        this._scanner.dispose();
        const renderer = this.runtime.renderer;
        if (renderer && this._markerDrawable !== null) {
            unregisterOverlay(this.runtime, this._markerDrawable);
            renderer.destroyDrawable(this._markerDrawable, StageLayering.PEN_LAYER);
        }
        if (renderer && this._markerSkin !== null) renderer.destroySkin(this._markerSkin);
        this._markerDrawable = null;
        this._markerSkin = null;
        this._code = null;
        if (renderer) this.runtime.requestRedraw();
    }
}

module.exports = Scratch3ScanSenseBlocks;
