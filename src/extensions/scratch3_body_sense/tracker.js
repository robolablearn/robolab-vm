/**
 * Pose and hand tracking for the Body Sense extension, on MediaPipe.
 *
 * Two landmark models, loaded separately and only when a block first asks
 * for them: a project that only counts hands never loads the pose model. The
 * pose model gives 33 points on each person, the hand model 21 points on
 * each hand plus which hand it is. Both are asked in IMAGE mode, one picture
 * at a time, because a block asks for one picture at a time.
 *
 * Everything MediaPipe-shaped lives here so the block layer next door can
 * stay about blocks: it is handed plain objects with stage-ready fractions
 * in them and nothing of MediaPipe's own types.
 *
 * The runtime is not bundled: MediaPipe is loaded by a script tag and served,
 * with its WebAssembly, by the app's own resource server. Face Sense ships
 * the same pinned release, so by default this extension borrows that copy
 * instead of installing 22 MB of its own; it uses its own if one has been
 * installed (`fetch:body-models --own-runtime`), and says plainly which
 * command to run if neither is there.
 */

/** Where the resource server publishes this extension's files. */
const RESOURCE_BASE = 'http://127.0.0.1:20112/bodySense';

/** Where Face Sense's copy of the same runtime lives. */
const SHARED_RUNTIME_BASE = 'http://127.0.0.1:20112/faceSense';

/** The global that the MediaPipe browser bundle defines. */
const GLOBAL_NAME = 'Vision';

const POSE_MODEL = 'pose_landmarker_lite.task';
const HAND_MODEL = 'hand_landmarker.task';

/**
 * Where the models run. Measured on the development laptop, on one camera
 * frame, runtime already loaded:
 *
 *     model / delegate   start   first look   per look
 *     pose on GPU        0.4 s      7.8 s       37 ms
 *     pose on CPU        0.3 s      0.7 s      226 ms
 *     hand on GPU        0.3 s      4.2 s       16 ms
 *     hand on CPU        0.3 s      0.3 s      165 ms
 *
 * The GPU is far quicker once it is going, but it compiles its shaders
 * inside the first look, synchronously: twelve seconds of frozen editor
 * after the green flag before anything answers, which reads as a hang. The
 * CPU answers within a second and then four to six times a second, which is
 * enough for a sprite to follow a nose or a robot to wait for a raised hand.
 */
const DELEGATE = 'CPU';

/** How many people and hands to track. More costs time on every look. */
const MAX_PEOPLE = 3;
const MAX_HANDS = 2;

/** How sure the models must be before they report a person or a hand. */
const CONFIDENCE = 0.5;

/**
 * How long a model may sit unused before it is let go. Each loaded model
 * holds its own WebAssembly instance, about 85 MB for pose and 65 MB for
 * hands, and closing them gives all of it back (measured). A project that
 * has moved on to other blocks should not keep paying for that; a project
 * that comes back pays one reload, under two seconds, and carries on.
 */
const IDLE_RELEASE_MS = 2 * 60 * 1000;

/**
 * The body parts a block can name, as the pose model's point indices; a part
 * with two indices is the middle of them.
 *
 * Left and right here are the person's own, as they see them in the mirror
 * that the stage preview is. The pose model labels sides for an unmirrored
 * photograph, and the picture it is handed is mirrored, so its "left" is the
 * person's right; the table swaps them back. (The hand model is told the
 * picture is mirrored and needs no such swap.)
 * @readonly
 */
const PARTS = {
    nose: [0],
    'left eye': [5],
    'right eye': [2],
    'left ear': [8],
    'right ear': [7],
    mouth: [9, 10],
    'left shoulder': [12],
    'right shoulder': [11],
    'left elbow': [14],
    'right elbow': [13],
    'left wrist': [16],
    'right wrist': [15],
    'left hip': [24],
    'right hip': [23],
    'left knee': [26],
    'right knee': [25],
    'left ankle': [28],
    'right ankle': [27]
};

/** The lines that make a person's stick figure, as pairs of pose point indices. */
const BONES = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [24, 26], [26, 28],
    [0, 2], [0, 5], [2, 7], [5, 8]
];

/**
 * The fingers a block can name, with the hand model's point index for the
 * base knuckle, the middle joint and the tip of each.
 * @readonly
 */
const FINGERS = {
    thumb: {base: 2, middle: 3, tip: 4},
    'index finger': {base: 5, middle: 6, tip: 8},
    'middle finger': {base: 9, middle: 10, tip: 12},
    'ring finger': {base: 13, middle: 14, tip: 16},
    'little finger': {base: 17, middle: 18, tip: 20}
};

/** The lines that make a hand's outline, as pairs of hand point indices. */
const HAND_BONES = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [9, 10], [10, 11], [11, 12],
    [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17]
];

/** The hand model's point index for the wrist, and the knuckles that with it make the palm. */
const WRIST = 0;
const PALM = [0, 5, 9, 13, 17];

/**
 * Whether the resource server has a file. A HEAD to the local server, which
 * answers in a millisecond; used once, to pick a runtime.
 * @param {string} url - the file.
 * @returns {Promise<boolean>} - true if it is there.
 */
const exists = url => fetch(url, {method: 'HEAD'})
    .then(response => response.ok)
    .catch(() => false);

/**
 * Load a classic script once, and resolve when it has run.
 *
 * The tag is marked for the other camera extensions as well as for this one,
 * so that whichever of them loads the shared runtime first, the others find
 * the tag and do not fetch and run the bundle a second time.
 * @param {string} url - the script to load.
 * @returns {Promise} - resolved once it has run.
 */
const loadScript = url => new Promise((resolve, reject) => {
    const existing = document.querySelector(
        `script[data-body-sense="${url}"], script[data-face-sense="${url}"], script[data-object-sense="${url}"]`);
    if (existing) {
        if (existing.dataset.loaded === 'true') {
            resolve();
        } else {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error(`could not load ${url}`)));
        }
        return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.dataset.bodySense = url;
    script.dataset.faceSense = url;
    script.dataset.objectSense = url;
    script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
    });
    script.addEventListener('error', () => reject(new Error(`could not load ${url}`)));
    document.head.appendChild(script);
});

const clamp = v => Math.max(0, Math.min(1, v));

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

class BodyTracker {
    constructor () {
        this._vision = null;
        this._fileset = null;
        this._poser = null;
        this._hander = null;
        // The loads in flight, so two blocks running in the same frame wait
        // on one load instead of starting a second.
        this._poserPromise = null;
        this._handerPromise = null;
        // Looks in flight, and the timers that let an unused model go.
        this._busy = 0;
        this._idleTimers = {poser: null, hander: null};
        this.idleReleaseMs = IDLE_RELEASE_MS;
    }

    /**
     * A look is starting: nothing may be released until it is over. The
     * idle clocks keep running; one that goes off meanwhile sees the look
     * and simply starts again.
     * @private
     */
    _begin () {
        this._busy += 1;
    }

    /**
     * A look is over: restart the idle clock on the model it used. The
     * other model's clock is untouched, so a project that only ever looks
     * for hands still lets the pose model go.
     * @param {string} kind - 'poser' or 'hander'.
     * @private
     */
    _end (kind) {
        this._busy -= 1;
        this._armRelease(kind);
    }

    _cancelRelease (kind) {
        if (this._idleTimers[kind] !== null) {
            clearTimeout(this._idleTimers[kind]);
            this._idleTimers[kind] = null;
        }
    }

    _armRelease (kind) {
        this._cancelRelease(kind);
        if (!this[`_${kind}`] || !(this.idleReleaseMs > 0)) return;
        this._idleTimers[kind] = setTimeout(() => this._releaseIdle(kind), this.idleReleaseMs);
    }

    /**
     * Let an unused model go. If a look is in flight the clock simply starts
     * again; the model is never pulled out from under a detect.
     * @param {string} kind - 'poser' or 'hander'.
     * @private
     */
    _releaseIdle (kind) {
        this._idleTimers[kind] = null;
        if (this._busy > 0) {
            this._armRelease(kind);
            return;
        }
        const model = this[`_${kind}`];
        this[`_${kind}`] = null;
        this[`_${kind}Promise`] = null;
        if (model) model.close();
    }

    /**
     * Where to take the runtime from: this extension's own copy if one has
     * been installed, otherwise the copy Face Sense ships.
     * @returns {Promise<string>} - the base URL.
     * @private
     */
    async _runtimeBase () {
        if (await exists(`${RESOURCE_BASE}/vision_bundle.js`)) return RESOURCE_BASE;
        if (await exists(`${SHARED_RUNTIME_BASE}/vision_bundle.js`)) return SHARED_RUNTIME_BASE;
        throw new Error('the body sensing runtime is not installed: run npm run fetch:body-models -- --own-runtime');
    }

    /**
     * Have the MediaPipe runtime ready.
     * @returns {Promise<object>} - the resolved fileset.
     * @private
     */
    async _loadVision () {
        if (this._fileset) return this._fileset;
        const base = await this._runtimeBase();
        // If another extension has already put the runtime on the window
        // there is nothing to fetch; the WebAssembly still has to be resolved.
        if (!window[GLOBAL_NAME]) {
            await loadScript(`${base}/vision_bundle.js`);
        }
        this._vision = window[GLOBAL_NAME];
        if (!this._vision) {
            throw new Error('the body sensing runtime did not load');
        }
        this._fileset = await this._vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
        return this._fileset;
    }

    /**
     * The pose model, made once.
     * @returns {Promise<object>} - the MediaPipe PoseLandmarker.
     */
    loadPoser () {
        if (this._poser) return Promise.resolve(this._poser);
        if (this._poserPromise) return this._poserPromise;

        this._poserPromise = this._loadVision()
            .then(fileset => this._vision.PoseLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: `${RESOURCE_BASE}/models/${POSE_MODEL}`,
                    delegate: DELEGATE
                },
                runningMode: 'IMAGE',
                numPoses: MAX_PEOPLE,
                minPoseDetectionConfidence: CONFIDENCE,
                minPosePresenceConfidence: CONFIDENCE,
                minTrackingConfidence: CONFIDENCE,
                outputSegmentationMasks: false
            }))
            .then(poser => {
                this._poser = poser;
                return poser;
            })
            .catch(err => {
                // Cleared so the next block tries again, rather than every
                // later block inheriting one rejected promise.
                this._poserPromise = null;
                throw err;
            });
        return this._poserPromise;
    }

    /**
     * The hand model, made once.
     * @returns {Promise<object>} - the MediaPipe HandLandmarker.
     */
    loadHander () {
        if (this._hander) return Promise.resolve(this._hander);
        if (this._handerPromise) return this._handerPromise;

        this._handerPromise = this._loadVision()
            .then(fileset => this._vision.HandLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: `${RESOURCE_BASE}/models/${HAND_MODEL}`,
                    delegate: DELEGATE
                },
                runningMode: 'IMAGE',
                numHands: MAX_HANDS,
                minHandDetectionConfidence: CONFIDENCE,
                minHandPresenceConfidence: CONFIDENCE,
                minTrackingConfidence: CONFIDENCE
            }))
            .then(hander => {
                this._hander = hander;
                return hander;
            })
            .catch(err => {
                this._handerPromise = null;
                throw err;
            });
        return this._handerPromise;
    }

    /**
     * Find the people in a picture.
     * @param {HTMLCanvasElement} canvas - the picture.
     * @returns {Promise<Array>} - the people, left to right.
     */
    async findPeople (canvas) {
        this._begin();
        try {
            const poser = await this.loadPoser();
            const result = poser.detect(canvas);
            const people = (result.landmarks || [])
                .map(points => this._describePerson(points))
                .filter(Boolean);
            // Left to right as the user sees them, so "person 1" means the
            // same thing between one look and the next instead of following
            // the model's own ordering, which jumps about.
            people.sort((a, b) => a.centre.x - b.centre.x);
            return people;
        } finally {
            this._end('poser');
        }
    }

    /**
     * Find the hands in a picture.
     * @param {HTMLCanvasElement} canvas - the picture.
     * @returns {Promise<Array>} - the hands, left to right.
     */
    async findHands (canvas) {
        this._begin();
        try {
            const hander = await this.loadHander();
            const result = hander.detect(canvas);
            const sides = result.handednesses || result.handedness || [];
            const hands = (result.landmarks || [])
                .map((points, i) => this._describeHand(points, sides[i]))
                .filter(Boolean);
            hands.sort((a, b) => a.palm.x - b.palm.x);
            return hands;
        } finally {
            this._end('hander');
        }
    }

    /**
     * Turn one person's raw landmarks into the shape the blocks want.
     *
     * MediaPipe gives each point as a fraction of the picture, plus a
     * visibility where the model has one; a point it has no visibility for
     * counts as seen when it lands inside the picture.
     * @param {Array} points - the model's 33 landmarks.
     * @returns {?object} - the person, or null for an empty result.
     * @private
     */
    _describePerson (points) {
        if (!points || points.length < 33) return null;
        const seen = points.map(p => ({
            x: clamp(p.x),
            y: clamp(p.y),
            visible: typeof p.visibility === 'number' ?
                p.visibility >= CONFIDENCE :
                p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
        }));
        const parts = {};
        Object.keys(PARTS).forEach(name => {
            const idx = PARTS[name];
            parts[name] = {
                x: idx.reduce((sum, i) => sum + seen[i].x, 0) / idx.length,
                y: idx.reduce((sum, i) => sum + seen[i].y, 0) / idx.length,
                visible: idx.every(i => seen[i].visible)
            };
        });
        // The middle of the shoulders and hips: a steadier centre than the
        // nose, which leaves the picture the moment someone looks down.
        const torso = [11, 12, 23, 24];
        return {
            points: seen,
            parts,
            centre: {
                x: torso.reduce((sum, i) => sum + seen[i].x, 0) / torso.length,
                y: torso.reduce((sum, i) => sum + seen[i].y, 0) / torso.length
            }
        };
    }

    /**
     * Turn one hand's raw landmarks into the shape the blocks want.
     * @param {Array} points - the model's 21 landmarks.
     * @param {Array} side - the model's handedness categories for this hand.
     * @returns {?object} - the hand, or null for an empty result.
     * @private
     */
    _describeHand (points, side) {
        if (!points || points.length < 21) return null;
        const seen = points.map(p => ({x: clamp(p.x), y: clamp(p.y)}));
        const category = side && side[0];
        // The model is told the picture is mirrored, so its label is the
        // hand the person would call it themselves.
        const name = category && category.categoryName ? category.categoryName.toLowerCase() : '';
        return {
            points: seen,
            side: name === 'left' || name === 'right' ? name : '',
            score: category && typeof category.score === 'number' ? category.score : 0,
            palm: {
                x: PALM.reduce((sum, i) => sum + seen[i].x, 0) / PALM.length,
                y: PALM.reduce((sum, i) => sum + seen[i].y, 0) / PALM.length
            }
        };
    }

    /**
     * Whether a finger is held out straight rather than curled in.
     *
     * A finger is raised when its tip is further from the wrist than its
     * middle joint is; a curled finger folds its tip back towards the palm.
     * The thumb does not fold towards the wrist but across the palm, so it
     * is measured from the little finger's knuckle instead.
     * @param {object} hand - a hand from findHands.
     * @param {string} finger - a key of FINGERS.
     * @returns {boolean} - true if raised.
     */
    static isFingerRaised (hand, finger) {
        const joints = FINGERS[finger];
        if (!hand || !joints) return false;
        const from = finger === 'thumb' ? hand.points[FINGERS['little finger'].base] : hand.points[WRIST];
        return distance(hand.points[joints.tip], from) > distance(hand.points[joints.middle], from);
    }

    dispose () {
        Object.keys(this._idleTimers).forEach(kind => this._cancelRelease(kind));
        if (this._poser) this._poser.close();
        if (this._hander) this._hander.close();
        this._poser = null;
        this._hander = null;
        this._poserPromise = null;
        this._handerPromise = null;
    }
}

BodyTracker.PARTS = PARTS;
BodyTracker.BONES = BONES;
BodyTracker.FINGERS = FINGERS;
BodyTracker.HAND_BONES = HAND_BONES;
BodyTracker.MAX_PEOPLE = MAX_PEOPLE;
BodyTracker.MAX_HANDS = MAX_HANDS;
BodyTracker.RESOURCE_BASE = RESOURCE_BASE;
BodyTracker.SHARED_RUNTIME_BASE = SHARED_RUNTIME_BASE;
BodyTracker.DELEGATE = DELEGATE;
BodyTracker.IDLE_RELEASE_MS = IDLE_RELEASE_MS;

module.exports = BodyTracker;
