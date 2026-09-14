/**
 * Body Sense: find people's poses and hands through the camera.
 *
 * Looking happens in the editor, with MediaPipe's pose and hand landmarkers,
 * so it works with any board or none. Two blocks take a picture and find the
 * people or the hands in it; the reporters read from that last look, so a
 * script that wants fresh answers looks again inside its loop.
 */
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const Video = require('../../io/video');
const formatMessage = require('format-message');
const StageLayering = require('../../engine/stage-layering');
const {registerOverlay, unregisterOverlay, captureStage} = require('../../extension-support/stage-overlays');

const BodyTracker = require('./tracker');

const [STAGE_WIDTH, STAGE_HEIGHT] = Video.DIMENSIONS;

/** The colour of the markers drawn on people and hands, and of the category. */
const CATEGORY_COLOUR = '#D14343';

const FIGURE_PATHS =
    '<circle cx="20" cy="8" r="3.6"/>' +
    '<path d="M20 12v10M20 22l-5 10M20 22l5 10M11 15l9 2 9-4"/>';

const blockIconURI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
    '<g fill="none" stroke="#FFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
    FIGURE_PATHS +
    '</g></svg>'
)}`;

const menuIconURI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 40 40">' +
    `<g fill="none" stroke="${CATEGORY_COLOUR}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">` +
    FIGURE_PATHS +
    '</g></svg>'
)}`;

class Scratch3BodySenseBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this._tracker = new BodyTracker();

        /** What the last looks found, left to right. */
        this._people = [];
        this._hands = [];

        this._showMarkers = false;
        this._markerSkin = null;
        this._markerDrawable = null;
        // Working canvases, kept rather than remade every frame.
        this._markerCanvas = null;
        this._stageCanvas = null;

        this._onStopAll = () => this._clearMarkers();
        this.runtime.on('PROJECT_STOP_ALL', this._onStopAll);
    }

    get EXTENSION_ID () {
        return 'bodySense';
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

    get MARKER_STATE_INFO () {
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

    get AXIS_INFO () {
        return [
            {name: 'x position', value: 'x'},
            {name: 'y position', value: 'y'}
        ];
    }

    /** @returns {Array} - the body parts the pose model can point to. */
    get PART_INFO () {
        return Object.keys(BodyTracker.PARTS).map(name => ({name, value: name}));
    }

    /** @returns {Array} - which person, counted from the left. */
    get PERSON_INDEX_INFO () {
        return Array.from({length: BodyTracker.MAX_PEOPLE}, (_, i) => ({
            name: String(i + 1), value: String(i + 1)
        }));
    }

    /** @returns {Array} - which hand, counted from the left. */
    get HAND_INDEX_INFO () {
        return Array.from({length: BodyTracker.MAX_HANDS}, (_, i) => ({
            name: String(i + 1), value: String(i + 1)
        }));
    }

    get FINGER_INFO () {
        return Object.keys(BodyTracker.FINGERS).map(name => ({name, value: name}));
    }

    get JOINT_INFO () {
        return [
            {name: 'tip', value: 'tip'},
            {name: 'middle', value: 'middle'},
            {name: 'base', value: 'base'}
        ];
    }

    get SIDE_INFO () {
        return [
            {name: 'left', value: 'left'},
            {name: 'right', value: 'right'}
        ];
    }

    _buildMenu (info) {
        return info.map(entry => ({text: entry.name, value: entry.value}));
    }

    getInfo () {
        return [{
            id: 'bodySense',
            name: formatMessage({
                id: 'bodySense.categoryName',
                default: 'Body Sense',
                description: 'Label for the body sensing extension category'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            color1: CATEGORY_COLOUR,
            color2: '#B53A3A',
            color3: '#9C3131',
            blocks: [
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'bodySense.group.settings',
                        default: 'Settings',
                        description: 'palette heading above the camera blocks'
                    })
                },
                {
                    opcode: 'useCamera',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'bodySense.useCamera',
                        default: 'switch camera [STATE] with picture [FADE] % faded',
                        description: 'switch the camera picture on the stage on or off'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'CAMERA_STATE', defaultValue: 'on'},
                        FADE: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'showMarkers',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'bodySense.showMarkers',
                        default: '[STATE] body markers',
                        description: 'draw or hide the stick figures and hand outlines'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'MARKER_STATE', defaultValue: 'show'}
                    }
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'bodySense.group.pose',
                        default: 'Body Pose',
                        description: 'palette heading above the pose blocks'
                    })
                },
                {
                    opcode: 'findPoses',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'bodySense.findPoses',
                        default: 'find body poses in [SOURCE]',
                        description: 'take a picture and find the people in it'
                    }),
                    arguments: {
                        SOURCE: {type: ArgumentType.STRING, menu: 'SOURCE', defaultValue: 'arena'}
                    }
                },
                {
                    opcode: 'peopleCount',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'bodySense.peopleCount',
                        default: 'number of people',
                        description: 'how many people the last pose look found'
                    })
                },
                {
                    opcode: 'partX',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'bodySense.partX',
                        default: 'x of [PART] on person [INDEX]',
                        description: 'the stage x of one body part'
                    }),
                    arguments: {
                        PART: {type: ArgumentType.STRING, menu: 'PART', defaultValue: 'nose'},
                        INDEX: {type: ArgumentType.STRING, menu: 'PERSON_INDEX', defaultValue: '1'}
                    }
                },
                {
                    opcode: 'partY',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'bodySense.partY',
                        default: 'y of [PART] on person [INDEX]',
                        description: 'the stage y of one body part'
                    }),
                    arguments: {
                        PART: {type: ArgumentType.STRING, menu: 'PART', defaultValue: 'nose'},
                        INDEX: {type: ArgumentType.STRING, menu: 'PERSON_INDEX', defaultValue: '1'}
                    }
                },
                {
                    opcode: 'isPartVisible',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'bodySense.isPartVisible',
                        default: 'can see [PART] on person [INDEX] ?',
                        description: 'whether that body part was in the picture'
                    }),
                    arguments: {
                        PART: {type: ArgumentType.STRING, menu: 'PART', defaultValue: 'nose'},
                        INDEX: {type: ArgumentType.STRING, menu: 'PERSON_INDEX', defaultValue: '1'}
                    }
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'bodySense.group.hands',
                        default: 'Hands',
                        description: 'palette heading above the hand blocks'
                    })
                },
                {
                    opcode: 'findHands',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'bodySense.findHands',
                        default: 'find hands in [SOURCE]',
                        description: 'take a picture and find the hands in it'
                    }),
                    arguments: {
                        SOURCE: {type: ArgumentType.STRING, menu: 'SOURCE', defaultValue: 'arena'}
                    }
                },
                {
                    opcode: 'isHandInView',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'bodySense.isHandInView',
                        default: 'is a hand in view ?',
                        description: 'whether the last hand look found any hand'
                    })
                },
                {
                    opcode: 'handCount',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'bodySense.handCount',
                        default: 'number of hands',
                        description: 'how many hands the last hand look found'
                    })
                },
                {
                    opcode: 'fingerPoint',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'bodySense.fingerPoint',
                        default: '[AXIS] of [FINGER] [JOINT] on hand [INDEX]',
                        description: 'the stage position of one finger joint'
                    }),
                    arguments: {
                        AXIS: {type: ArgumentType.STRING, menu: 'AXIS', defaultValue: 'x'},
                        FINGER: {type: ArgumentType.STRING, menu: 'FINGER', defaultValue: 'index finger'},
                        JOINT: {type: ArgumentType.STRING, menu: 'JOINT', defaultValue: 'tip'},
                        INDEX: {type: ArgumentType.STRING, menu: 'HAND_INDEX', defaultValue: '1'}
                    }
                },
                {
                    opcode: 'handPosition',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'bodySense.handPosition',
                        default: '[AXIS] of hand [INDEX]',
                        description: 'the stage position of the middle of a hand'
                    }),
                    arguments: {
                        AXIS: {type: ArgumentType.STRING, menu: 'AXIS', defaultValue: 'x'},
                        INDEX: {type: ArgumentType.STRING, menu: 'HAND_INDEX', defaultValue: '1'}
                    }
                },
                {
                    opcode: 'isHandSide',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'bodySense.isHandSide',
                        default: 'is hand [INDEX] a [SIDE] hand ?',
                        description: 'whether that hand is the person\'s left or right'
                    }),
                    arguments: {
                        INDEX: {type: ArgumentType.STRING, menu: 'HAND_INDEX', defaultValue: '1'},
                        SIDE: {type: ArgumentType.STRING, menu: 'SIDE', defaultValue: 'right'}
                    }
                },
                {
                    opcode: 'isFingerRaised',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'bodySense.isFingerRaised',
                        default: 'is [FINGER] raised on hand [INDEX] ?',
                        description: 'whether that finger is held out straight'
                    }),
                    arguments: {
                        FINGER: {type: ArgumentType.STRING, menu: 'FINGER', defaultValue: 'index finger'},
                        INDEX: {type: ArgumentType.STRING, menu: 'HAND_INDEX', defaultValue: '1'}
                    }
                }
            ],
            menus: {
                CAMERA_STATE: {acceptReporters: true, items: this._buildMenu(this.CAMERA_STATE_INFO)},
                MARKER_STATE: {acceptReporters: true, items: this._buildMenu(this.MARKER_STATE_INFO)},
                SOURCE: {acceptReporters: true, items: this._buildMenu(this.SOURCE_INFO)},
                AXIS: {acceptReporters: true, items: this._buildMenu(this.AXIS_INFO)},
                PART: {acceptReporters: true, items: this._buildMenu(this.PART_INFO)},
                PERSON_INDEX: {acceptReporters: true, items: this._buildMenu(this.PERSON_INDEX_INFO)},
                HAND_INDEX: {acceptReporters: true, items: this._buildMenu(this.HAND_INDEX_INFO)},
                FINGER: {acceptReporters: true, items: this._buildMenu(this.FINGER_INFO)},
                JOINT: {acceptReporters: true, items: this._buildMenu(this.JOINT_INFO)},
                SIDE: {acceptReporters: true, items: this._buildMenu(this.SIDE_INFO)}
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
        // number on the block: 0 % faded is a fully solid picture.
        video.setPreviewGhost(Cast.toNumber(args.FADE));
    }

    showMarkers (args) {
        this._showMarkers = Cast.toString(args.STATE) === 'show';
        if (!this._showMarkers) this._clearMarkers();
        else this._drawMarkers();
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
            // Without any extension's marks in it, these figures included:
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

    findPoses (args) {
        const frame = this._grabFrame(Cast.toString(args.SOURCE));
        if (!frame) {
            this._people = [];
            this._drawMarkers();
            return Promise.resolve();
        }

        return this._tracker.findPeople(frame)
            .then(people => {
                this._people = people;
                this._drawMarkers();
            })
            .catch(err => {
                this._people = [];
                this._drawMarkers();
                // Reported once, on the console: a project that looks inside
                // a loop must not open a dialog on every pass.
                // eslint-disable-next-line no-console
                console.warn(`Body Sense could not look for poses: ${err.message}`);
            });
    }

    findHands (args) {
        const frame = this._grabFrame(Cast.toString(args.SOURCE));
        if (!frame) {
            this._hands = [];
            this._drawMarkers();
            return Promise.resolve();
        }

        return this._tracker.findHands(frame)
            .then(hands => {
                this._hands = hands;
                this._drawMarkers();
            })
            .catch(err => {
                this._hands = [];
                this._drawMarkers();
                // eslint-disable-next-line no-console
                console.warn(`Body Sense could not look for hands: ${err.message}`);
            });
    }

    // ---------------------------------------------------------- the reporters

    /**
     * The person a block means, or null if it is asking for one that is not there.
     * @param {*} index - the block's 1-based number.
     * @returns {?object} - the person.
     * @private
     */
    _person (index) {
        const i = Math.round(Cast.toNumber(index)) - 1;
        if (i < 0 || i >= this._people.length) return null;
        return this._people[i];
    }

    /**
     * The hand a block means, or null if it is asking for one that is not there.
     * @param {*} index - the block's 1-based number.
     * @returns {?object} - the hand.
     * @private
     */
    _hand (index) {
        const i = Math.round(Cast.toNumber(index)) - 1;
        if (i < 0 || i >= this._hands.length) return null;
        return this._hands[i];
    }

    /**
     * A body part of one person, matched on its name with case and spare
     * spaces ignored so that "Left Wrist" from a reporter still counts.
     * @param {*} index - the block's 1-based person number.
     * @param {*} part - the part's name.
     * @returns {?object} - the part, or null.
     * @private
     */
    _part (index, part) {
        const person = this._person(index);
        if (!person) return null;
        const key = Cast.toString(part).trim().toLowerCase().replace(/\s+/g, ' ');
        return person.parts[key] || null;
    }

    /**
     * One stage coordinate of a point in the picture, rounded for the stage.
     * @param {?object} point - a point with x and y as fractions of the picture.
     * @param {*} axis - 'x' or 'y'.
     * @returns {number} - the coordinate, or 0 for no point.
     * @private
     */
    static _coordinate (point, axis) {
        if (!point) return 0;
        const stage = Scratch3BodySenseBlocks.toStage(point.x, point.y);
        const value = Cast.toString(axis).trim().toLowerCase() === 'y' ? stage.y : stage.x;
        return Math.round(value * 100) / 100;
    }

    peopleCount () {
        return this._people.length;
    }

    partX (args) {
        return Scratch3BodySenseBlocks._coordinate(this._part(args.INDEX, args.PART), 'x');
    }

    partY (args) {
        return Scratch3BodySenseBlocks._coordinate(this._part(args.INDEX, args.PART), 'y');
    }

    isPartVisible (args) {
        const part = this._part(args.INDEX, args.PART);
        return !!(part && part.visible);
    }

    isHandInView () {
        return this._hands.length > 0;
    }

    handCount () {
        return this._hands.length;
    }

    fingerPoint (args) {
        const hand = this._hand(args.INDEX);
        if (!hand) return 0;
        const finger = BodyTracker.FINGERS[Cast.toString(args.FINGER).trim().toLowerCase()];
        if (!finger) return 0;
        const joint = finger[Cast.toString(args.JOINT).trim().toLowerCase()];
        if (typeof joint !== 'number') return 0;
        return Scratch3BodySenseBlocks._coordinate(hand.points[joint], args.AXIS);
    }

    handPosition (args) {
        const hand = this._hand(args.INDEX);
        return Scratch3BodySenseBlocks._coordinate(hand ? hand.palm : null, args.AXIS);
    }

    isHandSide (args) {
        const hand = this._hand(args.INDEX);
        if (!hand || !hand.side) return false;
        return hand.side === Cast.toString(args.SIDE).trim().toLowerCase();
    }

    isFingerRaised (args) {
        return BodyTracker.isFingerRaised(
            this._hand(args.INDEX), Cast.toString(args.FINGER).trim().toLowerCase());
    }

    // ----------------------------------------------------------- the markers

    /**
     * Make the layer the markers are drawn on, once.
     *
     * The pen layer, not the video layer: the camera preview is a drawable on
     * the video layer that appears asynchronously when the camera comes up,
     * and anything created on that layer before it ends up underneath it,
     * drawn but never seen. The pen layer always sits above the video and
     * below the sprites.
     * @returns {boolean} - whether there is a layer to draw on.
     * @private
     */
    _ensureMarkerLayer () {
        const renderer = this.runtime.renderer;
        if (!renderer) return false;
        if (this._markerDrawable !== null) return true;

        try {
            this._markerSkin = renderer.createBitmapSkin(
                new ImageData(STAGE_WIDTH, STAGE_HEIGHT), 1);
            this._markerDrawable = renderer.createDrawable(StageLayering.PEN_LAYER);
            renderer.updateDrawableSkinId(this._markerDrawable, this._markerSkin);
            registerOverlay(this.runtime, this._markerDrawable);
        } catch (err) {
            // A renderer that will not give us a layer is not worth failing a
            // whole project over; the markers are a convenience.
            this._markerDrawable = null;
            return false;
        }
        return true;
    }

    /**
     * Draw one figure: its bones as lines, its points as dots. A null point
     * is one the model could not see; it gets no dot and no bone.
     * @param {CanvasRenderingContext2D} context - where to draw.
     * @param {Array} points - the figure's points as fractions of the picture, or null.
     * @param {Array} bones - pairs of point indices to join.
     * @param {number} dot - the radius of each dot.
     * @private
     */
    static _drawFigure (context, points, bones, dot) {
        context.beginPath();
        bones.forEach(([a, b]) => {
            if (!points[a] || !points[b]) return;
            context.moveTo(points[a].x * STAGE_WIDTH, points[a].y * STAGE_HEIGHT);
            context.lineTo(points[b].x * STAGE_WIDTH, points[b].y * STAGE_HEIGHT);
        });
        context.stroke();
        points.forEach(point => {
            if (!point) return;
            context.beginPath();
            context.arc(point.x * STAGE_WIDTH, point.y * STAGE_HEIGHT, dot, 0, Math.PI * 2);
            context.fill();
        });
    }

    _drawMarkers () {
        if (!this._showMarkers) return;
        if (!this._ensureMarkerLayer()) return;

        const canvas = this._workCanvas('_markerCanvas', STAGE_WIDTH, STAGE_HEIGHT);
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
        context.lineWidth = 3;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = CATEGORY_COLOUR;
        context.fillStyle = '#FFFFFF';

        this._people.forEach(person => {
            // Only the points the model could see: a leg that is out of the
            // picture would otherwise be drawn wherever the model guessed.
            Scratch3BodySenseBlocks._drawFigure(
                context, person.points.map(p => (p.visible ? p : null)), BodyTracker.BONES, 4);
        });
        this._hands.forEach(hand => {
            Scratch3BodySenseBlocks._drawFigure(context, hand.points, BodyTracker.HAND_BONES, 3);
        });

        this.runtime.renderer.updateBitmapSkin(
            this._markerSkin,
            context.getImageData(0, 0, STAGE_WIDTH, STAGE_HEIGHT),
            1
        );
        this.runtime.requestRedraw();
    }

    _clearMarkers () {
        if (this._markerSkin === null || !this.runtime.renderer) return;
        this.runtime.renderer.updateBitmapSkin(
            this._markerSkin, new ImageData(STAGE_WIDTH, STAGE_HEIGHT), 1);
        this.runtime.requestRedraw();
    }

    /**
     * Give back everything this extension holds when it is removed: the
     * models, the marker layer and the stop-sign listener. Safe to call more
     * than once; anything used again afterwards is simply loaded again.
     */
    dispose () {
        this.runtime.removeListener('PROJECT_STOP_ALL', this._onStopAll);
        this._tracker.dispose();
        const renderer = this.runtime.renderer;
        if (renderer && this._markerDrawable !== null) {
            unregisterOverlay(this.runtime, this._markerDrawable);
            renderer.destroyDrawable(this._markerDrawable, StageLayering.PEN_LAYER);
        }
        if (renderer && this._markerSkin !== null) renderer.destroySkin(this._markerSkin);
        this._markerDrawable = null;
        this._markerSkin = null;
        this._people = [];
        this._hands = [];
        if (renderer) this.runtime.requestRedraw();
    }
}

module.exports = Scratch3BodySenseBlocks;
