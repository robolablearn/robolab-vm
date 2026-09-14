/**
 * Speech Sense: turning what is said into words a script can use.
 *
 * Listening happens in the editor, with Vosk's small speech models, so it
 * works with any board or none and needs no internet. One block turns
 * listening on; from then on every phrase the speaker finishes becomes the
 * "heard words", which the reporters read, the boolean and the hat match
 * against, and which the settings can forget again after a while. A one-shot
 * block listens for a single phrase and waits for it, for scripts that want
 * to ask a question and hear the answer.
 *
 * The blocks, their wording and the artwork are Robolab's own design; the
 * recogniser underneath is open source (Apache 2.0, see listener.js and the
 * NOTICE the download script writes beside it).
 */
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');

const SpeechListener = require('./listener');

/** The colour of the category. */
const CATEGORY_COLOUR = '#1F9E8A';

const MICROPHONE_PATHS =
    '<rect x="15" y="4" width="10" height="17" rx="5"/>' +
    '<path d="M10 17a10 10 0 0 0 20 0M20 27v6M14 33h12"/>' +
    '<path d="M32 11a7 7 0 0 1 0 12M8 11a7 7 0 0 0 0 12"/>';

const blockIconURI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<g fill="none" stroke="#FFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">` +
    `${MICROPHONE_PATHS}</g></svg>`
)}`;

const menuIconURI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 40 40">` +
    `<g fill="none" stroke="${CATEGORY_COLOUR}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">` +
    `${MICROPHONE_PATHS}</g></svg>`
)}`;

/** The settings as they stand before any block changes them. */
const DEFAULTS = {
    autoForget: true,
    forgetAfterSeconds: 0,
    forgetAfterSilenceSeconds: 0
};

/**
 * Words as they are compared: lower case, punctuation gone, one space
 * between words. Only ASCII punctuation is dropped, so that letters of
 * any other script are left exactly as the model wrote them.
 * @param {*} text - anything a block might hand over.
 * @returns {string} - the words.
 */
const normalise = text => Cast.toString(text)
    .toLowerCase()
    .replace(/[^\w\s-￿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * A number of seconds from a block, where anything that is not a positive
 * number -- "never", "infinite", a blank -- means never.
 * @param {*} value - what the block holds.
 * @returns {number} - the seconds, or 0 for never.
 */
const secondsOrNever = value => {
    const seconds = Cast.toNumber(value);
    return seconds > 0 ? seconds : 0;
};

/**
 * Whether an on/off menu, or whatever was dropped into it, says off.
 * Anything that is not plainly "off" counts as on.
 * @param {*} value - what the block holds.
 * @returns {boolean} - true for off.
 */
const isOff = value => normalise(value) === 'off';

class Scratch3SpeechSenseBlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this._listener = new SpeechListener();

        /** The last phrase finished, and the words so far of the one being spoken. */
        this._heard = '';
        this._partial = '';

        this._autoForget = DEFAULTS.autoForget;
        this._forgetAfterSeconds = DEFAULTS.forgetAfterSeconds;
        this._forgetAfterSilenceSeconds = DEFAULTS.forgetAfterSilenceSeconds;
        this._forgetTimer = null;
        this._silenceTimer = null;

        /** Whether a block has picked the language, or it is still the installed default. */
        this._languageChosen = false;
        this._lastWarning = '';

        this._listener.on('result', text => this._onResult(text));
        this._listener.on('partial', text => this._onPartial(text));
        this._listener.on('warning', err => this._warn(err));
        this._listener.on('error', err => {
            this._warn(err);
            this._listener.stop().catch(() => null);
        });
        this._listener.on('languages', languages => {
            // The default language is the one the download script fetches by
            // default; a build that fetched others instead starts on one of those.
            if (this._languageChosen || !languages.length) return;
            if (!languages.some(l => l.key === this._listener.language)) {
                this._listener.language = languages[0].key;
            }
        });
        // Read early, so the language menu knows what is installed by the
        // time anyone opens it.
        this._listener.installedLanguages();

        // The stop sign closes the microphone: a stopped project should not
        // go on listening to the room. The words heard so far are kept.
        this._onStopAll = () => {
            this._listener.stop().catch(() => null);
        };
        this.runtime.on('PROJECT_STOP_ALL', this._onStopAll);
    }

    get EXTENSION_ID () {
        return 'speechSense';
    }

    get LISTEN_STATE_INFO () {
        return [
            {name: 'on', value: 'on'},
            {name: 'off', value: 'off'}
        ];
    }

    _buildMenu (info) {
        return info.map(entry => ({text: entry.name, value: entry.value}));
    }

    /**
     * The languages to offer: the installed ones once models.json has been
     * read, every known one until then, so the block is never left empty.
     * @returns {Array} - menu items.
     */
    getLanguageMenu () {
        const known = SpeechListener.LANGUAGES;
        const installed = this._listener.installed;
        const list = installed && installed.length ?
            installed.map(entry => {
                const match = known.find(l => l.key === entry.key);
                return {key: entry.key, name: match ? match.name : entry.name};
            }) :
            known;
        return list.map(l => ({text: l.name, value: l.key}));
    }

    getInfo () {
        return [{
            id: 'speechSense',
            name: formatMessage({
                id: 'speechSense.categoryName',
                default: 'Speech Sense',
                description: 'Label for the speech sensing extension category'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            color1: CATEGORY_COLOUR,
            color2: '#1B8A78',
            color3: '#177667',
            blocks: [
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'speechSense.group.listening',
                        default: 'Listening',
                        description: 'palette heading above the microphone blocks'
                    })
                },
                {
                    opcode: 'setListening',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'speechSense.setListening',
                        default: 'turn listening [STATE]',
                        description: 'open or close the microphone for speech recognition'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'LISTEN_STATE', defaultValue: 'on'}
                    }
                },
                {
                    opcode: 'listenFor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'speechSense.listenFor',
                        default: 'listen for up to [SECONDS] seconds',
                        description: 'wait for one spoken phrase, giving up after this many seconds'
                    }),
                    arguments: {
                        SECONDS: {type: ArgumentType.NUMBER, defaultValue: 5}
                    }
                },
                {
                    opcode: 'isListening',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'speechSense.isListening',
                        default: 'is listening ?',
                        description: 'whether the microphone is open for speech recognition'
                    })
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'speechSense.group.words',
                        default: 'Heard Words',
                        description: 'palette heading above the blocks that read what was said'
                    })
                },
                {
                    opcode: 'whenHeard',
                    blockType: BlockType.HAT,
                    isEdgeActivated: false,
                    shouldRestartExistingThreads: true,
                    text: formatMessage({
                        id: 'speechSense.whenHeard',
                        default: 'when someone says [PHRASE]',
                        description: 'runs when a finished phrase contains these words'
                    }),
                    arguments: {
                        PHRASE: {type: ArgumentType.STRING, defaultValue: 'hello'}
                    }
                },
                {
                    opcode: 'whenPhrase',
                    blockType: BlockType.HAT,
                    isEdgeActivated: false,
                    shouldRestartExistingThreads: true,
                    text: formatMessage({
                        id: 'speechSense.whenPhrase',
                        default: 'when a phrase is heard',
                        description: 'runs every time a spoken phrase is finished'
                    })
                },
                {
                    opcode: 'heardWords',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'speechSense.heardWords',
                        default: 'heard words',
                        description: 'the last finished phrase'
                    })
                },
                {
                    opcode: 'wordsSoFar',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'speechSense.wordsSoFar',
                        default: 'words so far',
                        description: 'the words of the phrase still being spoken'
                    })
                },
                {
                    opcode: 'didHear',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'speechSense.didHear',
                        default: 'heard [PHRASE] ?',
                        description: 'whether the last finished phrase contains these words'
                    }),
                    arguments: {
                        PHRASE: {type: ArgumentType.STRING, defaultValue: 'hello'}
                    }
                },
                {
                    opcode: 'forgetHeard',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'speechSense.forgetHeard',
                        default: 'forget heard words',
                        description: 'clear the last phrase and the words so far'
                    })
                },
                {
                    blockType: BlockType.LABEL,
                    text: formatMessage({
                        id: 'speechSense.group.settings',
                        default: 'Settings',
                        description: 'palette heading above the settings blocks'
                    })
                },
                {
                    opcode: 'setLanguage',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'speechSense.setLanguage',
                        default: 'listen in [LANGUAGE]',
                        description: 'pick the language to recognise'
                    }),
                    arguments: {
                        LANGUAGE: {
                            type: ArgumentType.STRING,
                            menu: 'LANGUAGE',
                            defaultValue: SpeechListener.DEFAULT_LANGUAGE
                        }
                    }
                },
                {
                    opcode: 'setWordList',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'speechSense.setWordList',
                        default: 'only listen for the words [WORDS]',
                        description: 'limit recognition to a list of phrases; an empty list means any words'
                    }),
                    arguments: {
                        WORDS: {type: ArgumentType.STRING, defaultValue: 'go, stop, left, right'}
                    }
                },
                {
                    opcode: 'setAutoForget',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'speechSense.setAutoForget',
                        default: 'set auto forget to [STATE]',
                        description: 'whether heard words are cleared by themselves after a while'
                    }),
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'LISTEN_STATE', defaultValue: 'on'}
                    }
                },
                {
                    opcode: 'setForgetAfter',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'speechSense.setForgetAfter',
                        default: 'auto forget heard words after [SECONDS] seconds',
                        description: 'clear heard words this long after they were heard; 0 keeps them'
                    }),
                    arguments: {
                        SECONDS: {type: ArgumentType.NUMBER, defaultValue: 10}
                    }
                },
                {
                    opcode: 'setForgetAfterSilence',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'speechSense.setForgetAfterSilence',
                        default: 'auto forget heard words after [SECONDS] seconds of silence',
                        description: 'clear heard words once nothing has been said for this long; 0 keeps them'
                    }),
                    arguments: {
                        SECONDS: {type: ArgumentType.NUMBER, defaultValue: 3}
                    }
                },
                {
                    opcode: 'resetSettings',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'speechSense.resetSettings',
                        default: 'restore default listening settings',
                        description: 'put every setting back to how it started'
                    })
                }
            ],
            menus: {
                LISTEN_STATE: {acceptReporters: true, items: this._buildMenu(this.LISTEN_STATE_INFO)},
                LANGUAGE: {acceptReporters: true, items: 'getLanguageMenu'}
            }
        }];
    }

    // ----------------------------------------------------------- the words

    _onResult (text) {
        this._heard = text;
        this._partial = '';
        this._armForgetTimers();
        // Both hats run their predicate against the phrase just set.
        this.runtime.startHats('speechSense_whenPhrase');
        this.runtime.startHats('speechSense_whenHeard');
    }

    _onPartial (text) {
        if (text === this._partial) return;
        this._partial = text;
        // Words changing means someone is talking: not a pause.
        if (text) this._armSilenceTimer();
    }

    /**
     * Whether some words appear, whole, in a phrase: "left" is in "turn
     * left now" but not in "leftover". Case and punctuation do not count.
     * @param {*} wanted - the words to look for.
     * @param {string} text - the phrase.
     * @returns {boolean} - true if they are there.
     * @private
     */
    _matches (wanted, text) {
        const phrase = normalise(wanted);
        const heard = normalise(text);
        if (!phrase || !heard) return false;
        return ` ${heard} `.includes(` ${phrase} `);
    }

    // ---------------------------------------------------------- forgetting

    _clearTimers () {
        if (this._forgetTimer !== null) {
            clearTimeout(this._forgetTimer);
            this._forgetTimer = null;
        }
        if (this._silenceTimer !== null) {
            clearTimeout(this._silenceTimer);
            this._silenceTimer = null;
        }
    }

    _armForgetTimers () {
        this._clearTimers();
        if (!this._autoForget || !this._heard) return;
        if (this._forgetAfterSeconds > 0) {
            this._forgetTimer = setTimeout(() => this._forget(), this._forgetAfterSeconds * 1000);
        }
        this._armSilenceTimer();
    }

    _armSilenceTimer () {
        if (this._silenceTimer !== null) {
            clearTimeout(this._silenceTimer);
            this._silenceTimer = null;
        }
        if (!this._autoForget || !this._heard || !(this._forgetAfterSilenceSeconds > 0)) return;
        this._silenceTimer = setTimeout(() => this._forget(), this._forgetAfterSilenceSeconds * 1000);
    }

    _forget () {
        this._clearTimers();
        this._heard = '';
    }

    /**
     * Say what went wrong, once per message, on the console: a project that
     * listens inside a loop must not open a dialog on every pass.
     * @param {Error} err - what went wrong.
     * @private
     */
    _warn (err) {
        const message = `Speech Sense: ${err && err.message ? err.message : err}`;
        if (message === this._lastWarning) return;
        this._lastWarning = message;
        // eslint-disable-next-line no-console
        console.warn(message);
    }

    // ------------------------------------------------------- the listening

    setListening (args) {
        const action = isOff(args.STATE) ? this._listener.stop() : this._listener.start();
        return action.catch(err => this._warn(err));
    }

    listenFor (args) {
        const seconds = Cast.toNumber(args.SECONDS);
        return this._listener.listenOnce(seconds)
            .then(() => null)
            .catch(err => this._warn(err));
    }

    isListening () {
        return this._listener.listening;
    }

    // ---------------------------------------------------------- the reporters

    whenHeard (args) {
        return this._matches(args.PHRASE, this._heard);
    }

    whenPhrase () {
        return true;
    }

    heardWords () {
        return this._heard;
    }

    wordsSoFar () {
        return this._partial;
    }

    didHear (args) {
        return this._matches(args.PHRASE, this._heard);
    }

    forgetHeard () {
        this._clearTimers();
        this._heard = '';
        this._partial = '';
    }

    // ---------------------------------------------------------- the settings

    /**
     * The language key a block means, by key or by name, so that a reporter
     * saying "Hindi" works as well as the menu's "hi".
     * @param {*} value - what the block holds.
     * @returns {?string} - the key, or null if it is nothing we know.
     * @private
     */
    _languageKey (value) {
        const wanted = normalise(value);
        if (!wanted) return null;
        const candidates = SpeechListener.LANGUAGES.concat(this._listener.installed || []);
        const match = candidates.find(l => normalise(l.key) === wanted || normalise(l.name) === wanted);
        return match ? match.key : null;
    }

    setLanguage (args) {
        const key = this._languageKey(args.LANGUAGE);
        if (!key) {
            this._warn(new Error(`"${Cast.toString(args.LANGUAGE)}" is not a language it can listen in`));
            return;
        }
        this._languageChosen = true;
        return this._listener.setLanguage(key).catch(err => this._warn(err));
    }

    setWordList (args) {
        const text = Cast.toString(args.WORDS);
        // Commas separate phrases that have spaces in them; without commas
        // every word is its own phrase.
        const parts = text.includes(',') ? text.split(',') : text.split(/\s+/);
        const phrases = parts.map(normalise).filter(Boolean);
        return this._listener.setGrammar(phrases).catch(err => this._warn(err));
    }

    setAutoForget (args) {
        this._autoForget = !isOff(args.STATE);
        this._armForgetTimers();
    }

    setForgetAfter (args) {
        this._forgetAfterSeconds = secondsOrNever(args.SECONDS);
        this._armForgetTimers();
    }

    setForgetAfterSilence (args) {
        this._forgetAfterSilenceSeconds = secondsOrNever(args.SECONDS);
        this._armForgetTimers();
    }

    resetSettings () {
        this._autoForget = DEFAULTS.autoForget;
        this._forgetAfterSeconds = DEFAULTS.forgetAfterSeconds;
        this._forgetAfterSilenceSeconds = DEFAULTS.forgetAfterSilenceSeconds;
        this._armForgetTimers();
        this._languageChosen = false;
        const installed = this._listener.installed || [];
        const language = installed.length && !installed.some(l => l.key === SpeechListener.DEFAULT_LANGUAGE) ?
            installed[0].key :
            SpeechListener.DEFAULT_LANGUAGE;
        return Promise.all([
            this._listener.setGrammar(null),
            this._listener.setLanguage(language)
        ])
            .then(() => null)
            .catch(err => this._warn(err));
    }

    /**
     * Give back everything this extension holds when it is removed: the
     * microphone, the speech model and its worker, the forget timers and the
     * stop-sign listener. Safe to call more than once.
     */
    dispose () {
        this.runtime.removeListener('PROJECT_STOP_ALL', this._onStopAll);
        this._clearTimers();
        this._listener.dispose();
    }
}

module.exports = Scratch3SpeechSenseBlocks;
