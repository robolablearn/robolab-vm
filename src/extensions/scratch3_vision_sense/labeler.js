/**
 * Naming what a picture shows, for the Vision Sense extension, on MediaPipe.
 *
 * MediaPipe's image classifier with EfficientNet-Lite0: the small integer
 * model, 5.4 MB, trained on ImageNet to tell 1,000 everyday things apart --
 * animals, food, vehicles, household things. Its metadata states the Apache
 * License 2.0. It gives a few best guesses for the whole picture, with how
 * sure it is of each, and no positions.
 *
 * On the CPU, like Object Sense's detector: the GPU would compile shaders for
 * seconds before its first answer, and refuses integer models anyway.
 *
 * The runtime is the same pinned MediaPipe release Face, Object and Body
 * Sense use, borrowed from whichever of them is installed. Only the model is
 * this extension's own (scripts/download-vision-models.js).
 */

const RESOURCE_BASE = 'http://127.0.0.1:20112/visionSense';

/** Where a copy of the runtime may be, in the order they are tried. */
const RUNTIME_BASES = [
    RESOURCE_BASE,
    'http://127.0.0.1:20112/faceSense',
    'http://127.0.0.1:20112/objectSense',
    'http://127.0.0.1:20112/bodySense'
];

/** The global the MediaPipe browser bundle defines. */
const GLOBAL_NAME = 'Vision';

const MODEL_FILE = 'efficientnet_lite0.tflite';
const DELEGATE = 'CPU';

/** How many guesses to give. More than five are rarely more than noise. */
const MAX_LABELS = 5;

/** ImageNet's first class is "nothing in particular"; it is never an answer. */
const IGNORED_LABELS = ['background'];

/**
 * How long the model may sit unused before it is let go. A loaded classifier
 * holds its own WebAssembly memory; reloading it takes well under a second.
 */
const IDLE_RELEASE_MS = 2 * 60 * 1000;

const exists = url => fetch(url, {method: 'HEAD'})
    .then(response => response.ok)
    .catch(() => false);

/**
 * Load a classic script once. The tag is marked for every extension that
 * shares the runtime, so whichever loads it first, the others reuse it.
 * @param {string} url - the script.
 * @returns {Promise} - resolved once it has run.
 */
const loadScript = url => new Promise((resolve, reject) => {
    const marks = ['vision-sense', 'face-sense', 'object-sense', 'body-sense'];
    const existing = document.querySelector(marks.map(mark => `script[data-${mark}="${url}"]`).join(', '));
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
    script.dataset.visionSense = url;
    script.dataset.faceSense = url;
    script.dataset.objectSense = url;
    script.dataset.bodySense = url;
    script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
    });
    script.addEventListener('error', () => reject(new Error(`could not load ${url}`)));
    document.head.appendChild(script);
});

class PictureLabeler {
    constructor () {
        this._vision = null;
        this._fileset = null;
        this._classifier = null;
        this._classifierPromise = null;
        this._busy = 0;
        this._idleTimer = null;
        this.idleReleaseMs = IDLE_RELEASE_MS;
    }

    /**
     * The first place the runtime is installed.
     * @returns {Promise<string>} - its base URL.
     * @private
     */
    async _runtimeBase () {
        for (const base of RUNTIME_BASES) {
            if (await exists(`${base}/vision_bundle.js`)) return base;
        }
        throw new Error('the picture recognition runtime is not installed: run npm run fetch:face-models');
    }

    async _loadVision () {
        if (this._fileset) return this._fileset;
        const base = await this._runtimeBase();
        if (!window[GLOBAL_NAME]) await loadScript(`${base}/vision_bundle.js`);
        this._vision = window[GLOBAL_NAME];
        if (!this._vision) throw new Error('the picture recognition runtime did not load');
        this._fileset = await this._vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
        return this._fileset;
    }

    /**
     * The classifier, made once.
     * @returns {Promise<object>} - the MediaPipe ImageClassifier.
     */
    load () {
        if (this._classifier) return Promise.resolve(this._classifier);
        if (this._classifierPromise) return this._classifierPromise;
        const modelUrl = `${RESOURCE_BASE}/models/${MODEL_FILE}`;
        this._classifierPromise = exists(modelUrl)
            .then(found => {
                if (!found) {
                    throw new Error('the picture labelling model is not installed: run npm run fetch:vision-models');
                }
                return this._loadVision();
            })
            .then(fileset => this._vision.ImageClassifier.createFromOptions(fileset, {
                baseOptions: {modelAssetPath: modelUrl, delegate: DELEGATE},
                runningMode: 'IMAGE',
                // One spare, in case "background" is among the best.
                maxResults: MAX_LABELS + IGNORED_LABELS.length
            }))
            .then(classifier => {
                this._classifier = classifier;
                return classifier;
            })
            .catch(err => {
                this._classifierPromise = null;
                throw err;
            });
        return this._classifierPromise;
    }

    /**
     * The best guesses at what a picture shows.
     * @param {HTMLCanvasElement} canvas - the picture.
     * @returns {Promise<Array<{name: string, score: number}>>} - most likely first.
     */
    async label (canvas) {
        this._busy += 1;
        this._cancelRelease();
        try {
            const classifier = await this.load();
            const result = classifier.classify(canvas);
            const head = result && result.classifications && result.classifications[0];
            return ((head && head.categories) || [])
                .filter(category => category.categoryName && IGNORED_LABELS.indexOf(category.categoryName) < 0)
                .slice(0, MAX_LABELS)
                .map(category => ({name: category.categoryName, score: category.score}));
        } finally {
            this._busy -= 1;
            this._armRelease();
        }
    }

    _cancelRelease () {
        if (this._idleTimer !== null) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }

    _armRelease () {
        this._cancelRelease();
        if (!this._classifier || !(this.idleReleaseMs > 0)) return;
        this._idleTimer = setTimeout(() => {
            this._idleTimer = null;
            if (this._busy > 0) {
                this._armRelease();
                return;
            }
            this.dispose();
        }, this.idleReleaseMs);
    }

    /** Whether the model is in memory. */
    get loaded () {
        return this._classifier !== null;
    }

    dispose () {
        this._cancelRelease();
        if (this._classifier) this._classifier.close();
        this._classifier = null;
        this._classifierPromise = null;
    }
}

PictureLabeler.RESOURCE_BASE = RESOURCE_BASE;
PictureLabeler.MAX_LABELS = MAX_LABELS;
PictureLabeler.IDLE_RELEASE_MS = IDLE_RELEASE_MS;

module.exports = PictureLabeler;
