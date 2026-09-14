/**
 * Reading printed text for the Vision Sense extension, with Tesseract.js.
 *
 * Tesseract is the long-standing open-source text recognition engine
 * (Apache License 2.0); Tesseract.js is Tesseract compiled to WebAssembly,
 * running in a Web Worker it starts for itself. It reads English printed
 * text and gives back the whole text and every word with its box and how
 * sure it is of it. It does not read handwriting well, and does not try to.
 *
 * Everything is served by the app's resource server from
 * external-resources/visionSense/tesseract (scripts/download-vision-models.js):
 * the library, its worker script, the engine and the English data. Nothing
 * is fetched from the internet, and the English data is not copied into
 * browser storage either (cacheMethod 'none'): it is already on this
 * computer.
 *
 * The engine comes in two builds. The SIMD build is faster and runs on every
 * processor from the last fifteen years; the plain build is installed only
 * on request. They are tried in that order, so a machine that cannot run the
 * first falls back to the second if it is there.
 */

const RESOURCE_BASE = 'http://127.0.0.1:20112/visionSense/tesseract';

/** The global the Tesseract.js browser bundle defines. */
const GLOBAL_NAME = 'Tesseract';

/** The engine builds, best first. Only the LSTM recogniser is used. */
const CORES = ['tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'];

const LANGUAGE = 'eng';

/** Tesseract's "LSTM only" engine mode: the modern recogniser, no legacy data. */
const OEM_LSTM_ONLY = 1;

/**
 * How long the engine may sit unused before it is let go. A running worker
 * holds the engine and the English data in memory; starting it again takes
 * about a second.
 */
const IDLE_RELEASE_MS = 2 * 60 * 1000;

const exists = url => fetch(url, {method: 'HEAD'})
    .then(response => response.ok)
    .catch(() => false);

const loadScript = url => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-vision-sense-text="${url}"]`);
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
    script.dataset.visionSenseText = url;
    script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
    });
    script.addEventListener('error', () => reject(new Error(`could not load ${url}`)));
    document.head.appendChild(script);
});

const clamp = value => Math.max(0, Math.min(1, value));

class TextReader {
    constructor () {
        this._worker = null;
        this._workerPromise = null;
        this._busy = 0;
        this._idleTimer = null;
        this.idleReleaseMs = IDLE_RELEASE_MS;
        /** Which engine build is running, once one is. */
        this.core = null;
    }

    /**
     * Start a Tesseract worker on the best engine build that works here.
     * @returns {Promise<object>} - the Tesseract.js worker.
     * @private
     */
    async _startWorker () {
        const installed = await exists(`${RESOURCE_BASE}/tesseract.min.js`) &&
            await exists(`${RESOURCE_BASE}/lang/${LANGUAGE}.traineddata.gz`);
        if (!installed) {
            throw new Error('text reading is not installed: run npm run fetch:vision-models');
        }
        if (!window[GLOBAL_NAME]) await loadScript(`${RESOURCE_BASE}/tesseract.min.js`);
        const Tesseract = window[GLOBAL_NAME];
        if (!Tesseract || typeof Tesseract.createWorker !== 'function') {
            throw new Error('the text reading engine did not load');
        }

        let lastError = null;
        for (const core of CORES) {
            if (!(await exists(`${RESOURCE_BASE}/core/${core}`))) continue;
            try {
                const worker = await Tesseract.createWorker(LANGUAGE, OEM_LSTM_ONLY, {
                    workerPath: `${RESOURCE_BASE}/worker.min.js`,
                    corePath: `${RESOURCE_BASE}/core/${core}`,
                    langPath: `${RESOURCE_BASE}/lang`,
                    cacheMethod: 'none',
                    gzip: true
                });
                this.core = core;
                return worker;
            } catch (err) {
                lastError = err;
            }
        }
        if (lastError) {
            const reason = lastError && lastError.message ? lastError.message : String(lastError);
            throw new Error(`the text reading engine could not start on this computer (${reason}); ` +
                'if its processor has no SIMD, run node scripts/download-vision-models.js --with-nosimd');
        }
        throw new Error('text reading is not installed: run npm run fetch:vision-models');
    }

    /**
     * The worker, started once.
     * @returns {Promise<object>} - the Tesseract.js worker.
     */
    load () {
        if (this._worker) return Promise.resolve(this._worker);
        if (this._workerPromise) return this._workerPromise;
        this._workerPromise = this._startWorker()
            .then(worker => {
                this._worker = worker;
                return worker;
            })
            .catch(err => {
                this._workerPromise = null;
                throw err;
            });
        return this._workerPromise;
    }

    /**
     * Read the printed text in a picture.
     * @param {HTMLCanvasElement} canvas - the picture.
     * @returns {Promise<{text: string, words: Array}>} - all the text, and each
     *     word with its box as fractions of the picture and a 0-1 score.
     */
    async read (canvas) {
        this._busy += 1;
        this._cancelRelease();
        try {
            const worker = await this.load();
            const {data} = await worker.recognize(canvas, {}, {text: true, blocks: true});
            const width = canvas.width || 1;
            const height = canvas.height || 1;
            const words = [];
            for (const block of (data.blocks || [])) {
                for (const paragraph of (block.paragraphs || [])) {
                    for (const line of (paragraph.lines || [])) {
                        for (const word of (line.words || [])) {
                            const text = String(word.text || '').trim();
                            if (!text || !word.bbox) continue;
                            words.push({
                                name: text,
                                score: clamp((Number(word.confidence) || 0) / 100),
                                box: {
                                    left: clamp(word.bbox.x0 / width),
                                    top: clamp(word.bbox.y0 / height),
                                    right: clamp(word.bbox.x1 / width),
                                    bottom: clamp(word.bbox.y1 / height)
                                }
                            });
                        }
                    }
                }
            }
            return {text: String(data.text || '').trim(), words};
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
        if (!this._worker || !(this.idleReleaseMs > 0)) return;
        this._idleTimer = setTimeout(() => {
            this._idleTimer = null;
            if (this._busy > 0) {
                this._armRelease();
                return;
            }
            this.dispose();
        }, this.idleReleaseMs);
    }

    /** Whether the engine is running. */
    get loaded () {
        return this._worker !== null;
    }

    dispose () {
        this._cancelRelease();
        const worker = this._worker;
        this._worker = null;
        this._workerPromise = null;
        this.core = null;
        if (worker) worker.terminate().catch(() => null);
    }
}

TextReader.RESOURCE_BASE = RESOURCE_BASE;
TextReader.CORES = CORES;
TextReader.IDLE_RELEASE_MS = IDLE_RELEASE_MS;

module.exports = TextReader;
