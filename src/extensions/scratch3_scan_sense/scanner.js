/**
 * Reading QR codes for the Scan Sense extension, with jsQR in a Web Worker.
 *
 * jsQR (https://github.com/cozmo/jsQR, Apache License 2.0) is a small,
 * dependency-free decoder in plain JavaScript: no model, no WebAssembly,
 * nothing to download. It is bundled here as text and started as a worker
 * from a Blob, the way the speech runtime starts its own, so that decoding
 * never runs on the editor's thread.
 *
 * That matters more than it sounds. Reading a frame that has a code in it
 * takes 15-20 ms, but a frame with no code in it -- which is most frames --
 * can take far longer, because the decoder chases every speck that might be
 * a finder pattern: 7 ms for a plain room, but 190 ms for the grainy picture
 * a webcam gives in poor light (480x360, measured 2026-09-13). A project that
 * scans in a forever loop would stutter the whole editor on the main thread.
 * In the worker it only slows the scanning, not the blocks around it.
 *
 * Everything jsQR-shaped lives here; the block layer is handed plain corner
 * points in picture pixels and the text.
 */

// The decoder's own source, as text, to run inside the worker. The `!!`
// switches off every other loader so the file arrives exactly as published.
const JSQR_SOURCE = require('!!raw-loader!jsqr/dist/jsQR.js');

/**
 * What the worker does with a picture. Inside a worker the jsQR bundle
 * finds no module system and puts itself on `self.jsQR`.
 *
 * Only dark-on-light codes are looked for: trying the inverted picture too
 * would find light-on-dark ones, but doubles the time on every frame that
 * has no code in it, and printed codes are almost all dark on light.
 */
const WORKER_HANDLER = `
;(function () {
    var decode = self.jsQR;
    self.onmessage = function (event) {
        var job = event.data;
        var reply = {id: job.id, found: null, error: null};
        try {
            var result = decode(new Uint8ClampedArray(job.pixels), job.width, job.height, {
                inversionAttempts: 'dontInvert'
            });
            if (result && result.location) {
                var l = result.location;
                reply.found = {
                    text: result.data,
                    topLeft: {x: l.topLeftCorner.x, y: l.topLeftCorner.y},
                    topRight: {x: l.topRightCorner.x, y: l.topRightCorner.y},
                    bottomLeft: {x: l.bottomLeftCorner.x, y: l.bottomLeftCorner.y},
                    bottomRight: {x: l.bottomRightCorner.x, y: l.bottomRightCorner.y}
                };
            }
        } catch (err) {
            reply.error = String(err && err.message ? err.message : err);
        }
        self.postMessage(reply);
    };
})();
`;

/**
 * How long the worker may sit unused before it is let go. It is small -- a
 * few megabytes -- but a project that has stopped scanning should not keep
 * a thread around; starting it again takes a few milliseconds.
 */
const IDLE_RELEASE_MS = 2 * 60 * 1000;

/**
 * How long one picture may take before the worker is assumed stuck and
 * replaced. The slowest measured frame took a fifth of a second; this is
 * far beyond anything the decoder does on a picture this size.
 */
const SCAN_TIMEOUT_MS = 10 * 1000;

class CodeScanner {
    constructor () {
        this.idleReleaseMs = IDLE_RELEASE_MS;
        this._worker = null;
        this._workerUrl = null;
        this._nextId = 1;
        /** Scans sent to the worker and not yet answered, by id. */
        this._jobs = new Map();
        this._idleTimer = null;
    }

    /**
     * The worker, started on first use.
     * @returns {Worker} - the worker.
     * @private
     */
    _ensureWorker () {
        if (this._worker) return this._worker;
        this._workerUrl = URL.createObjectURL(new Blob(
            [`${JSQR_SOURCE}\n${WORKER_HANDLER}`],
            {type: 'application/javascript'}
        ));
        const worker = new Worker(this._workerUrl);
        worker.onmessage = event => this._onReply(event.data);
        worker.onerror = event => {
            if (event && event.preventDefault) event.preventDefault();
            this._restart(new Error(`the code scanner stopped: ${event && event.message ? event.message : 'unknown'}`));
        };
        this._worker = worker;
        return worker;
    }

    _onReply (reply) {
        const job = reply && this._jobs.get(reply.id);
        if (!job) return;
        this._jobs.delete(reply.id);
        clearTimeout(job.timer);
        if (reply.error) job.reject(new Error(`the code scanner failed: ${reply.error}`));
        else job.resolve(reply.found);
        this._armIdleRelease();
    }

    /**
     * Look for a code in a picture.
     * @param {ImageData} image - the picture; it is copied, not taken.
     * @returns {Promise<?object>} - the text and four corners in picture pixels, or null.
     */
    scan (image) {
        this._cancelIdleRelease();
        let worker;
        try {
            worker = this._ensureWorker();
        } catch (err) {
            return Promise.reject(new Error(`the code scanner could not start: ${err.message}`));
        }
        // A copy, handed over outright: the camera keeps reusing its own
        // buffer for the next frame, so that one must not be taken away.
        const pixels = new Uint8ClampedArray(image.data);
        const id = this._nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => this._restart(new Error('the code scanner took too long and was restarted')),
                SCAN_TIMEOUT_MS
            );
            this._jobs.set(id, {resolve, reject, timer});
            worker.postMessage(
                {id, pixels: pixels.buffer, width: image.width, height: image.height},
                [pixels.buffer]
            );
        });
    }

    /**
     * Throw the worker away, failing whatever it was doing, so the next scan
     * starts a fresh one.
     * @param {Error} err - what to fail the waiting scans with.
     * @private
     */
    _restart (err) {
        this._terminate();
        const jobs = Array.from(this._jobs.values());
        this._jobs.clear();
        jobs.forEach(job => {
            clearTimeout(job.timer);
            job.reject(err);
        });
    }

    _terminate () {
        this._cancelIdleRelease();
        if (this._worker) this._worker.terminate();
        if (this._workerUrl) URL.revokeObjectURL(this._workerUrl);
        this._worker = null;
        this._workerUrl = null;
    }

    _cancelIdleRelease () {
        if (this._idleTimer !== null) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }

    _armIdleRelease () {
        this._cancelIdleRelease();
        if (!this._worker || this._jobs.size > 0 || !(this.idleReleaseMs > 0)) return;
        this._idleTimer = setTimeout(() => {
            this._idleTimer = null;
            if (this._jobs.size === 0) this._terminate();
        }, this.idleReleaseMs);
    }

    /** Whether a worker is running. */
    get running () {
        return this._worker !== null;
    }

    dispose () {
        this._restart(new Error('the code scanner was closed'));
    }
}

CodeScanner.IDLE_RELEASE_MS = IDLE_RELEASE_MS;

module.exports = CodeScanner;
