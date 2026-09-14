const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const Video = require('../../io/video');
const formatMessage = require('format-message');
const StageLayering = require('../../engine/stage-layering');
const {registerOverlay, unregisterOverlay, captureStage} = require('../../extension-support/stage-overlays');

const FaceDetector = require('./detector');

/**
 * Face Sense: finding faces, reading expressions, and telling people apart.
 *
 * The shape of this is deliberate. Looking at a picture is a block the user
 * runs -- "look for faces" -- and every reporter afterwards reads what that
 * block found. It does not watch the camera in the background.
 *
 * That is what keeps it cheap. Twenty reporters inside a forever loop cost one
 * pass over one frame, not twenty, and a project that is not currently asking
 * about faces costs nothing at all. It also makes the blocks honest: the
 * numbers a reporter gives back belong to a specific moment the user chose,
 * rather than to whenever the last background frame happened to land.
 *
 * All of it runs here in the editor, not on the board. The ESP32 has no camera
 * and could not run these models if it had one, so face blocks only make sense
 * with the board connected and a program running live.
 */

/** The stage, and the frames asked of the camera, are both this size. */
const [STAGE_WIDTH, STAGE_HEIGHT] = Video.DIMENSIONS;

/** How square a picture the embedder wants. */
const EMBED_SIZE = 224;

/**
 * How alike two face vectors must be before they count as the same person.
 *
 * The embedder describes pictures in general rather than faces in particular,
 * so two different people photographed the same way still score fairly high.
 * The bar is set well above that. Tuned for a classroom: a handful of faces,
 * same room, same light.
 */
const MATCH_THRESHOLD = 0.86;

/** How much of the face box to keep around the face when cropping. */
const CROP_MARGIN = 0.2;

const blockIconURI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
    '<g fill="none" stroke="#FFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6 13V8.5A2.5 2.5 0 0 1 8.5 6H13M27 6h4.5A2.5 2.5 0 0 1 34 8.5V13' +
    'M34 27v4.5a2.5 2.5 0 0 1-2.5 2.5H27M13 34H8.5A2.5 2.5 0 0 1 6 31.5V27"/>' +
    '<circle cx="15.5" cy="17.5" r="1.6" fill="#FFF" stroke="none"/>' +
    '<circle cx="24.5" cy="17.5" r="1.6" fill="#FFF" stroke="none"/>' +
    '<path d="M15 25c1.6 1.7 3.3 2.5 5 2.5s3.4-.8 5-2.5"/>' +
    '</g></svg>'
)}`;

const menuIconURI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 40 40">' +
    '<g fill="none" stroke="#C1436D" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6 13V8.5A2.5 2.5 0 0 1 8.5 6H13M27 6h4.5A2.5 2.5 0 0 1 34 8.5V13' +
    'M34 27v4.5a2.5 2.5 0 0 1-2.5 2.5H27M13 34H8.5A2.5 2.5 0 0 1 6 31.5V27"/>' +
    '<circle cx="15.5" cy="17.5" r="1.8" fill="#C1436D" stroke="none"/>' +
    '<circle cx="24.5" cy="17.5" r="1.8" fill="#C1436D" stroke="none"/>' +
    '<path d="M15 25c1.6 1.7 3.3 2.5 5 2.5s3.4-.8 5-2.5"/>' +
    '</g></svg>'
)}`;

/**
 * What each mood is made of.
 *
 * MediaPipe reports 52 expression strengths; a mood is a small combination of
 * them. These are rules rather than a trained classifier, which is worth being
 * plain about: "happy" and "surprised" are read off the face reliably because
 * a smile and an open mouth are unambiguous, while "sad" and "angry" lean on
 * eyebrows and are the ones that will disagree with a person's own account of
 * how they feel.
 *
 * Each entry is a list of [blendshape, weight]. The mood with the best score
 * wins, provided it clears MOOD_FLOOR; otherwise the face is neutral.
 */
const MOODS = {
    happy: [['mouthSmileLeft', 1], ['mouthSmileRight', 1], ['cheekSquintLeft', 0.3], ['cheekSquintRight', 0.3]],
    surprised: [['jawOpen', 1], ['browInnerUp', 0.8], ['eyeWideLeft', 0.5], ['eyeWideRight', 0.5]],
    angry: [['browDownLeft', 1], ['browDownRight', 1], ['mouthPressLeft', 0.4], ['mouthPressRight', 0.4]],
    sad: [['mouthFrownLeft', 1], ['mouthFrownRight', 1], ['browInnerUp', 0.6]]
};

/** Below this, the strongest mood is not strong enough to be worth naming. */
const MOOD_FLOOR = 0.3;

/**
 * The looks that are read straight off one or two expression strengths.
 *
 * Separate from MOODS because these are facts about a face rather than guesses
 * about a feeling -- an open mouth is an open mouth.
 */
const LOOKS = {
    'mouth open': face => face.blendshapes.jawOpen > 0.4,
    'eyes closed': face => Math.min(
        face.blendshapes.eyeBlinkLeft || 0, face.blendshapes.eyeBlinkRight || 0) > 0.5,
    winking: face => {
        const left = face.blendshapes.eyeBlinkLeft || 0;
        const right = face.blendshapes.eyeBlinkRight || 0;
        return Math.max(left, right) > 0.5 && Math.min(left, right) < 0.3;
    },
    'eyebrows raised': face => Math.max(
        face.blendshapes.browOuterUpLeft || 0, face.blendshapes.browOuterUpRight || 0) > 0.4
};

class Scratch3FaceSenseBlocks {
    constructor (runtime) {
        this.runtime = runtime;

        this._detector = new FaceDetector();

        /** What the last "look for faces" block found. */
        this._faces = [];

        /** Learned people, by slot number: {name, samples: Array<Array<number>>}. */
        this._learned = new Map();

        /**
         * Which learned slot each face in _faces was matched to, by face index.
         * Filled in by the matching block and cleared by every scan, so a
         * reporter cannot hand back a name from two scans ago.
         */
        this._matches = [];

        this._showOutlines = false;
        this._outlineSkin = null;
        this._outlineDrawable = null;

        // Working canvases, kept rather than remade every frame.
        this._cropCanvas = null;
        this._outlineCanvas = null;

        this._onStopAll = () => this._clearOutlines();
        this.runtime.on('PROJECT_STOP_ALL', this._onStopAll);
    }

    /**
     * The ID of this extension.
     *
     * Load-bearing, and quietly so. _registerInternalExtension reads this to
     * decide what it is registering: an object without it is taken for a
     * DEVICE, and registering a device empties _deviceBlockInfo -- which is
     * where every Mieo category lives. Leaving this out does not break the
     * extension, it deletes the board's blocks from the palette.
     * @return {string} - the ID of this extension.
     */
    get EXTENSION_ID () {
        return 'faceSense';
    }

    /**
     * The stage coordinates of a normalised point in the frame.
     * @param {number} x - across the frame, 0 to 1.
     * @param {number} y - down the frame, 0 to 1.
     * @returns {object} - stage x and y.
     */
    static toStage (x, y) {
        return {
            x: (x - 0.5) * STAGE_WIDTH,
            y: (0.5 - y) * STAGE_HEIGHT
        };
    }

    get FACE_PROPERTY_INFO () {
        return [
            {name: 'x position', value: 'x'},
            {name: 'y position', value: 'y'},
            {name: 'width', value: 'width'},
            {name: 'height', value: 'height'},
            {name: 'tilt', value: 'tilt'}
        ];
    }

    get MOOD_INFO () {
        return [
            {name: 'happy', value: 'happy'},
            {name: 'sad', value: 'sad'},
            {name: 'angry', value: 'angry'},
            {name: 'surprised', value: 'surprised'},
            {name: 'neutral', value: 'neutral'},
            {name: 'mouth open', value: 'mouth open'},
            {name: 'eyes closed', value: 'eyes closed'},
            {name: 'winking', value: 'winking'},
            {name: 'eyebrows raised', value: 'eyebrows raised'}
        ];
    }

    get FEATURE_INFO () {
        return Object.keys(FaceDetector.FEATURES).map(name => ({name, value: name}));
    }

    get SOURCE_INFO () {
        return [
            {name: 'camera', value: 'camera'},
            {name: 'arena', value: 'arena'}
        ];
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

    /**
     * Turn a menu table into what the toolbox wants.
     * @param {Array} info - name and value pairs.
     * @returns {Array} - menu items.
     */
    /**
     * Which face, counted from the left as the detector orders them. Ten is
     * more than a classroom webcam resolves; a reporter can be dropped in
     * for anything beyond it.
     * @returns {Array} - menu entries.
     */
    get FACE_INDEX_INFO () {
        return Array.from({length: 10}, (_, i) => ({name: String(i + 1), value: String(i + 1)}));
    }

    /** @returns {Array} - the class numbers a face can be taught as. */
    get CLASS_SLOT_INFO () {
        return Array.from({length: 10}, (_, i) => ({name: String(i + 1), value: String(i + 1)}));
    }

    /**
     * Detection thresholds, coarse on purpose. Below 0.1 everything is a face
     * and above 0.9 nothing is; the useful range sits in between.
     * @returns {Array} - menu entries.
     */
    get THRESHOLD_INFO () {
        return Array.from({length: 9}, (_, i) => {
            const level = ((i + 1) / 10).toFixed(1);
            return {name: level, value: level};
        });
    }

    _buildMenu (info) {
        return info.map(entry => ({text: entry.name, value: entry.value}));
    }

    getInfo () {
        return [{
            id: 'faceSense',
            name: formatMessage({
                id: 'faceSense.categoryName',
                default: 'Face Sense',
                description: 'Label for the face sensing extension category'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            color1: '#C1436D',
            color2: '#A93A5E',
            color3: '#93314F',
            blocks: [
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'faceSense.group.camera',
                        default: 'Settings',
                        description: 'palette heading above the camera blocks'
                    })
                },
                {
                    opcode: 'useCamera',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'faceSense.useCamera',
                        default: 'turn [STATE] video on arena at [FADE] % transparency',
                        description: 'turn the camera on or off and set how faded the arena picture is'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'CAMERA_STATE', defaultValue: 'on'},
                        FADE: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'showOutlines',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'faceSense.showOutlines',
                        default: '[STATE] face bounding box',
                        description: 'draw a box around each face found'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'OUTLINE_STATE', defaultValue: 'show'}
                    }
                },
                {
                    opcode: 'setConfidence',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'faceSense.setConfidence',
                        default: 'set detection threshold at [LEVEL]',
                        description: 'how sure the model must be before it calls something a face'
                    }),
                    arguments: {
                        LEVEL: {type: ArgumentType.STRING, menu: 'THRESHOLD', defaultValue: '0.5'}
                    }
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'faceSense.group.looking',
                        default: 'Detection',
                        description: 'palette heading above the detection blocks'
                    })
                },
                {
                    opcode: 'lookForFaces',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'faceSense.lookForFaces',
                        default: 'analyse picture from [SOURCE]',
                        description: 'take one picture and find the faces in it'
                    }),
                    arguments: {
                        SOURCE: {type: ArgumentType.STRING, menu: 'SOURCE', defaultValue: 'arena'}
                    }
                },
                {
                    opcode: 'faceCount',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'faceSense.faceCount',
                        default: 'get number of faces',
                        description: 'how many faces the last look found'
                    })
                },
                {
                    opcode: 'moodOf',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'faceSense.moodOf',
                        default: 'get expression on face [INDEX]',
                        description: 'what expression a face is wearing'
                    }),
                    arguments: {
                        INDEX: {type: ArgumentType.STRING, menu: 'FACE_INDEX', defaultValue: '1'}
                    }
                },
                {
                    opcode: 'looksLike',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'faceSense.looksLike',
                        default: 'is expression on face [INDEX] [MOOD] ?',
                        description: 'whether a face is wearing a given expression'
                    }),
                    arguments: {
                        INDEX: {type: ArgumentType.STRING, menu: 'FACE_INDEX', defaultValue: '1'},
                        MOOD: {type: ArgumentType.STRING, menu: 'MOOD', defaultValue: 'happy'}
                    }
                },
                {
                    opcode: 'faceProperty',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'faceSense.faceProperty',
                        default: 'get [PROPERTY] for face [INDEX]',
                        description: 'where a face is and how big it is'
                    }),
                    arguments: {
                        PROPERTY: {type: ArgumentType.STRING, menu: 'FACE_PROPERTY', defaultValue: 'x'},
                        INDEX: {type: ArgumentType.STRING, menu: 'FACE_INDEX', defaultValue: '1'}
                    }
                },
                {
                    opcode: 'featureProperty',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'faceSense.featureProperty',
                        default: 'get [PROPERTY] of [FEATURE] for face [INDEX]',
                        description: 'where one part of a face is'
                    }),
                    arguments: {
                        PROPERTY: {type: ArgumentType.STRING, menu: 'FACE_PROPERTY', defaultValue: 'x'},
                        FEATURE: {type: ArgumentType.STRING, menu: 'FEATURE', defaultValue: 'left eye'},
                        INDEX: {type: ArgumentType.STRING, menu: 'FACE_INDEX', defaultValue: '1'}
                    }
                },
                {
                    opcode: 'pointProperty',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'faceSense.pointProperty',
                        default: 'get [PROPERTY] of landmark [POINT] for face [INDEX]',
                        description: 'where one of the numbered face points is'
                    }),
                    arguments: {
                        PROPERTY: {type: ArgumentType.STRING, menu: 'FACE_PROPERTY', defaultValue: 'x'},
                        POINT: {type: ArgumentType.NUMBER, defaultValue: 1},
                        INDEX: {type: ArgumentType.STRING, menu: 'FACE_INDEX', defaultValue: '1'}
                    }
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'faceSense.group.teaching',
                        default: 'Face Recognition: Training',
                        description: 'palette heading above the enrolment blocks'
                    })
                },
                {
                    opcode: 'learnFace',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'faceSense.learnFace',
                        default: 'add class [SLOT] named [NAME] from [SOURCE]',
                        description: 'remember the face in view under a name'
                    }),
                    arguments: {
                        SLOT: {type: ArgumentType.STRING, menu: 'CLASS_SLOT', defaultValue: '1'},
                        NAME: {type: ArgumentType.STRING, defaultValue: 'Jarvis'},
                        SOURCE: {type: ArgumentType.STRING, menu: 'SOURCE', defaultValue: 'arena'}
                    }
                },
                {
                    opcode: 'forgetFaces',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'faceSense.forgetFaces',
                        default: 'reset classes',
                        description: 'throw away everything the learning blocks remembered'
                    })
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'faceSense.group.recognising',
                        default: 'Face Recognition: Testing',
                        description: 'palette heading above the matching blocks'
                    })
                },
                {
                    opcode: 'matchFaces',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'faceSense.matchFaces',
                        default: 'do face matching from [SOURCE]',
                        description: 'look, then work out which learned person each face is'
                    }),
                    arguments: {
                        SOURCE: {type: ArgumentType.STRING, menu: 'SOURCE', defaultValue: 'arena'}
                    }
                },
                {
                    opcode: 'learnedFaceInView',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'faceSense.learnedFaceInView',
                        default: 'is class [SLOT] detected ?',
                        description: 'whether the person in that learning slot was matched'
                    }),
                    arguments: {
                        SLOT: {type: ArgumentType.STRING, menu: 'CLASS_SLOT', defaultValue: '1'}
                    }
                },
                {
                    opcode: 'nameOfFace',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'faceSense.nameOfFace',
                        default: 'get class of detected face [INDEX]',
                        description: 'which learned person a face was matched to'
                    }),
                    arguments: {
                        INDEX: {type: ArgumentType.STRING, menu: 'FACE_INDEX', defaultValue: '1'}
                    }
                }
            ],
            menus: {
                CAMERA_STATE: {acceptReporters: true, items: this._buildMenu(this.CAMERA_STATE_INFO)},
                OUTLINE_STATE: {acceptReporters: true, items: this._buildMenu(this.OUTLINE_STATE_INFO)},
                SOURCE: {acceptReporters: true, items: this._buildMenu(this.SOURCE_INFO)},
                FACE_PROPERTY: {acceptReporters: true, items: this._buildMenu(this.FACE_PROPERTY_INFO)},
                FEATURE: {acceptReporters: true, items: this._buildMenu(this.FEATURE_INFO)},
                MOOD: {acceptReporters: true, items: this._buildMenu(this.MOOD_INFO)},
                FACE_INDEX: {acceptReporters: true, items: this._buildMenu(this.FACE_INDEX_INFO)},
                CLASS_SLOT: {acceptReporters: true, items: this._buildMenu(this.CLASS_SLOT_INFO)},
                THRESHOLD: {acceptReporters: true, items: this._buildMenu(this.THRESHOLD_INFO)}
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
        // number on the block: 0 % fade is a fully solid picture.
        video.setPreviewGhost(Cast.toNumber(args.FADE));
    }

    showOutlines (args) {
        this._showOutlines = Cast.toString(args.STATE) === 'show';
        if (!this._showOutlines) this._clearOutlines();
        else this._drawOutlines();
    }

    setConfidence (args) {
        const level = Math.min(1, Math.max(0, Cast.toNumber(args.LEVEL)));
        // Returned so the block waits for the graph to come back before the
        // next block asks it anything.
        return this._detector.setConfidence(level);
    }

    // ----------------------------------------------------------- the looking

    /**
     * One picture to look at.
     * @param {string} source - 'camera' or 'arena'.
     * @returns {?HTMLCanvasElement} - the frame, or null if there is none.
     */
    _grabFrame (source) {
        if (source === 'arena') {
            // Without any extension's marks in it, these outlines included:
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

    /**
     * A canvas kept between calls, rather than a new one every frame.
     * @param {string} key - which canvas.
     * @param {number} width - how wide.
     * @param {number} height - how tall.
     * @returns {HTMLCanvasElement} - the canvas.
     */
    _workCanvas (key, width, height) {
        if (!this[key]) {
            this[key] = document.createElement('canvas');
        }
        const canvas = this[key];
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        return canvas;
    }

    lookForFaces (args) {
        const frame = this._grabFrame(Cast.toString(args.SOURCE));
        if (!frame) {
            this._faces = [];
            this._matches = [];
            return Promise.resolve();
        }

        return this._detector.scan(frame)
            .then(faces => {
                this._faces = faces;
                // Names belong to the scan that produced them.
                this._matches = [];
                this._drawOutlines();
            })
            .catch(err => {
                this._faces = [];
                this._matches = [];
                // Reported once, on the console: a project that looks for faces
                // inside a loop must not open a dialog on every pass.
                // eslint-disable-next-line no-console
                console.warn(`Face Sense could not look: ${err.message}`);
            });
    }

    faceCount () {
        return this._faces.length;
    }

    /**
     * The face a block means, or null if it is asking for one that is not there.
     * @param {*} index - the block's face number, counted from 1.
     * @returns {?object} - the face.
     */
    _face (index) {
        const i = Math.round(Cast.toNumber(index)) - 1;
        if (i < 0 || i >= this._faces.length) return null;
        return this._faces[i];
    }

    /**
     * Read one property off a face.
     * @param {object} face - the face.
     * @param {string} property - which property.
     * @returns {number} - the value, in stage units where it is a distance.
     */
    static _read (face, property) {
        switch (property) {
        case 'x':
            return Scratch3FaceSenseBlocks.toStage(face.centre.x, face.centre.y).x;
        case 'y':
            return Scratch3FaceSenseBlocks.toStage(face.centre.x, face.centre.y).y;
        case 'width':
            return face.width * STAGE_WIDTH;
        case 'height':
            return face.height * STAGE_HEIGHT;
        case 'tilt':
            return face.tilt;
        default:
            return 0;
        }
    }

    faceProperty (args) {
        const face = this._face(args.INDEX);
        if (!face) return 0;
        return Math.round(Scratch3FaceSenseBlocks._read(face, Cast.toString(args.PROPERTY)) * 100) / 100;
    }

    /**
     * One landmark, as a stage coordinate.
     * @param {object} face - the face it belongs to.
     * @param {number} landmarkIndex - which of the 478 points.
     * @param {string} property - x or y.
     * @returns {number} - the value.
     */
    static _readPoint (face, landmarkIndex, property) {
        const point = face.landmarks[landmarkIndex];
        if (!point) return 0;
        const stage = Scratch3FaceSenseBlocks.toStage(point.x, point.y);
        return property === 'y' ? stage.y : stage.x;
    }

    featureProperty (args) {
        const face = this._face(args.INDEX);
        if (!face) return 0;
        const landmarkIndex = FaceDetector.FEATURES[Cast.toString(args.FEATURE)];
        if (typeof landmarkIndex === 'undefined') return 0;
        return Math.round(
            Scratch3FaceSenseBlocks._readPoint(face, landmarkIndex, Cast.toString(args.PROPERTY)) * 100
        ) / 100;
    }

    pointProperty (args) {
        const face = this._face(args.INDEX);
        if (!face) return 0;
        const point = Math.round(Cast.toNumber(args.POINT)) - 1;
        if (point < 0 || point >= face.landmarks.length) return 0;
        return Math.round(
            Scratch3FaceSenseBlocks._readPoint(face, point, Cast.toString(args.PROPERTY)) * 100
        ) / 100;
    }

    // ------------------------------------------------------------- the moods

    /**
     * Work out which mood a face is wearing.
     * @param {object} face - the face.
     * @returns {string} - one of the mood names, or 'neutral'.
     */
    static _mood (face) {
        let best = 'neutral';
        let bestScore = MOOD_FLOOR;

        Object.keys(MOODS).forEach(mood => {
            let total = 0;
            let weight = 0;
            MOODS[mood].forEach(([shape, w]) => {
                total += (face.blendshapes[shape] || 0) * w;
                weight += w;
            });
            const score = weight ? total / weight : 0;
            if (score > bestScore) {
                bestScore = score;
                best = mood;
            }
        });

        return best;
    }

    moodOf (args) {
        const face = this._face(args.INDEX);
        if (!face) return '';
        return Scratch3FaceSenseBlocks._mood(face);
    }

    looksLike (args) {
        const face = this._face(args.INDEX);
        if (!face) return false;

        const wanted = Cast.toString(args.MOOD);
        if (LOOKS[wanted]) return LOOKS[wanted](face);
        return Scratch3FaceSenseBlocks._mood(face) === wanted;
    }

    // ---------------------------------------------------------- the learning

    /**
     * Cut one face out of a frame, ready for the embedder.
     * @param {HTMLCanvasElement} frame - the whole picture.
     * @param {object} face - whose box to cut to.
     * @returns {HTMLCanvasElement} - a square picture of just that face.
     */
    _crop (frame, face) {
        const marginX = face.width * CROP_MARGIN;
        const marginY = face.height * CROP_MARGIN;

        const left = Math.max(0, (face.box.left - marginX)) * frame.width;
        const top = Math.max(0, (face.box.top - marginY)) * frame.height;
        const right = Math.min(1, (face.box.right + marginX)) * frame.width;
        const bottom = Math.min(1, (face.box.bottom + marginY)) * frame.height;

        const canvas = this._workCanvas('_cropCanvas', EMBED_SIZE, EMBED_SIZE);
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, EMBED_SIZE, EMBED_SIZE);
        context.drawImage(
            frame,
            left, top, Math.max(1, right - left), Math.max(1, bottom - top),
            0, 0, EMBED_SIZE, EMBED_SIZE
        );
        return canvas;
    }

    learnFace (args) {
        const slot = Math.round(Cast.toNumber(args.SLOT));
        const name = Cast.toString(args.NAME);
        const frame = this._grabFrame(Cast.toString(args.SOURCE));
        if (!frame) return Promise.resolve();

        return this._detector.scan(frame)
            .then(faces => {
                if (!faces.length) return null;
                // The biggest face, which is the one closest to the camera and
                // so the one the child stood up to be photographed.
                const subject = faces.reduce((a, b) => (a.width > b.width ? a : b));
                return this._detector.embed(this._crop(frame, subject));
            })
            .then(embedding => {
                if (!embedding) return;
                const existing = this._learned.get(slot);
                if (existing && existing.name === name) {
                    // Learning the same person again adds a second look at
                    // them rather than replacing the first, which is what
                    // makes turning your head not break the match.
                    existing.samples.push(embedding);
                } else {
                    this._learned.set(slot, {name, samples: [embedding]});
                }
            })
            .catch(err => {
                // eslint-disable-next-line no-console
                console.warn(`Face Sense could not learn that face: ${err.message}`);
            });
    }

    forgetFaces () {
        this._learned.clear();
        this._matches = [];
    }

    // --------------------------------------------------------- the matching

    matchFaces (args) {
        const frame = this._grabFrame(Cast.toString(args.SOURCE));
        if (!frame) {
            this._faces = [];
            this._matches = [];
            return Promise.resolve();
        }

        return this._detector.scan(frame)
            .then(faces => {
                this._faces = faces;
                this._matches = [];
                this._drawOutlines();

                if (!this._learned.size) return null;

                // One embedding per face, in order, then matched below.
                return faces.reduce(
                    (chain, face, index) => chain.then(() => this._detector
                        .embed(this._crop(frame, face))
                        .then(embedding => {
                            this._matches[index] = this._bestMatch(embedding);
                        })),
                    Promise.resolve()
                );
            })
            .catch(err => {
                // eslint-disable-next-line no-console
                console.warn(`Face Sense could not match: ${err.message}`);
            });
    }

    /**
     * Which learned person a face vector is closest to.
     * @param {Array<number>} embedding - the face to place.
     * @returns {?object} - {slot, name} or null if nobody is close enough.
     */
    _bestMatch (embedding) {
        let best = null;
        let bestScore = MATCH_THRESHOLD;

        this._learned.forEach((person, slot) => {
            person.samples.forEach(sample => {
                const score = FaceDetector.similarity(embedding, sample);
                if (score > bestScore) {
                    bestScore = score;
                    best = {slot, name: person.name};
                }
            });
        });

        return best;
    }

    learnedFaceInView (args) {
        const slot = Math.round(Cast.toNumber(args.SLOT));
        return this._matches.some(match => match && match.slot === slot);
    }

    nameOfFace (args) {
        const i = Math.round(Cast.toNumber(args.INDEX)) - 1;
        const match = this._matches[i];
        return match ? match.name : 'unknown';
    }

    // -------------------------------------------------------- the outlines

    /**
     * Make the layer the outlines are drawn on, once.
     * @returns {boolean} - whether there is somewhere to draw.
     */
    _ensureOutlineLayer () {
        const renderer = this.runtime.renderer;
        if (!renderer) return false;
        if (this._outlineDrawable !== null) return true;

        try {
            this._outlineSkin = renderer.createBitmapSkin(
                new ImageData(STAGE_WIDTH, STAGE_HEIGHT), 1);
            // The pen layer, not the video layer. The camera preview is a
            // drawable on the video layer that appears asynchronously when
            // the camera comes up, and anything created on that layer before
            // it -- which the first scan easily is -- ends up underneath it,
            // drawn but never seen. The pen layer always sits above the video
            // and below the sprites, whatever the order things arrive in.
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

    /**
     * Draw a box round each face found by the last look.
     */
    _drawOutlines () {
        if (!this._showOutlines) return;
        if (!this._ensureOutlineLayer()) return;

        const canvas = this._workCanvas('_outlineCanvas', STAGE_WIDTH, STAGE_HEIGHT);
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
        context.strokeStyle = '#C1436D';
        context.lineWidth = 3;

        this._faces.forEach(face => {
            context.strokeRect(
                face.box.left * STAGE_WIDTH,
                face.box.top * STAGE_HEIGHT,
                face.width * STAGE_WIDTH,
                face.height * STAGE_HEIGHT
            );
        });

        this.runtime.renderer.updateBitmapSkin(
            this._outlineSkin,
            context.getImageData(0, 0, STAGE_WIDTH, STAGE_HEIGHT),
            1
        );
        this.runtime.requestRedraw();
    }

    /**
     * Take the boxes off the stage.
     */
    _clearOutlines () {
        if (this._outlineSkin === null || !this.runtime.renderer) return;
        this.runtime.renderer.updateBitmapSkin(
            this._outlineSkin, new ImageData(STAGE_WIDTH, STAGE_HEIGHT), 1);
        this.runtime.requestRedraw();
    }

    /**
     * Give back everything this extension holds when it is removed: the
     * models, the outline layer and the stop-sign listener. Safe to call more
     * than once; anything used again afterwards is simply loaded again.
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
        this._faces = [];
        this._matches = [];
        if (renderer) this.runtime.requestRedraw();
    }
}

module.exports = Scratch3FaceSenseBlocks;
