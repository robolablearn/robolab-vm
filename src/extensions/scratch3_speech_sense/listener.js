/**
 * Turning speech into words for the Speech Sense extension, on Vosk.
 *
 * Vosk is Kaldi compiled to WebAssembly (the vosk-browser build, Apache
 * 2.0), running in a Web Worker it makes for itself, with one small model
 * per language. The microphone is opened here in the editor, its sound is
 * handed to the worker as it arrives, and words come back as they are
 * recognised: partial words while a phrase is still being spoken, then a
 * final phrase once the speaker pauses. All of it happens on this computer;
 * nothing leaves it.
 *
 * Everything Vosk-shaped lives here so the block layer next door can stay
 * about blocks: it is handed plain strings and nothing of Vosk's own types.
 *
 * The runtime is not bundled: it is loaded by a script tag and served, with
 * its models, by the app's own resource server. What the download script
 * installed is listed in models.json there, and that is what the language
 * menu offers.
 */
const EventEmitter = require('events');

/** Where the resource server publishes this extension's files. */
const RESOURCE_BASE = 'http://127.0.0.1:20112/speechSense';

/** The list of installed models the download script writes. */
const MANIFEST_URL = `${RESOURCE_BASE}/models.json`;

/** The global that the Vosk browser bundle defines. */
const GLOBAL_NAME = 'Vosk';

/**
 * The rate the models were trained at. The audio context is asked to run at
 * it, so the microphone's sound is resampled once by the browser rather
 * than three times as much of it being posted to the worker for Kaldi to
 * resample itself.
 */
const SAMPLE_RATE = 16000;

/**
 * How much sound goes to the worker at a time: a quarter second at 16 kHz.
 * Measured: bigger chunks are slower, not faster (0.95 of real time at
 * 4096 samples against 1.26 at 8192 and 16384), so this is not a knob.
 */
const BUFFER_SIZE = 4096;

/**
 * How far the worker may fall behind the microphone before sound is dropped
 * to let it catch up: eight chunks is two seconds. Recognition runs close to
 * real time on a laptop (0.95 of real time on a six-core Ryzen 5, on the
 * English (US) model, measured 2026-09-12), so a slower machine cannot keep
 * up with someone who talks without pausing. Dropping the excess loses some
 * words but keeps the answers about now, not about a growing minute ago.
 */
const MAX_BACKLOG = 8;

/**
 * The quiet gate. Recognising costs the worker most of a processor core
 * for every second of sound it is given, whether anyone is talking or not,
 * so sound that is plainly just the room is not sent at all. A chunk counts
 * as sound when it is both above an absolute floor and several times louder
 * than the quietest level heard lately, which is what the room sounds like
 * on its own. After the last loud chunk the gate stays open for a while, so
 * that Kaldi still gets the trailing silence it needs to decide a phrase
 * has ended. Whispering under the floor is not heard; that is the trade.
 */
const GATE_MIN_LEVEL = 0.004; // RMS of the samples, about -48 dBFS
const GATE_ABOVE_ROOM = 3; // how many times louder than the room sound must be
const GATE_HOLD_MS = 1500; // how long the gate stays open after the last loud chunk
const GATE_ROOM_RISE = 1.01; // per chunk, how fast the remembered room level may creep up

/**
 * How long the model may sit unused after listening stops before it is let
 * go. A loaded model is a worker holding the model in memory, well over a
 * hundred megabytes; a project that has moved on should not keep paying
 * for that. The worker caches the unpacked model in IndexedDB, so a project
 * that comes back reloads it in a second or two.
 */
const IDLE_RELEASE_MS = 2 * 60 * 1000;

/**
 * How long to wait for the last words when listening stops. The worker
 * takes sound in the order it arrived, and on a slow machine it can be a
 * second or two behind the microphone, so the final words come after it
 * has caught up; waiting costs nothing but a recogniser lingering briefly.
 */
const FINAL_RESULT_WAIT_MS = 4000;

/** Vosk's own logging: -1 is warnings only. */
const LOG_LEVEL = -1;

/**
 * The languages the extension can offer, in menu order. Keep the keys and
 * names in step with LANGUAGES in scripts/download-speech-models.js, which
 * is what decides which of these are actually installed.
 * @readonly
 */
const LANGUAGES = [
    {key: 'en-in', name: 'English (India)'},
    {key: 'en-us', name: 'English (US)'},
    {key: 'hi', name: 'Hindi'},
    {key: 'gu', name: 'Gujarati'},
    {key: 'ar', name: 'Arabic (Tunisian)'},
    {key: 'zh', name: 'Chinese'},
    {key: 'ja', name: 'Japanese'},
    {key: 'ko', name: 'Korean'},
    {key: 'vi', name: 'Vietnamese'},
    {key: 'fr', name: 'French'},
    {key: 'de', name: 'German'},
    {key: 'es', name: 'Spanish'},
    {key: 'it', name: 'Italian'},
    {key: 'pt', name: 'Portuguese'},
    {key: 'nl', name: 'Dutch'},
    {key: 'pl', name: 'Polish'},
    {key: 'cs', name: 'Czech'},
    {key: 'ru', name: 'Russian'},
    {key: 'uk', name: 'Ukrainian'},
    {key: 'tr', name: 'Turkish'},
    {key: 'fa', name: 'Persian'},
    {key: 'ca', name: 'Catalan'},
    {key: 'eo', name: 'Esperanto'},
    {key: 'uz', name: 'Uzbek'},
    {key: 'kk', name: 'Kazakh'},
    {key: 'ky', name: 'Kyrgyz'},
    {key: 'tg', name: 'Tajik'},
    {key: 'ka', name: 'Georgian'}
];

const DEFAULT_LANGUAGE = 'en-in';

/**
 * Load a classic script once, and resolve when it has run.
 * @param {string} url - the script to load.
 * @returns {Promise} - resolved once it has run.
 */
const loadScript = url => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-speech-sense="${url}"]`);
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
    script.dataset.speechSense = url;
    script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
    });
    script.addEventListener('error', () => reject(new Error(`could not load ${url}`)));
    document.head.appendChild(script);
});

/**
 * Run a clean-up step that may throw, because the thing being cleaned up
 * has already gone, without letting that stop the rest of the clean-up.
 * @param {Function} step - what to try.
 */
const quietly = step => {
    try {
        step();
    } catch (err) {
        // Already closed or disconnected: the state we wanted anyway.
    }
};

/**
 * What to tell the user when the microphone cannot be opened.
 * @param {Error} err - what getUserMedia threw.
 * @returns {string} - a plain sentence.
 */
const describeMicrophoneError = err => {
    switch (err && err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
        return 'the microphone is not allowed';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
        return 'no microphone was found';
    case 'NotReadableError':
    case 'TrackStartError':
        return 'the microphone is in use by something else';
    default:
        return `the microphone could not be opened: ${err && err.message ? err.message : err}`;
    }
};

/**
 * Words as Vosk gives them, minus its "[unk]" marker for a sound it could
 * not place, which is not a word anyone said.
 * @param {*} text - what the recogniser wrote.
 * @returns {string} - the words, single-spaced.
 */
const cleanWords = text => String(text || '')
    .replace(/\[unk\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * An audio context at the model's rate, or at whatever rate the machine
 * insists on: Kaldi resamples for itself if it has to.
 * @returns {AudioContext} - the context.
 */
const makeAudioContext = () => {
    const Context = window.AudioContext || window.webkitAudioContext;
    try {
        return new Context({sampleRate: SAMPLE_RATE});
    } catch (err) {
        return new Context();
    }
};

/**
 * Events:
 *   'result'    (text)      a phrase was finished; text is never empty.
 *   'partial'   (text)      the words so far of the phrase being spoken; may be empty.
 *   'change'    (listening) listening turned on or off.
 *   'error'     (Error)     something went wrong; listening cannot go on.
 *   'warning'   (Error)     something is not right, but listening goes on.
 *   'languages' (list)      the installed languages were read.
 */
class SpeechListener extends EventEmitter {
    constructor () {
        super();
        /** The language to listen in: a key of LANGUAGES. */
        this.language = DEFAULT_LANGUAGE;
        /** The only phrases to listen for, or null for any words. */
        this.grammar = null;
        /** Whether the microphone is open and words are being recognised. */
        this.listening = false;
        /** The installed languages, once models.json has been read. */
        this.installed = null;
        /** How many chunks of sound were dropped because the worker was behind. */
        this.dropped = 0;
        /** Whether sound that is only the room is kept from the worker. */
        this.quietGate = true;
        /** How many chunks the quiet gate kept back. */
        this.skipped = 0;
        this.idleReleaseMs = IDLE_RELEASE_MS;

        // Chunks sent to the current recogniser that it has not answered yet.
        this._inFlight = 0;
        this._lagWarned = false;
        // The quiet gate's memory: how loud the room is, and how many more
        // chunks to let through after the last loud one.
        this._roomLevel = 1;
        this._holdChunks = 0;

        this._manifestPromise = null;
        this._model = null;
        this._modelLanguage = null;
        this._modelPromise = null;
        this._loadToken = null;
        this._recognizer = null;
        this._stream = null;
        this._context = null;
        this._source = null;
        this._processor = null;
        this._starting = null;
        this._stopping = null;
        this._idleTimer = null;
    }

    // ---------------------------------------------------------- the models

    /**
     * The languages the download script installed, from models.json. Read
     * once and kept; a failed read is not kept, so that a resource server
     * still starting up is asked again next time.
     * @returns {Promise<Array>} - {key, name, file} per language; empty if unknown.
     */
    installedLanguages () {
        if (this.installed) return Promise.resolve(this.installed);
        if (this._manifestPromise) return this._manifestPromise;
        this._manifestPromise = fetch(MANIFEST_URL)
            .then(response => {
                if (!response.ok) throw new Error(`${MANIFEST_URL} answered ${response.status}`);
                return response.json();
            })
            .then(manifest => {
                const languages = (Array.isArray(manifest.languages) ? manifest.languages : [])
                    .filter(entry => entry && entry.key && entry.file)
                    .map(entry => ({
                        key: String(entry.key),
                        name: String(entry.name || entry.key),
                        file: String(entry.file)
                    }));
                this.installed = languages;
                this.emit('languages', languages);
                return languages;
            })
            .catch(() => {
                this._manifestPromise = null;
                return [];
            });
        return this._manifestPromise;
    }

    /**
     * Where the model for a language is served from.
     * @param {string} language - a key of LANGUAGES.
     * @returns {string} - the archive's URL.
     * @private
     */
    _modelUrl (language) {
        const entry = (this.installed || []).find(l => l.key === language);
        return `${RESOURCE_BASE}/${entry ? entry.file : `models/${language}.tar.gz`}`;
    }

    /**
     * Have the Vosk runtime on the page.
     * @returns {Promise<object>} - the Vosk global.
     * @private
     */
    async _loadRuntime () {
        if (!window[GLOBAL_NAME]) {
            try {
                await loadScript(`${RESOURCE_BASE}/vosk.js`);
            } catch (err) {
                throw new Error('the speech runtime is not installed: run npm run fetch:speech-models');
            }
        }
        if (!window[GLOBAL_NAME]) {
            throw new Error('the speech runtime did not load');
        }
        return window[GLOBAL_NAME];
    }

    /**
     * The model for the current language, made once. A model for another
     * language is let go first: one worker at a time is plenty.
     * @returns {Promise<object>} - the Vosk Model.
     */
    loadModel () {
        const language = this.language;
        if (this._modelLanguage === language) {
            if (this._model) return Promise.resolve(this._model);
            if (this._modelPromise) return this._modelPromise;
        }
        this._releaseModel();
        this._modelLanguage = language;
        const token = {};
        this._loadToken = token;

        let model = null;
        this._modelPromise = this.installedLanguages()
            .then(installed => {
                if (installed.length && !installed.some(l => l.key === language)) {
                    throw new Error(`the ${language} speech model is not installed: ` +
                        `run node scripts/download-speech-models.js --lang ${language}`);
                }
                return this._loadRuntime();
            })
            .then(Vosk => new Promise((resolve, reject) => {
                model = new Vosk.Model(this._modelUrl(language), LOG_LEVEL);
                model.on('load', message => {
                    if (message.result) resolve(model);
                    else reject(new Error(`the ${language} speech model could not be loaded`));
                });
                model.on('error', message => reject(new Error(
                    `the ${language} speech model could not be loaded: ${message.error}`)));
            }))
            .then(loaded => {
                if (this._loadToken !== token) {
                    // The language changed while this one was loading.
                    loaded.terminate();
                    throw new Error('the language was changed while the model was loading');
                }
                this._model = loaded;
                return loaded;
            })
            .catch(err => {
                // A worker that failed to load is still a worker.
                if (model && this._model !== model) model.terminate();
                if (this._loadToken === token) {
                    // Cleared so the next block tries again, rather than every
                    // later block inheriting one rejected promise.
                    this._modelPromise = null;
                    this._modelLanguage = null;
                }
                throw err;
            });
        return this._modelPromise;
    }

    _releaseModel () {
        this._cancelIdleRelease();
        const model = this._model;
        this._model = null;
        this._modelPromise = null;
        this._modelLanguage = null;
        this._loadToken = null;
        if (model) model.terminate();
    }

    _cancelIdleRelease () {
        if (this._idleTimer !== null) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }

    _armIdleRelease () {
        this._cancelIdleRelease();
        if (this.listening || this._starting || !this._model || !(this.idleReleaseMs > 0)) return;
        this._idleTimer = setTimeout(() => this._releaseIdle(), this.idleReleaseMs);
    }

    /**
     * Let an unused model go. If listening has started again meanwhile the
     * clock simply starts over; the model is never pulled out from under
     * an open microphone.
     * @private
     */
    _releaseIdle () {
        this._idleTimer = null;
        if (this.listening || this._starting) {
            this._armIdleRelease();
            return;
        }
        this._releaseModel();
    }

    // ------------------------------------------------------- the listening

    /**
     * Open the microphone and start recognising. Resolves once words can
     * arrive; rejects, with a plain sentence, if they cannot.
     * @returns {Promise} - resolved when listening.
     */
    start () {
        if (this.listening) return Promise.resolve();
        if (this._starting) return this._starting;
        this._starting = this._start()
            .catch(err => {
                this._teardownAudio();
                this._recognizer = null;
                throw err;
            })
            .finally(() => {
                this._starting = null;
            });
        return this._starting;
    }

    async _start () {
        this._cancelIdleRelease();
        const model = await this.loadModel();

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true},
                video: false
            });
        } catch (err) {
            throw new Error(describeMicrophoneError(err));
        }
        this._stream = stream;
        // A microphone that is unplugged mid-sentence ends its track.
        stream.getAudioTracks().forEach(track => {
            track.addEventListener('ended', () => {
                if (this._stream === stream) this.stop();
            });
        });

        this._context = makeAudioContext();
        if (this._context.state === 'suspended') await this._context.resume();
        this._source = this._context.createMediaStreamSource(stream);
        this._processor = this._context.createScriptProcessor(BUFFER_SIZE, 1, 1);
        this._processor.onaudioprocess = event => {
            const input = event.inputBuffer;
            this.feed(input.getChannelData(0), input.sampleRate);
        };
        this._recognizer = this._makeRecognizer(model);
        this._source.connect(this._processor);
        // Chromium only runs a script processor that leads somewhere. Its
        // output is never written, so what reaches the speakers is silence.
        this._processor.connect(this._context.destination);

        this.listening = true;
        this.emit('change', true);
    }

    /**
     * A recogniser on the model, wired to report what it hears.
     * @param {object} model - the Vosk Model.
     * @returns {object} - the Vosk KaldiRecognizer.
     * @private
     */
    _makeRecognizer (model) {
        // A grammar narrows the recogniser to these phrases; "[unk]" is where
        // anything else lands, so a stray word is not forced into a match.
        const sampleRate = this._context ? this._context.sampleRate : SAMPLE_RATE;
        const recognizer = this.grammar ?
            new model.KaldiRecognizer(sampleRate, JSON.stringify(this.grammar.concat('[unk]'))) :
            new model.KaldiRecognizer(sampleRate);
        // Every chunk of sound gets exactly one answer back, so the answers
        // are how far behind the worker is known to be.
        const answered = () => {
            if (recognizer === this._recognizer && this._inFlight > 0) this._inFlight -= 1;
        };
        recognizer.on('result', message => {
            answered();
            const text = cleanWords(message.result && message.result.text);
            if (text) this.emit('result', text);
        });
        recognizer.on('partialresult', message => {
            answered();
            this.emit('partial', cleanWords(message.result && message.result.partial));
        });
        recognizer.on('error', message => {
            answered();
            this.emit('error', new Error(message.error || 'the speech recogniser failed'));
        });
        this._inFlight = 0;
        return recognizer;
    }

    /**
     * Whether a chunk of sound is only the room, and can be kept back.
     * @param {Float32Array} samples - the sound, -1 to 1.
     * @param {number} sampleRate - how many samples make a second.
     * @returns {boolean} - true if there is nothing in it worth hearing.
     * @private
     */
    _isQuiet (samples, sampleRate) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        const level = Math.sqrt(sum / (samples.length || 1));
        // The room is the quietest thing heard lately: it drops at once to
        // anything quieter and creeps back up slowly, so a fan that starts
        // is learned within a minute and a long speech is not mistaken for it.
        this._roomLevel = Math.min(level, (this._roomLevel * GATE_ROOM_RISE) + 1e-5);
        const loud = level > Math.max(GATE_MIN_LEVEL, this._roomLevel * GATE_ABOVE_ROOM);
        if (loud) {
            this._holdChunks = Math.ceil((GATE_HOLD_MS / 1000) * sampleRate / (samples.length || 1));
            return false;
        }
        if (this._holdChunks > 0) {
            this._holdChunks -= 1;
            return false;
        }
        return true;
    }

    /**
     * Hand the recogniser some sound.
     * @param {Float32Array} samples - the sound, -1 to 1.
     * @param {number} sampleRate - how many samples make a second.
     */
    feed (samples, sampleRate) {
        const recognizer = this._recognizer;
        if (!recognizer) return;
        if (this.quietGate && this._isQuiet(samples, sampleRate)) {
            this.skipped += 1;
            return;
        }
        if (this._inFlight >= MAX_BACKLOG) {
            this.dropped += 1;
            if (!this._lagWarned) {
                this._lagWarned = true;
                this.emit('warning', new Error(
                    'this computer cannot keep up with the microphone, so some of the sound is being skipped'));
            }
            return;
        }
        try {
            recognizer.acceptWaveformFloat(samples, sampleRate);
            this._inFlight += 1;
        } catch (err) {
            this.emit('error', err);
        }
    }

    /**
     * Close the microphone. Any words still in the recogniser's mouth come
     * out as one last result before it goes.
     * @returns {Promise} - resolved once everything is closed.
     */
    stop () {
        if (this._starting) {
            return this._starting.then(() => this.stop(), () => null);
        }
        if (!this.listening) return Promise.resolve();
        if (this._stopping) return this._stopping;

        this.listening = false;
        this.emit('change', false);
        const recognizer = this._recognizer;
        this._recognizer = null;
        this._teardownAudio();
        this._stopping = this._finish(recognizer)
            .then(() => this._armIdleRelease())
            .finally(() => {
                this._stopping = null;
            });
        return this._stopping;
    }

    /**
     * Ask a recogniser for its final words, then remove it. Results already
     * on their way from the worker arrive in order, so a short wait after
     * the first one makes sure the final one is not thrown away with it.
     * @param {?object} recognizer - the Vosk KaldiRecognizer.
     * @returns {Promise} - resolved once it is gone.
     * @private
     */
    _finish (recognizer) {
        if (!recognizer) return Promise.resolve();
        return new Promise(resolve => {
            const timer = setTimeout(resolve, FINAL_RESULT_WAIT_MS);
            recognizer.on('result', () => {
                clearTimeout(timer);
                setTimeout(resolve, 250);
            });
            recognizer.retrieveFinalResult();
        }).then(() => recognizer.remove());
    }

    _teardownAudio () {
        const {_processor: processor, _source: source, _stream: stream, _context: context} = this;
        this._processor = null;
        this._source = null;
        this._stream = null;
        this._context = null;
        if (processor) {
            processor.onaudioprocess = null;
            quietly(() => processor.disconnect());
        }
        if (source) quietly(() => source.disconnect());
        if (stream) stream.getTracks().forEach(track => track.stop());
        if (context) quietly(() => context.close().catch(() => null));
    }

    /**
     * Listen until a phrase is finished or the time is up, whichever comes
     * first. If the microphone was not already open it is closed again
     * after, and whatever was said by then comes out as the final phrase.
     * @param {number} seconds - how long to wait, at most.
     * @returns {Promise<?string>} - the phrase, or null if none came.
     */
    async listenOnce (seconds) {
        if (!(seconds > 0)) return null;
        const wasListening = this.listening;
        await this.start();

        const heard = await new Promise(resolve => {
            let timer = null;
            let onChange = null;
            const done = text => {
                clearTimeout(timer);
                this.removeListener('result', done);
                this.removeListener('change', onChange);
                resolve(text);
            };
            onChange = listening => {
                if (!listening) done(null);
            };
            timer = setTimeout(() => done(null), seconds * 1000);
            this.on('result', done);
            this.on('change', onChange);
        });

        if (!wasListening && this.listening) await this.stop();
        return heard;
    }

    // --------------------------------------------------------- the settings

    /**
     * Listen in another language from now on. If the microphone is open it
     * is reopened on the new model.
     * @param {string} language - a key of LANGUAGES.
     * @returns {Promise} - resolved once the change has taken.
     */
    async setLanguage (language) {
        if (language === this.language) return;
        this.language = language;
        if (this.listening || this._starting) {
            await this.stop();
            await this.start();
        } else {
            this._releaseModel();
        }
    }

    /**
     * Only listen for these phrases from now on, or for anything.
     * @param {?Array<string>} phrases - the phrases, or null for any words.
     * @returns {Promise} - resolved once the change has taken.
     */
    async setGrammar (phrases) {
        const next = phrases && phrases.length ? phrases.slice() : null;
        if (JSON.stringify(next) === JSON.stringify(this.grammar)) return;
        this.grammar = next;
        if (!this.listening || !this._model) return;
        // Swap recognisers under the open microphone: the new one takes the
        // sound from here on, the old one gives up its last words and goes.
        const previous = this._recognizer;
        this._recognizer = this._makeRecognizer(this._model);
        await this._finish(previous);
    }

    dispose () {
        this.stop();
        this._releaseModel();
    }
}

SpeechListener.LANGUAGES = LANGUAGES;
SpeechListener.DEFAULT_LANGUAGE = DEFAULT_LANGUAGE;
SpeechListener.RESOURCE_BASE = RESOURCE_BASE;
SpeechListener.SAMPLE_RATE = SAMPLE_RATE;
SpeechListener.IDLE_RELEASE_MS = IDLE_RELEASE_MS;

module.exports = SpeechListener;
