/**
 * Object Sense: spot everyday things through the camera and say what they are.
 *
 * Looking happens in the editor, with a MediaPipe object detector, so it works
 * with any board or none. One block takes a picture and finds the objects in
 * it; the reporters read the objects from that last look, so a script that
 * wants fresh answers looks again inside its loop.
 */
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const Video = require('../../io/video');
const formatMessage = require('format-message');
const StageLayering = require('../../engine/stage-layering');
const {registerOverlay, unregisterOverlay, captureStage} = require('../../extension-support/stage-overlays');

const ObjectDetector = require('./detector');

const [STAGE_WIDTH, STAGE_HEIGHT] = Video.DIMENSIONS;

/** The colour of the boxes drawn round objects, and of the category. */
const CATEGORY_COLOUR = '#3169C6';

const blockIconURI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
    '<g fill="none" stroke="#FFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6 13V8.5A2.5 2.5 0 0 1 8.5 6H13M27 6h4.5A2.5 2.5 0 0 1 34 8.5V13' +
    'M34 27v4.5a2.5 2.5 0 0 1-2.5 2.5H27M13 34H8.5A2.5 2.5 0 0 1 6 31.5V27"/>' +
    '<rect x="12" y="15" width="16" height="11" rx="2"/>' +
    '</g><circle cx="20" cy="20.5" r="2.2" fill="#FFF"/></svg>'
)}`;

const menuIconURI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 40 40">' +
    `<g fill="none" stroke="${CATEGORY_COLOUR}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">` +
    '<path d="M6 13V8.5A2.5 2.5 0 0 1 8.5 6H13M27 6h4.5A2.5 2.5 0 0 1 34 8.5V13' +
    'M34 27v4.5a2.5 2.5 0 0 1-2.5 2.5H27M13 34H8.5A2.5 2.5 0 0 1 6 31.5V27"/>' +
    '<rect x="12" y="15" width="16" height="11" rx="2"/>' +
    `</g><circle cx="20" cy="20.5" r="2.4" fill="${CATEGORY_COLOUR}"/></svg>`
)}`;

class Scratch3ObjectSenseBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this._detector = new ObjectDetector();

        /** What the last look found, left to right. */
        this._objects = [];

        this._showOutlines = false;
        this._outlineSkin = null;
        this._outlineDrawable = null;
        // Working canvases, kept rather than remade every frame.
        this._outlineCanvas = null;
        this._stageCanvas = null;

        this._onStopAll = () => this._clearOutlines();
        this.runtime.on('PROJECT_STOP_ALL', this._onStopAll);
    }

    get EXTENSION_ID () {
        return 'objectSense';
    }

    /**
     * A point in the picture, 0-1 each way from the top left, as a stage
     * coordinate: x -240..240, y 180..-180.
     * @param {number} x - 0-1 across the picture.
     * @param {number} y - 0-1 down the picture.
     * @returns {{x: number, y: number}} - the stage coordinate.
     */
    static toStage (x, y) {
        return {
            x: (x - 0.5) * STAGE_WIDTH,
            y: (0.5 - y) * STAGE_HEIGHT
        };
    }

    get CAMERA_STATE_INFO () {
        return [
            {name: 'on', value: 'on'},
            {name: 'off', value: 'off'}
        ];
    }

    get BOX_STATE_INFO () {
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

    get PROPERTY_INFO () {
        return [
            {name: 'name', value: 'name'},
            {name: 'x position', value: 'x'},
            {name: 'y position', value: 'y'},
            {name: 'width', value: 'width'},
            {name: 'height', value: 'height'},
            {name: 'confidence %', value: 'confidence'}
        ];
    }

    /**
     * Minimum confidences, coarse on purpose. Below 0.1 everything is an
     * object and above 0.9 nothing is; the useful range sits in between.
     * @returns {Array} - menu entries.
     */
    get THRESHOLD_INFO () {
        return Array.from({length: 9}, (_, i) => {
            const level = ((i + 1) / 10).toFixed(1);
            return {name: level, value: level};
        });
    }

    /** @returns {Array} - which object, counted from the left. */
    get OBJECT_INDEX_INFO () {
        return Array.from({length: ObjectDetector.MAX_OBJECTS}, (_, i) => ({
            name: String(i + 1), value: String(i + 1)
        }));
    }

    /** @returns {Array} - everything the model can name. */
    get CLASS_INFO () {
        return ObjectDetector.LABELS.map(name => ({name, value: name}));
    }

    _buildMenu (info) {
        return info.map(entry => ({text: entry.name, value: entry.value}));
    }

    getInfo () {
        return [{
            id: 'objectSense',
            name: formatMessage({
                id: 'objectSense.categoryName',
                default: 'Object Sense',
                description: 'Label for the object sensing extension category'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            color1: CATEGORY_COLOUR,
            color2: '#2A5AAB',
            color3: '#234B8F',
            blocks: [
                {
                    opcode: 'useCamera',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'objectSense.useCamera',
                        default: 'turn camera [STATE] with [FADE] % see-through',
                        description: 'switch the camera picture on the stage on or off'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'CAMERA_STATE', defaultValue: 'on'},
                        FADE: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'showBoxes',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'objectSense.showBoxes',
                        default: '[STATE] boxes around objects',
                        description: 'draw or hide a labelled box round each object found'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'BOX_STATE', defaultValue: 'show'}
                    }
                },
                {
                    opcode: 'setConfidence',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'objectSense.setConfidence',
                        default: 'set minimum confidence to [LEVEL]',
                        description: 'how sure the detector must be before it reports an object'
                    }),
                    arguments: {
                        LEVEL: {type: ArgumentType.STRING, menu: 'THRESHOLD', defaultValue: '0.5'}
                    }
                },
                {
                    opcode: 'lookForObjects',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'objectSense.lookForObjects',
                        default: 'look for objects in [SOURCE]',
                        description: 'take a picture and find the objects in it'
                    }),
                    arguments: {
                        SOURCE: {type: ArgumentType.STRING, menu: 'SOURCE', defaultValue: 'arena'}
                    }
                },
                {
                    opcode: 'objectCount',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'objectSense.objectCount',
                        default: 'number of objects found',
                        description: 'how many objects the last look found'
                    })
                },
                {
                    opcode: 'objectProperty',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'objectSense.objectProperty',
                        default: '[PROPERTY] of object [INDEX]',
                        description: 'the name, position, size or confidence of one object'
                    }),
                    arguments: {
                        PROPERTY: {type: ArgumentType.STRING, menu: 'PROPERTY', defaultValue: 'name'},
                        INDEX: {type: ArgumentType.STRING, menu: 'OBJECT_INDEX', defaultValue: '1'}
                    }
                },
                {
                    opcode: 'isClassInView',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'objectSense.isClassInView',
                        default: 'is there a [CLASS] in view ?',
                        description: 'whether the last look found at least one of that kind'
                    }),
                    arguments: {
                        CLASS: {type: ArgumentType.STRING, menu: 'CLASS', defaultValue: 'person'}
                    }
                },
                {
                    opcode: 'countOfClass',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'objectSense.countOfClass',
                        default: 'how many [CLASS] in view',
                        description: 'how many of that kind the last look found'
                    }),
                    arguments: {
                        CLASS: {type: ArgumentType.STRING, menu: 'CLASS', defaultValue: 'person'}
                    }
                }
            ],
            menus: {
                CAMERA_STATE: {acceptReporters: true, items: this._buildMenu(this.CAMERA_STATE_INFO)},
                BOX_STATE: {acceptReporters: true, items: this._buildMenu(this.BOX_STATE_INFO)},
                THRESHOLD: {acceptReporters: true, items: this._buildMenu(this.THRESHOLD_INFO)},
                SOURCE: {acceptReporters: true, items: this._buildMenu(this.SOURCE_INFO)},
                PROPERTY: {acceptReporters: true, items: this._buildMenu(this.PROPERTY_INFO)},
                OBJECT_INDEX: {acceptReporters: true, items: this._buildMenu(this.OBJECT_INDEX_INFO)},
                CLASS: {acceptReporters: true, items: this._buildMenu(this.CLASS_INFO)}
            }
        }];
    }

    // ------------------------------------------------------------ the camera

    useCamera (args) {
        const video = this.runtime.ioDevices.video;
        if (!video) return;

        if (Cast.toString(args.STATE) === 'off') {
            video.disableVideo();
            return;
        }

        video.enableVideo();
        video.mirror = true;
        // Scratch calls this a ghost, and it runs the other way round from the
        // number on the block: 0 % see-through is a fully solid picture.
        video.setPreviewGhost(Cast.toNumber(args.FADE));
    }

    showBoxes (args) {
        this._showOutlines = Cast.toString(args.STATE) === 'show';
        if (!this._showOutlines) this._clearOutlines();
        else this._drawOutlines();
    }

    setConfidence (args) {
        const level = Math.min(1, Math.max(0, Cast.toNumber(args.LEVEL)));
        // Returned so the block waits for the detector to take it before the
        // next block asks it anything.
        return this._detector.setConfidence(level);
    }

    // ----------------------------------------------------------- the looking

    /**
     * One picture to look at: the camera, or whatever is on the stage.
     * @param {string} source - 'camera' or 'arena'.
     * @returns {?HTMLCanvasElement} - the picture, or null if there is none yet.
     * @private
     */
    _grabFrame (source) {
        if (source === 'arena') {
            // Without any extension's marks in it, these boxes included:
            // see extension-support/stage-overlays.js.
            return captureStage(this.runtime, this._workCanvas('_stageCanvas', STAGE_WIDTH, STAGE_HEIGHT), null);
        }

        const video = this.runtime.ioDevices.video;
        if (!video) return null;
        return video.getFrame({
            format: Video.FORMAT_CANVAS,
            dimensions: Video.DIMENSIONS,
            mirror: true
        });
    }

    _workCanvas (key, width, height) {
        if (!this[key]) {
            this[key] = document.createElement('canvas');
        }
        const canvas = this[key];
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        return canvas;
    }

    lookForObjects (args) {
        const frame = this._grabFrame(Cast.toString(args.SOURCE));
        if (!frame) {
            this._objects = [];
            this._drawOutlines();
            return Promise.resolve();
        }

        return this._detector.scan(frame)
            .then(objects => {
                this._objects = objects;
                this._drawOutlines();
            })
            .catch(err => {
                this._objects = [];
                this._drawOutlines();
                // Reported once, on the console: a project that looks inside
                // a loop must not open a dialog on every pass.
                // eslint-disable-next-line no-console
                console.warn(`Object Sense could not look: ${err.message}`);
            });
    }

    // ---------------------------------------------------------- the reporters

    /**
     * The object a block means, or null if it is asking for one that is not there.
     * @param {*} index - the block's 1-based number.
     * @returns {?object} - the object.
     * @private
     */
    _object (index) {
        const i = Math.round(Cast.toNumber(index)) - 1;
        if (i < 0 || i >= this._objects.length) return null;
        return this._objects[i];
    }

    objectCount () {
        return this._objects.length;
    }

    objectProperty (args) {
        const object = this._object(args.INDEX);
        const property = Cast.toString(args.PROPERTY);
        if (!object) return property === 'name' ? '' : 0;
        switch (property) {
        case 'name':
            return object.name;
        case 'x':
            return Math.round(Scratch3ObjectSenseBlocks.toStage(object.centre.x, object.centre.y).x * 100) / 100;
        case 'y':
            return Math.round(Scratch3ObjectSenseBlocks.toStage(object.centre.x, object.centre.y).y * 100) / 100;
        case 'width':
            return Math.round(object.width * STAGE_WIDTH * 100) / 100;
        case 'height':
            return Math.round(object.height * STAGE_HEIGHT * 100) / 100;
        case 'confidence':
            return Math.round(object.score * 100);
        default:
            return 0;
        }
    }

    /**
     * The objects of one kind. Matched on the model's own names, case and
     * spaces ignored so that "Cell Phone" from a reporter still counts.
     * @param {*} wanted - the class name.
     * @returns {Array} - the matching objects.
     * @private
     */
    _ofClass (wanted) {
        const key = Cast.toString(wanted).trim().toLowerCase();
        return this._objects.filter(object => object.name.toLowerCase() === key);
    }

    isClassInView (args) {
        return this._ofClass(args.CLASS).length > 0;
    }

    countOfClass (args) {
        return this._ofClass(args.CLASS).length;
    }

    // ------------------------------------------------------------- the boxes

    /**
     * Make the layer the boxes are drawn on, once.
     *
     * The pen layer, not the video layer: the camera preview is a drawable on
     * the video layer that appears asynchronously when the camera comes up,
     * and anything created on that layer before it ends up underneath it,
     * drawn but never seen. The pen layer always sits above the video and
     * below the sprites.
     * @returns {boolean} - whether there is a layer to draw on.
     * @private
     */
    _ensureOutlineLayer () {
        const renderer = this.runtime.renderer;
        if (!renderer) return false;
        if (this._outlineDrawable !== null) return true;

        try {
            this._outlineSkin = renderer.createBitmapSkin(
                new ImageData(STAGE_WIDTH, STAGE_HEIGHT), 1);
            this._outlineDrawable = renderer.createDrawable(StageLayering.PEN_LAYER);
            renderer.updateDrawableSkinId(this._outlineDrawable, this._outlineSkin);
            registerOverlay(this.runtime, this._outlineDrawable);
        } catch (err) {
            // A renderer that will not give us a layer is not worth failing a
            // whole project over; the boxes are a convenience.
            this._outlineDrawable = null;
            return false;
        }
        return true;
    }

    _drawOutlines () {
        if (!this._showOutlines) return;
        if (!this._ensureOutlineLayer()) return;

        const canvas = this._workCanvas('_outlineCanvas', STAGE_WIDTH, STAGE_HEIGHT);
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
        context.lineWidth = 3;
        context.font = 'bold 13px sans-serif';
        context.textBaseline = 'middle';

        this._objects.forEach(object => {
            const x = object.box.left * STAGE_WIDTH;
            const y = object.box.top * STAGE_HEIGHT;
            const w = object.width * STAGE_WIDTH;
            const h = object.height * STAGE_HEIGHT;
            context.strokeStyle = CATEGORY_COLOUR;
            context.strokeRect(x, y, w, h);

            // The name on a tab above the box, or just inside it when the box
            // reaches the top of the picture.
            const label = `${object.name} ${Math.round(object.score * 100)}%`;
            const tabHeight = 18;
            const tabWidth = context.measureText(label).width + 10;
            const tabY = y >= tabHeight ? y - tabHeight : y;
            context.fillStyle = CATEGORY_COLOUR;
            context.fillRect(x, tabY, tabWidth, tabHeight);
            context.fillStyle = '#FFFFFF';
            context.fillText(label, x + 5, tabY + tabHeight / 2);
        });

        this.runtime.renderer.updateBitmapSkin(
            this._outlineSkin,
            context.getImageData(0, 0, STAGE_WIDTH, STAGE_HEIGHT),
            1
        );
        this.runtime.requestRedraw();
    }

    _clearOutlines () {
        if (this._outlineSkin === null || !this.runtime.renderer) return;
        this.runtime.renderer.updateBitmapSkin(
            this._outlineSkin, new ImageData(STAGE_WIDTH, STAGE_HEIGHT), 1);
        this.runtime.requestRedraw();
    }

    /**
     * Give back everything this extension holds when it is removed: the
     * model, the box layer and the stop-sign listener. Safe to call more than
     * once; anything used again afterwards is simply loaded again.
     */
    dispose () {
        this.runtime.removeListener('PROJECT_STOP_ALL', this._onStopAll);
        this._detector.dispose();
        const renderer = this.runtime.renderer;
        if (renderer && this._outlineDrawable !== null) {
            unregisterOverlay(this.runtime, this._outlineDrawable);
            renderer.destroyDrawable(this._outlineDrawable, StageLayering.PEN_LAYER);
        }
        if (renderer && this._outlineSkin !== null) renderer.destroySkin(this._outlineSkin);
        this._outlineDrawable = null;
        this._outlineSkin = null;
        this._objects = [];
        if (renderer) this.runtime.requestRedraw();
    }
}

module.exports = Scratch3ObjectSenseBlocks;
