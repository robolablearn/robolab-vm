/**
 * The looking half of the Face Sense extension.
 *
 * Everything MediaPipe-shaped lives here so the block layer next door can stay
 * about blocks. It is asked two things -- what faces are in a picture, and
 * what a face looks like as a vector -- and answers with plain objects that
 * carry no MediaPipe types in them.
 *
 * Nothing loads until it is asked for. A project with no face blocks pays
 * nothing, and a project that only counts faces never loads the 4 MB embedder.
 * That matters because the load happens when a block first runs, with the
 * green flag already down and someone watching.
 */

/** Where the resource server publishes the runtime and the models. */
const RESOURCE_BASE = 'http://127.0.0.1:20112/faceSense';

/** The global that the MediaPipe browser bundle defines. */
const GLOBAL_NAME = 'Vision';

/** How many faces to look at. More than this in front of one camera is a crowd. */
const MAX_FACES = 6;

/**
 * Landmark indices for the parts a block can name by hand.
 *
 * MediaPipe returns 478 points; these are the ones worth a name. Each is the
 * middle of the feature rather than an edge, because a block that asks for
 * "the nose" means the middle of it.
 */
const FEATURES = {
    'left eye': 468,
    'right eye': 473,
    nose: 4,
    mouth: 13,
    chin: 152,
    forehead: 10
};

/**
 * Load a classic script once, and resolve when it has run.
 *
 * A script tag rather than an import: the MediaPipe bundle is an IIFE that
 * hangs itself off the window, and loading it this way keeps webpack out of it
 * entirely. In the packaged app it is a file on disk, not a module in the
 * build.
 * @param {string} url - the script to load.
 * @returns {Promise} - resolved once it has run.
 */
const loadScript = url => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-face-sense="${url}"]`);
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
    script.dataset.faceSense = url;
    script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
    });
    script.addEventListener('error', () => reject(new Error(`could not load ${url}`)));
    document.head.appendChild(script);
});

/**
 * Where the models run. Measured in the editor on the development laptop, on
 * one 480x360 stage picture, 2026-09-13:
 *
 *     delegate   load and first look   later looks   longest editor freeze
 *     GPU               2.6 s              27 ms            2.5 s
 *     CPU               0.3 s             108 ms            0.5 s
 *
 * The GPU compiles its shaders inside the first look, freezing the editor for
 * seconds, and pays that again whenever a model is loaded afresh: after an
 * idle release, or when the extension is added back. On the CPU the first
 * answer comes at once and later ones still come about nine times a second,
 * plenty for a sprite that follows a face. Body Sense and Object Sense made
 * the same choice for the same reason.
 */
const DELEGATE = 'CPU';

/**
 * How long a model may sit unused before it is let go. The landmarker and
 * the embedder each hold their own WebAssembly memory; a project
 * that has stopped looking at faces should not keep paying for them. The
 * clocks are separate, so a project that never learns faces still lets the
 * landmarker go, and learned faces are kept either way: they are plain
 * vectors, not part of a model.
 */
const IDLE_RELEASE_MS = 2 * 60 * 1000;

class FaceDetector {
    constructor () {
        this._vision = null;
        this._fileset = null;
        this._landmarker = null;
        this._reconfiguring = null;
        this._embedder = null;

        // Loads in flight, so two blocks running in the same frame wait on one
        // load instead of starting a second.
        this._landmarkerPromise = null;
        this._embedderPromise = null;

        /**
         * How sure the model must be before it calls something a face. This is
         * handed to MediaPipe rather than used to filter afterwards, because
         * the landmarker does not report a score per face -- the threshold is
         * only meaningful inside the model.
         */
        this._confidence = 0.5;
        // Looks in flight, and the clocks that let an unused model go.
        this._busy = 0;
        this._idleTimers = {landmarker: null, embedder: null};
        this.idleReleaseMs = IDLE_RELEASE_MS;
    }

    _cancelRelease (kind) {
        if (this._idleTimers[kind] !== null) {
            clearTimeout(this._idleTimers[kind]);
            this._idleTimers[kind] = null;
        }
    }

    /**
     * Start a model's idle clock. If a look is in flight when it runs out, the
     * clock starts again: a model is never pulled out from under a detect.
     * @param {string} kind - 'landmarker' or 'embedder'.
     * @private
     */
    _armRelease (kind) {
        this._cancelRelease(kind);
        if (!this[`_${kind}`] || !(this.idleReleaseMs > 0)) return;
        this._idleTimers[kind] = setTimeout(() => {
            this._idleTimers[kind] = null;
            if (this._busy > 0) {
                this._armRelease(kind);
                return;
            }
            this._release(kind);
        }, this.idleReleaseMs);
    }

    _release (kind) {
        const model = this[`_${kind}`];
        this[`_${kind}`] = null;
        this[`_${kind}Promise`] = null;
        if (kind === 'landmarker') this._reconfiguring = null;
        if (model) model.close();
    }

    /**
     * Load the MediaPipe bundle and its WebAssembly.
     * @returns {Promise} - resolved with the fileset once both are ready.
     */
    async _loadVision () {
        if (this._fileset) return this._fileset;

        await loadScript(`${RESOURCE_BASE}/vision_bundle.js`);
        this._vision = window[GLOBAL_NAME];
        if (!this._vision) {
            throw new Error('the face sensing runtime did not load');
        }

        this._fileset = await this._vision.FilesetResolver.forVisionTasks(`${RESOURCE_BASE}/wasm`);
        return this._fileset;
    }

    /**
     * The model that finds faces, their landmarks and their expressions.
     *
     * One model does all three, which is why there is no separate detector:
     * asking where a face is and asking whether it is smiling is the same
     * pass over the same picture.
     * @returns {Promise} - resolved with the landmarker.
     */
    loadLandmarker () {
        if (this._landmarker) return Promise.resolve(this._landmarker);
        if (this._landmarkerPromise) return this._landmarkerPromise;

        this._landmarkerPromise = this._loadVision()
            .then(fileset => this._vision.FaceLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: `${RESOURCE_BASE}/models/face_landmarker.task`,
                    delegate: DELEGATE
                },
                runningMode: 'IMAGE',
                numFaces: MAX_FACES,
                minFaceDetectionConfidence: this._confidence,
                minFacePresenceConfidence: this._confidence,
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: false
            }))
            .then(landmarker => {
                this._landmarker = landmarker;
                return landmarker;
            })
            .catch(err => {
                // Cleared so the next block tries again, rather than every
                // later block inheriting one rejected promise.
                this._landmarkerPromise = null;
                throw err;
            });

        return this._landmarkerPromise;
    }

    /**
     * The model that turns a face into a vector, for the learning blocks.
     * @returns {Promise} - resolved with the embedder.
     */
    loadEmbedder () {
        if (this._embedder) return Promise.resolve(this._embedder);
        if (this._embedderPromise) return this._embedderPromise;

        this._embedderPromise = this._loadVision()
            .then(fileset => this._vision.ImageEmbedder.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: `${RESOURCE_BASE}/models/face_embedder.tflite`,
                    delegate: DELEGATE
                },
                runningMode: 'IMAGE',
                quantize: false
            }))
            .then(embedder => {
                this._embedder = embedder;
                return embedder;
            })
            .catch(err => {
                this._embedderPromise = null;
                throw err;
            });

        return this._embedderPromise;
    }

    /**
     * Set how sure the model must be before it reports a face.
     * @param {number} value - from 0 to 1.
     */
    setConfidence (value) {
        // Nothing to do for the value already in force. A block left inside a
        // loop would otherwise rebuild the graph on every pass, and a graph
        // that is forever being rebuilt never has a frame to answer with.
        if (value === this._confidence && this._landmarker) return Promise.resolve();
        this._confidence = value;
        if (!this._landmarker) return Promise.resolve();
        // setOptions tears the graph down and starts it again, asynchronously.
        // A detect that lands in the middle of that comes back empty rather
        // than failing, so the promise is kept for scan to wait on.
        this._reconfiguring = Promise.resolve(this._landmarker.setOptions({
            minFaceDetectionConfidence: value,
            minFacePresenceConfidence: value
        })).catch(() => {}).then(() => {
            this._reconfiguring = null;
        });
        return this._reconfiguring;
    }

    /**
     * Find the faces in one picture.
     * @param {HTMLCanvasElement} canvas - the frame to look at.
     * @returns {Promise<Array>} - one plain object per face, left to right.
     */
    async scan (canvas) {
        this._busy += 1;
        this._cancelRelease('landmarker');
        try {
            const landmarker = await this.loadLandmarker();
            if (this._reconfiguring) await this._reconfiguring;
            const result = landmarker.detect(canvas);

            const faces = (result.faceLandmarks || []).map((landmarks, index) => {
                const blendshapes = {};
                const shapes = (result.faceBlendshapes || [])[index];
                if (shapes && shapes.categories) {
                    shapes.categories.forEach(category => {
                        blendshapes[category.categoryName] = category.score;
                    });
                }
                return this._describe(landmarks, blendshapes);
            });

            // Left to right as the user sees them, so "face 1" means the same face
            // between one scan and the next instead of following the model's own
            // ordering, which is not stable.
            faces.sort((a, b) => a.box.left - b.box.left);

            return faces;
        } finally {
            this._busy -= 1;
            this._armRelease('landmarker');
        }
    }

    /**
     * Turn raw landmarks into the shape the blocks want.
     *
     * Coordinates stay normalised (0 to 1 across the frame) here. Converting
     * to stage units is the block layer's job, because it is the half that
     * knows how big the stage is.
     * @param {Array} landmarks - the 478 points, normalised.
     * @param {object} blendshapes - expression name to strength.
     * @returns {object} - one face.
     */
    _describe (landmarks, blendshapes) {
        let left = 1;
        let right = 0;
        let top = 1;
        let bottom = 0;

        landmarks.forEach(point => {
            if (point.x < left) left = point.x;
            if (point.x > right) right = point.x;
            if (point.y < top) top = point.y;
            if (point.y > bottom) bottom = point.y;
        });

        const leftEye = landmarks[FEATURES['left eye']];
        const rightEye = landmarks[FEATURES['right eye']];

        // The angle of the line between the eyes, which is what a person means
        // by a tilted head.
        let tilt = 0;
        if (leftEye && rightEye) {
            tilt = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180 / Math.PI;
        }

        return {
            box: {left, right, top, bottom},
            centre: {x: (left + right) / 2, y: (top + bottom) / 2},
            width: right - left,
            height: bottom - top,
            tilt: tilt,
            landmarks: landmarks,
            blendshapes: blendshapes
        };
    }

    /**
     * Describe a face as a vector, for comparing against learned faces.
     * @param {HTMLCanvasElement} canvas - a picture cropped to one face.
     * @returns {Promise<Array<number>>} - the embedding.
     */
    async embed (canvas) {
        this._busy += 1;
        this._cancelRelease('embedder');
        try {
            const embedder = await this.loadEmbedder();
            const result = embedder.embed(canvas);
            const embedding = result.embeddings && result.embeddings[0];
            if (!embedding || !embedding.floatEmbedding) {
                throw new Error('could not describe that face');
            }
            return Array.from(embedding.floatEmbedding);
        } finally {
            this._busy -= 1;
            this._armRelease('embedder');
        }
    }

    /**
     * How alike two faces are, from 0 (nothing alike) to 1 (the same picture).
     * @param {Array<number>} a - one embedding.
     * @param {Array<number>} b - the other.
     * @returns {number} - cosine similarity.
     */
    static similarity (a, b) {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Let go of the models. Called when the extension goes away.
     */
    dispose () {
        Object.keys(this._idleTimers).forEach(kind => this._cancelRelease(kind));
        this._release('landmarker');
        this._release('embedder');
    }
}

FaceDetector.IDLE_RELEASE_MS = IDLE_RELEASE_MS;
FaceDetector.DELEGATE = DELEGATE;
FaceDetector.FEATURES = FEATURES;
FaceDetector.RESOURCE_BASE = RESOURCE_BASE;
FaceDetector.MAX_FACES = MAX_FACES;

module.exports = FaceDetector;
