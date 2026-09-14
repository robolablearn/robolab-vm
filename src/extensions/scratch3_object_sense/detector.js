/**
 * Object detection for the Object Sense extension, on MediaPipe.
 *
 * Built to be light. Measured on the development laptop, on one camera frame:
 *
 *     model / delegate     start   per look   sees the person
 *     float16 on GPU       3.3 s     50 ms    yes
 *     float16 on CPU       0.5 s    430 ms    yes
 *     int8    on CPU       0.3 s    190 ms    yes
 *     int8    on GPU       3.7 s      -       nothing at all
 *
 * The GPU path pays a three second shader compile before its first answer,
 * and the GPU refuses the small integer model outright. The integer model on
 * the CPU answers a third of a second after it is asked, five times a second
 * after that, takes 4.4 MB rather than 7, and holds no GPU memory. For a
 * block that asks "is there a cup?" that is the right trade.
 *
 * The runtime is not bundled either: MediaPipe is loaded by a script tag and
 * served, with its WebAssembly, by the app's own resource server. Face Sense
 * ships the same pinned release, so by default this extension borrows that
 * copy instead of installing 22 MB of its own; it uses its own if one has
 * been installed (`fetch:object-models --own-runtime`), and says plainly
 * which command to run if neither is there.
 */

/** Where the resource server publishes this extension's files. */
const RESOURCE_BASE = 'http://127.0.0.1:20112/objectSense';

/** Where Face Sense's copy of the same runtime lives. */
const SHARED_RUNTIME_BASE = 'http://127.0.0.1:20112/faceSense';

/** The global that the MediaPipe browser bundle defines. */
const GLOBAL_NAME = 'Vision';

/** The integer model, on the CPU. See the table above. */
const MODEL_FILE = 'efficientdet_lite0.tflite';
const DELEGATE = 'CPU';

/** How many objects to report. Ten is plenty for a desk or a classroom. */
const MAX_OBJECTS = 10;

/**
 * Everything the model can name, in the model's own order and spelling. The
 * COCO set of eighty everyday things; the words are what the model returns,
 * so they have to match exactly, "tv" and "couch" included.
 * @readonly
 */
const LABELS = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
    'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
    'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
    'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
    'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
    'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
    'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
    'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
    'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
    'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
    'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
    'hair drier', 'toothbrush'
];

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
 * The tag is marked for Face Sense as well as for this extension, so that
 * whichever of the two loads the shared runtime first, the other finds the
 * tag and does not fetch and run the bundle a second time.
 * @param {string} url - the script to load.
 * @returns {Promise} - resolved once it has run.
 */
const loadScript = url => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-object-sense="${url}"], script[data-face-sense="${url}"]`);
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
    script.dataset.objectSense = url;
    script.dataset.faceSense = url;
    script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
    });
    script.addEventListener('error', () => reject(new Error(`could not load ${url}`)));
    document.head.appendChild(script);
});

/**
 * How long the model may sit unused before it is let go. A loaded detector
 * holds its own WebAssembly memory; a project that has moved on to other
 * blocks should not keep paying for it. Reloading it takes well under a
 * second, and the runtime itself stays loaded for whoever else uses it.
 */
const IDLE_RELEASE_MS = 2 * 60 * 1000;

class ObjectDetector {
    constructor () {
        this._vision = null;
        this._fileset = null;
        this._detector = null;
        this._reconfiguring = null;
        // The load in flight, so two blocks running in the same frame wait on
        // one load instead of starting a second.
        this._detectorPromise = null;
        this._confidence = 0.5;
        // Scans in flight, and the timer that lets an unused model go.
        this._busy = 0;
        this._idleTimer = null;
        this.idleReleaseMs = IDLE_RELEASE_MS;
    }

    _cancelRelease () {
        if (this._idleTimer !== null) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }

    /**
     * Start the idle clock. When it runs out the model is closed, unless a scan
     * is in flight, in which case the clock simply starts again: the model is
     * never pulled out from under a detect.
     * @private
     */
    _armRelease () {
        this._cancelRelease();
        if (!this._detector || !(this.idleReleaseMs > 0)) return;
        this._idleTimer = setTimeout(() => {
            this._idleTimer = null;
            if (this._busy > 0) {
                this._armRelease();
                return;
            }
            this._releaseModel();
        }, this.idleReleaseMs);
    }

    _releaseModel () {
        const detector = this._detector;
        this._detector = null;
        this._detectorPromise = null;
        this._reconfiguring = null;
        if (detector) detector.close();
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
        throw new Error('the object sensing runtime is not installed: run npm run fetch:object-models -- --own-runtime');
    }

    /**
     * Have the MediaPipe runtime ready.
     * @returns {Promise<object>} - the resolved fileset.
     * @private
     */
    async _loadVision () {
        if (this._fileset) return this._fileset;
        const base = await this._runtimeBase();
        // If the other extension has already put the runtime on the window
        // there is nothing to fetch; the WebAssembly still has to be resolved.
        if (!window[GLOBAL_NAME]) {
            await loadScript(`${base}/vision_bundle.js`);
        }
        this._vision = window[GLOBAL_NAME];
        if (!this._vision) {
            throw new Error('the object sensing runtime did not load');
        }
        this._fileset = await this._vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
        return this._fileset;
    }

    /**
     * The detector, made once.
     * @returns {Promise<object>} - the MediaPipe ObjectDetector.
     */
    loadDetector () {
        if (this._detector) return Promise.resolve(this._detector);
        if (this._detectorPromise) return this._detectorPromise;

        this._detectorPromise = this._loadVision()
            .then(fileset => this._vision.ObjectDetector.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: `${RESOURCE_BASE}/models/${MODEL_FILE}`,
                    delegate: DELEGATE
                },
                runningMode: 'IMAGE',
                maxResults: MAX_OBJECTS,
                scoreThreshold: this._confidence
            }))
            .then(detector => {
                this._detector = detector;
                return detector;
            })
            .catch(err => {
                // Cleared so the next block tries again, rather than every
                // later block inheriting one rejected promise.
                this._detectorPromise = null;
                throw err;
            });
        return this._detectorPromise;
    }

    /**
     * The score below which a detection is not reported, 0-1.
     * @param {number} value - the new minimum.
     * @returns {Promise} - resolved once the detector has taken it.
     */
    setConfidence (value) {
        // Nothing to do for the value already in force. A block left inside a
        // loop would otherwise rebuild the graph on every pass, and a graph
        // that is forever being rebuilt never has a frame to answer with.
        if (value === this._confidence && this._detector) return Promise.resolve();
        this._confidence = value;
        if (!this._detector) return Promise.resolve();
        // setOptions tears the graph down and starts it again, asynchronously.
        // A detect that lands in the middle of that comes back empty rather
        // than failing, so the promise is kept for scan to wait on.
        this._reconfiguring = Promise.resolve(this._detector.setOptions({
            scoreThreshold: value
        })).catch(() => {}).then(() => {
            this._reconfiguring = null;
        });
        return this._reconfiguring;
    }

    /**
     * Find the objects in a picture.
     * @param {HTMLCanvasElement} canvas - the picture.
     * @returns {Promise<Array>} - the objects, left to right.
     */
    async scan (canvas) {
        this._busy += 1;
        this._cancelRelease();
        try {
            const detector = await this.loadDetector();
            if (this._reconfiguring) await this._reconfiguring;
            const result = detector.detect(canvas);
            const objects = (result.detections || [])
                .map(detection => this._describe(detection, canvas.width, canvas.height))
                .filter(Boolean);
            // Left to right as the user sees them, so "object 1" means the same
            // thing between one scan and the next instead of following the
            // model's own ordering, which is by score and jumps about.
            objects.sort((a, b) => a.box.left - b.box.left);
            return objects;
        } finally {
            this._busy -= 1;
            this._armRelease();
        }
    }

    /**
     * Turn one raw detection into the shape the blocks want.
     *
     * MediaPipe gives the box in pixels of the picture it was handed; the
     * blocks work in fractions of the picture, which is what the stage
     * conversion expects and what stays true whatever size the picture was.
     * @param {object} detection - one of result.detections.
     * @param {number} width - the picture's width in pixels.
     * @param {number} height - the picture's height in pixels.
     * @returns {?object} - the object, or null for a detection with no box or name.
     * @private
     */
    _describe (detection, width, height) {
        const bb = detection.boundingBox;
        const category = detection.categories && detection.categories[0];
        if (!bb || !category || !width || !height) return null;
        const clamp = v => Math.max(0, Math.min(1, v));
        const left = clamp(bb.originX / width);
        const top = clamp(bb.originY / height);
        const right = clamp((bb.originX + bb.width) / width);
        const bottom = clamp((bb.originY + bb.height) / height);
        return {
            name: category.categoryName,
            score: category.score,
            box: {left, top, right, bottom},
            centre: {x: (left + right) / 2, y: (top + bottom) / 2},
            width: right - left,
            height: bottom - top
        };
    }

    /** Whether the model is in memory. */
    get loaded () {
        return this._detector !== null;
    }

    dispose () {
        this._cancelRelease();
        this._releaseModel();
    }
}

ObjectDetector.IDLE_RELEASE_MS = IDLE_RELEASE_MS;
ObjectDetector.LABELS = LABELS;
ObjectDetector.RESOURCE_BASE = RESOURCE_BASE;
ObjectDetector.SHARED_RUNTIME_BASE = SHARED_RUNTIME_BASE;
ObjectDetector.MAX_OBJECTS = MAX_OBJECTS;
ObjectDetector.DELEGATE = DELEGATE;

module.exports = ObjectDetector;
