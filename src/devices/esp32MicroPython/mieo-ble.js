/**
 * Talking to a Mieo over Bluetooth.
 *
 * The board puts its MicroPython REPL on a Nordic UART service, so this is the
 * same conversation that happens down the USB cable, carried over BLE
 * characteristics instead. Live mode pipes bytes straight through; uploading a
 * program drives the raw REPL underneath to write files, exactly as mpremote
 * does over serial.
 *
 * Why this lives in the editor rather than in the link server, where every
 * other transport lives: Bluetooth here is Chromium's Web Bluetooth, which
 * only exists in a renderer. The link server would need a native BLE module,
 * which on Windows means either a driver swap or a fragile WinRT addon.
 *
 * Firmware is the one thing that cannot come this way. The chip's ROM
 * bootloader is what receives firmware and it speaks UART only -- there is no
 * radio until the firmware it would be replacing is already running.
 */

/** The Nordic UART service the board advertises. Lower case: Web Bluetooth
 * compares UUIDs as lower-case strings and rejects anything else. */
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/** Marks a peripheral id as a Bluetooth device rather than a COM port. */
const BLE_PREFIX = 'ble:';

/**
 * Bytes per write to the board, before the link has said what it can carry.
 *
 * Twenty is what the smallest possible MTU allows, so it always fits. The real
 * figure is asked for once per connection (see _learnChunk) because Web
 * Bluetooth will not report the negotiated MTU itself -- only the board knows.
 * Writes are acknowledged, and that acknowledgement is the flow control.
 */
const MIN_CHUNK = 20;

/** The most one write may carry: the board asks for an MTU of 247. */
const MAX_CHUNK = 244;

/** Bytes of file content per statement when writing a file to the board. */
const FILE_CHUNK = 512;

/**
 * How often to say something during a long transfer.
 *
 * The upload window gives up after 60 s of silence and only a stdout line
 * resets that clock, so this is load-bearing rather than decorative.
 */
const HEARTBEAT_MS = 5000;

/**
 * How many times a file may be rewound before giving up on it. A board that
 * keeps asking for the same chunk is not going to start accepting it.
 */
const MAX_REWINDS = 20;

/** How much unread output to keep when nothing is waiting for a reply. */
const IDLE_BUFFER_LIMIT = 4096;

const CTRL_A = '\x01';
const CTRL_C = '\x03';
const CTRL_D = '\x04';

const RAW_BANNER = 'raw REPL; CTRL-B to exit';

const CONNECT_TIMEOUT_MS = 20000;
const EXEC_TIMEOUT_MS = 20000;

/**
 * How long to keep trying to reach the board after restarting it at the end of
 * an upload. It advertises again within a couple of seconds of power on; this
 * leaves room for a slow boot and a busy radio, not for a dead board.
 */
const RESTART_RECONNECT_MS = 20000;

/** How long one attempt to reopen the link may take before it is abandoned. */
const RECONNECT_ATTEMPT_MS = 6000;

/** The pause between attempts to reach a board that is still starting up. */
const RECONNECT_RETRY_MS = 1000;

/**
 * How long the board is given to carry out the restart before the editor lets
 * go of the link. The command itself is acknowledged on arrival.
 */
const RESTART_SETTLE_MS = 300;

/** Where the link server publishes the board-side Python library. */
const LIBRARY_URL = 'http://127.0.0.1:20111/mieo/library';

/** The board-side receiver, which owns the list of names it will accept. */
const RECEIVER_FILE = 'mieoupload.py';

/** Where the board records which library files it holds. */
const VERSION_FILE = 'libver.json';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Give an operation a deadline, and a chance to cancel what it was waiting on.
 * @param {Promise} promise - the operation.
 * @param {number} ms - how long it may take.
 * @param {Function} onTimeout - called if it does not finish in time.
 * @returns {Promise} - settles as the operation does, or rejects at the deadline.
 */
const withTimeout = (promise, ms, onTimeout) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
        onTimeout();
        reject(new Error('timed out'));
    }, ms);
    promise.then(
        value => {
            clearTimeout(timer);
            resolve(value);
        },
        err => {
            clearTimeout(timer);
            reject(err);
        }
    );
});

/** How long to wait on the link server before giving up on it. */
const FETCH_TIMEOUT_MS = 10000;

/**
 * Ask the link server for something, and insist on a real answer.
 *
 * Bounded, because everything else in this class is: an upload that hangs
 * forever on a socket leaves the console frozen with an abort button that
 * cannot help. And checked, because a 404 or a proxy's error page is still a
 * body -- writing one onto the board as boot.py would be worse than failing.
 * @param {string} url - what to fetch.
 * @returns {Promise<Response>} - the response, which is known to be ok.
 */
const fetchOrThrow = async url => {
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
    try {
        const response = await fetch(url, controller ? {signal: controller.signal} : undefined);
        if (!response.ok) {
            throw new Error(`the library server answered ${response.status}`);
        }
        return response;
    } finally {
        if (timer) clearTimeout(timer);
    }
};

/**
 * Text as UTF-8 bytes.
 *
 * Files go to the board as bytes, not as characters: a program with an emoji
 * in a "show text" block is perfectly ordinary, and encoding it a character at
 * a time would either throw or quietly write the wrong thing.
 * @param {string} text - the text to encode.
 * @returns {Uint8Array} - its UTF-8 bytes.
 */
const utf8Bytes = text => {
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(text);
    }
    return new Uint8Array(Buffer.from(text, 'utf8'));
};

/**
 * @param {Uint8Array} bytes - the bytes to encode.
 * @returns {string} - them, base64 encoded.
 */
const toBase64 = bytes => {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

/**
 * CRC-32 (IEEE, the one zlib and MicroPython's binascii compute).
 *
 * Hand-rolled because there is nothing to borrow: the renderer has no zlib,
 * and Node's crypto has no crc32. It has to agree with binascii.crc32 on the
 * board exactly, since that comparison is what decides whether an uploaded
 * program is allowed to replace the working one.
 */
let CRC_TABLE = null;

const crc32 = bytes => {
    if (CRC_TABLE === null) {
        CRC_TABLE = new Int32Array(256);
        for (let i = 0; i < 256; i++) {
            let value = i;
            for (let bit = 0; bit < 8; bit++) {
                value = (value & 1) ? ((value >>> 1) ^ 0xEDB88320) : (value >>> 1);
            }
            CRC_TABLE[i] = value;
        }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
};

/**
 * Electron's IPC, when running inside the desktop app. Guarded so that loading
 * this file in a plain browser build fails at use rather than at import.
 */
let ipcRenderer = null;
try {
    // eslint-disable-next-line global-require
    ipcRenderer = require('electron').ipcRenderer;
} catch (err) {
    ipcRenderer = null;
}

class MieoBle {
    /**
     * @param {Runtime} runtime - the VM runtime, for connection and upload events.
     * @param {string} deviceId - the device this transport belongs to.
     * @param {object} deviceOpt - the device options, passed through to uploads.
     * @param {Function} onListUpdate - called with the discovered peripherals.
     */
    constructor (runtime, deviceId, deviceOpt, onListUpdate) {
        this._runtime = runtime;
        this._deviceId = deviceId;
        this._deviceOpt = deviceOpt;
        this._onListUpdate = onListUpdate;

        this._device = null;
        this._server = null;
        this._rx = null;
        this._tx = null;
        this._connected = false;

        this._onMessage = null;
        this._buffer = '';
        this._waiter = null;
        this._piping = true;

        this._discovered = {};
        this._scanning = false;
        this._abort = false;
        this._writeQueue = Promise.resolve();

        // Set while the board restarts at the end of an upload: the link is
        // expected to drop then, and is about to be reopened.
        this._restarting = false;

        // Counts attempts to open the link, so one that was given up on cannot
        // come back later and take over from the attempt that replaced it.
        this._linkAttempt = 0;

        // Raised once the board says what the link actually negotiated.
        this._chunk = MIN_CHUNK;

        this._handleDeviceList = this._handleDeviceList.bind(this);
        this._handleNotification = this._handleNotification.bind(this);
        this._handleDisconnect = this._handleDisconnect.bind(this);
    }

    static get BLE_PREFIX () {
        return BLE_PREFIX;
    }

    /**
     * @returns {boolean} - whether Bluetooth can be used at all here.
     */
    static get isSupported () {
        return Boolean(ipcRenderer) &&
            typeof navigator !== 'undefined' &&
            typeof navigator.bluetooth !== 'undefined';
    }

    // ------------------------------------------------------------ discovery

    /**
     * Start looking for boards.
     *
     * requestDevice resolves only once something is chosen, so it is left
     * running for as long as the connection window is open. The candidates
     * arrive separately, from the main process, as Chromium finds them.
     * @param {boolean} listAll - offer every Bluetooth device, not just Mieos.
     */
    scan (listAll = false) {
        if (!MieoBle.isSupported) {
            return;
        }
        this._discovered = {};

        // Start over rather than leaving the previous request running.
        // requestDevice needs a recent click behind it, and the Refresh button
        // is exactly that -- so a retry has to become a new request, or the
        // one way out of a refused scan would do nothing.
        if (this._scanning) {
            this.stopScan();
        }
        this._scanning = true;
        ipcRenderer.on('bluetooth-device-list', this._handleDeviceList);

        const options = listAll ?
            {acceptAllDevices: true, optionalServices: [UART_SERVICE]} :
            {filters: [{namePrefix: 'Mieo'}], optionalServices: [UART_SERVICE]};

        navigator.bluetooth.requestDevice(options)
            .then(device => {
                this._scanning = false;
                ipcRenderer.removeListener('bluetooth-device-list', this._handleDeviceList);
                this._chosen = device;
                if (this._pendingConnect) {
                    const resolve = this._pendingConnect;
                    this._pendingConnect = null;
                    resolve(device);
                }
            })
            .catch(err => {
                this._scanning = false;
                ipcRenderer.removeListener('bluetooth-device-list', this._handleDeviceList);
                if (this._pendingConnectReject) {
                    const reject = this._pendingConnectReject;
                    this._pendingConnectReject = null;
                    reject(err);
                    return;
                }
                // NotFoundError is what cancelling looks like, and cancelling
                // is what closing the connection window does. Not an error.
                //
                // Nor is a missing click: Chromium only lets a scan start from
                // one, and the modal reads any error raised while scanning as
                // "Bluetooth is unavailable" and shows the install-a-driver
                // screen. Pressing Refresh is the way out, and saying so beats
                // sending the user somewhere unhelpful.
                const gestureNames = ['NotAllowedError', 'SecurityError'];
                if (err && gestureNames.indexOf(err.name) >= 0) {
                    return;
                }
                if (err && err.name !== 'NotFoundError') {
                    this._runtime.emit(this._runtime.constructor.PERIPHERAL_REQUEST_ERROR, {
                        message: this._explainScanError(err),
                        deviceId: this._deviceId
                    });
                }
            });
    }

    /**
     * @param {Error} err - whatever requestDevice rejected with.
     * @returns {string} - something worth showing a person.
     * @private
     */
    _explainScanError (err) {
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
            return 'Bluetooth needs to be started from a click. Press Refresh to search.';
        }
        if (err.name === 'NotSupportedError' || /adapter/i.test(err.message)) {
            return 'No Bluetooth adapter is available. Check Bluetooth is switched on.';
        }
        return `Bluetooth scan failed: ${err.message}`;
    }

    _handleDeviceList (event, deviceList) {
        let changed = false;
        deviceList.forEach(entry => {
            const peripheralId = `${BLE_PREFIX}${entry.deviceId}`;
            if (!this._discovered[peripheralId]) {
                changed = true;
            }
            this._discovered[peripheralId] = {
                peripheralId,
                name: entry.deviceName || 'Mieo (Bluetooth)',
                nativeId: entry.deviceId
            };
        });
        if (changed && this._onListUpdate) {
            this._onListUpdate(this._discovered);
        }
    }

    stopScan () {
        if (!this._scanning || !ipcRenderer) return;
        this._scanning = false;
        ipcRenderer.removeListener('bluetooth-device-list', this._handleDeviceList);
        // Tell the main process nothing was picked, so its pending request ends.
        ipcRenderer.send('bluetooth-select-device', '');
    }

    // ----------------------------------------------------------- connecting

    /**
     * Connect to one of the discovered boards.
     * @param {string} peripheralId - the id from the connection list.
     * @returns {Promise} - resolves once the REPL is reachable.
     */
    async connect (peripheralId) {
        const entry = this._discovered[peripheralId];
        const nativeId = entry ? entry.nativeId : String(peripheralId).slice(BLE_PREFIX.length);

        const device = await this._choose(nativeId);
        this._device = device;
        device.addEventListener('gattserverdisconnected', this._handleDisconnect);

        this._server = await device.gatt.connect();
        const service = await this._server.getPrimaryService(UART_SERVICE);
        this._rx = await service.getCharacteristic(UART_RX);
        this._tx = await service.getCharacteristic(UART_TX);
        await this._tx.startNotifications();
        this._tx.addEventListener('characteristicvaluechanged', this._handleNotification);

        this._connected = true;
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_CONNECTED);
    }

    /**
     * Hand the pending requestDevice the board that was picked, and wait for
     * it to come back with the device object.
     * @param {string} nativeId - Chromium's id for the device.
     * @returns {Promise<BluetoothDevice>} - the chosen device.
     * @private
     */
    _choose (nativeId) {
        if (this._chosen) {
            const device = this._chosen;
            this._chosen = null;
            return Promise.resolve(device);
        }
        return new Promise((resolve, reject) => {
            this._pendingConnect = resolve;
            this._pendingConnectReject = reject;
            ipcRenderer.send('bluetooth-select-device', nativeId);
            setTimeout(() => {
                if (this._pendingConnect) {
                    this._pendingConnect = null;
                    this._pendingConnectReject = null;
                    reject(new Error('The board did not answer. Check it is powered on and nearby.'));
                }
            }, CONNECT_TIMEOUT_MS);
        });
    }

    _handleDisconnect () {
        if (!this._connected) return;
        this._connected = false;
        this._rejectWaiter(new Error('The board disconnected.'));
        // A board restarting after an upload drops the link on purpose and is
        // reconnected straight after. Telling the editor would flip it to
        // "disconnected" and leave the user to connect again by hand.
        if (this._restarting) return;
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_DISCONNECTED);
    }

    disconnect () {
        this._connected = false;
        if (this._device) {
            this._device.removeEventListener('gattserverdisconnected', this._handleDisconnect);
            try {
                if (this._device.gatt.connected) {
                    this._device.gatt.disconnect();
                }
            } catch (err) {
                // Already gone.
            }
        }
        this._device = null;
        this._server = null;
        this._rx = null;
        this._tx = null;
        this._buffer = '';
        this._rejectWaiter(new Error('Disconnected.'));
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_DISCONNECTED);
    }

    isConnected () {
        return this._connected;
    }

    // ---------------------------------------------------------------- bytes

    /**
     * @param {?Function} callback - called with each Buffer the board sends.
     */
    setOnMessage (callback) {
        this._onMessage = callback;
    }

    _handleNotification (event) {
        const bytes = new Uint8Array(event.target.value.buffer);
        let text = '';
        for (let i = 0; i < bytes.length; i++) {
            text += String.fromCharCode(bytes[i]);
        }
        this._buffer += text;
        this._checkWaiter();
        // Nothing consumes this while live mode is running -- there is no
        // pending read between uploads -- so keep only enough tail for the
        // next reply to start in, rather than a session's worth of output.
        if (this._waiter === null && this._buffer.length > IDLE_BUFFER_LIMIT) {
            this._buffer = this._buffer.slice(-IDLE_BUFFER_LIMIT);
        }
        if (this._piping && this._onMessage) {
            this._onMessage(bytes);
        }
    }

    /**
     * Send bytes to the board.
     *
     * Queued, because a write is several acknowledged chunks and callers do
     * not wait for one before starting the next -- live mode sends its
     * interrupt and its mode change back to back. Unqueued, the chunks of the
     * two would interleave and the board would receive neither.
     * @param {Uint8Array|string} data - what to send.
     * @returns {Promise} - resolves once every chunk is acknowledged.
     */
    write (data) {
        this._writeQueue = this._writeQueue
            .then(() => this._writeNow(data))
            .catch(() => {
                // A failed write must not poison every write after it; the
                // caller finds out from the reply that never comes.
            });
        return this._writeQueue;
    }

    async _writeNow (data) {
        if (!this._connected || !this._rx) return;

        let bytes = data;
        if (typeof data === 'string') {
            bytes = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) {
                bytes[i] = data.charCodeAt(i) & 0xFF;
            }
        }

        for (let offset = 0; offset < bytes.length; offset += this._chunk) {
            await this._rx.writeValue(bytes.slice(offset, offset + this._chunk));
        }
    }

    // ------------------------------------------------------------- raw REPL

    /**
     * Put the board into raw mode, where it takes code without echoing it.
     *
     * The Ctrl-C is noticed by the board's Bluetooth callback rather than by
     * the terminal, so it interrupts a running program too -- which is the
     * usual state of a board that has just been uploaded to.
     * @returns {Promise} - resolves once the board is in raw mode.
     */
    async enterRaw () {
        for (let attempt = 0; attempt < 2; attempt++) {
            await this.write(`\r${CTRL_C}${CTRL_C}`);
            await delay(200);
            this._buffer = '';
            await this.write(`\r${CTRL_A}`);
            try {
                await this._expect(RAW_BANNER, 4000);
                await this._expect('>', 4000);
                return;
            } catch (err) {
                if (attempt === 1) {
                    throw new Error(
                        'The board did not answer its prompt over Bluetooth. ' +
                        'Try switching it off and on again.'
                    );
                }
            }
        }
    }

    /**
     * Run a snippet on the board and wait for it to finish.
     * @param {string} code - the MicroPython source to run.
     * @returns {Promise<string>} - whatever the snippet printed.
     */
    async exec (code) {
        // Start from a known-empty buffer. A previous statement that timed out
        // leaves its unread reply behind, and matching that against this
        // statement's expected answer would put the framing permanently one
        // reply out of step.
        this._buffer = '';
        await this.write(code + CTRL_D);
        await this._expect('OK', EXEC_TIMEOUT_MS);
        const out = await this._expect(CTRL_D, EXEC_TIMEOUT_MS);
        const err = await this._expect(CTRL_D, EXEC_TIMEOUT_MS);
        await this._expect('>', EXEC_TIMEOUT_MS);
        if (err.trim()) {
            throw new Error(err.trim());
        }
        return out;
    }

    /**
     * Write a file onto the board's filesystem.
     * @param {string} remoteName - the name to save it under.
     * @param {string} contents - the file's text.
     * @param {?Function} onProgress - called with a 0..1 fraction as it goes.
     * @returns {Promise} - resolves once the file is closed.
     */
    async writeFile (remoteName, contents, onProgress = null) {
        const target = JSON.stringify(remoteName);
        const bytes = utf8Bytes(contents);

        await this.exec(`import ubinascii\n_f=open(${target},'wb')`);
        for (let offset = 0; offset < bytes.length; offset += FILE_CHUNK) {
            // Throwing, not breaking: the caller closes the file either way,
            // so stopping quietly here would leave a half-written file that
            // looks complete to everything downstream.
            if (this._abort) {
                await this.exec('_f.close()\ndel _f').catch(() => {});
                throw new Error('ABORTED');
            }
            const slice = bytes.slice(offset, offset + FILE_CHUNK);
            await this.exec(`_f.write(ubinascii.a2b_base64('${toBase64(slice)}'))`);
            if (onProgress) {
                onProgress(Math.min(1, (offset + FILE_CHUNK) / bytes.length));
            }
        }
        await this.exec('_f.close()\ndel _f');
    }

    /**
     * Read a small file off the board.
     * @param {string} remoteName - the file to read.
     * @returns {Promise<?string>} - its contents, or null if it is not there.
     */
    async readFile (remoteName) {
        const target = JSON.stringify(remoteName);
        const out = await this.exec(
            'try:\n' +
            `    _f=open(${target})\n` +
            '    print(_f.read(), end="")\n' +
            '    _f.close()\n' +
            '    del _f\n' +
            'except OSError:\n' +
            '    print(chr(0), end="")\n'
        );
        return out === '\x00' ? null : out;
    }

    // ------------------------------------------------------------ uploading

    abortUpload () {
        this._abort = true;
    }

    /**
     * Ask the board how much one packet can carry, and size writes to match.
     *
     * Web Bluetooth will not report the negotiated MTU, so the board is asked
     * instead. A board running older firmware has no mieoble.mtu() and the
     * question simply fails -- which is itself the answer: stay at 20 bytes.
     * That is the whole of the backwards-compatibility story, with no version
     * negotiation to get wrong.
     * @param {Function} say - writes a line to the upload console.
     * @returns {Promise} - resolves once the chunk size is settled.
     * @private
     */
    async _learnChunk (say) {
        this._chunk = MIN_CHUNK;
        try {
            const reply = await this.exec('import mieoble\nprint(mieoble.mtu())');
            const mtu = parseInt(reply.trim(), 10);
            if (!isNaN(mtu) && mtu > 23) {
                this._chunk = Math.max(MIN_CHUNK, Math.min(MAX_CHUNK, mtu - 3));
            }
        } catch (err) {
            say('This board is running older firmware, so the upload will be slow.\n');
        }
    }

    /**
     * Make sure the board has the receiver that makes uploads safe.
     *
     * A board that has only ever been flashed by an older Robolab will not
     * have it. It is pushed once the slow way -- through the plain REPL, which
     * needs nothing already on the board -- and every upload after that uses it.
     * @param {Function} say - writes a line to the upload console.
     * @returns {Promise} - resolves once the receiver is importable.
     * @private
     */
    async _ensureReceiver (say) {
        try {
            await this.exec('import mieoupload as _u');
            return;
        } catch (err) {
            // Not installed yet, which is only expected once per board.
        }

        say('Setting the board up for safe uploads (first time only)...\n');
        let contents;
        try {
            contents = await (await fetchOrThrow(`${LIBRARY_URL}/mieoupload.py`)).text();
        } catch (err) {
            throw new Error(
                `Could not fetch the board library (${err.message}).\n` +
                'Connect the board over USB and upload once to install it.'
            );
        }

        // Staged and checked even here, where the receiver that normally
        // does that does not exist yet. A half-written mieoupload.py that
        // still imports is the worst outcome available: every later upload
        // would fail somewhere in the middle and nothing would re-send it.
        const bytes = utf8Bytes(contents);
        await this.writeFile('mieoupload.py.tmp', contents);

        const onBoard = await this.exec(
            'import binascii\n' +
            '_c=0\n' +
            '_g=open("mieoupload.py.tmp","rb")\n' +
            'while True:\n' +
            '    _b=_g.read(512)\n' +
            '    if not _b: break\n' +
            '    _c=binascii.crc32(_b,_c)&0xFFFFFFFF\n' +
            '_g.close()\n' +
            'del _g,_b\n' +
            'print(_c)\n'
        );
        if (parseInt(onBoard.trim(), 10) !== crc32(bytes)) {
            await this.exec(
                'import os\nos.remove("mieoupload.py.tmp")\n'
            ).catch(() => {});
            throw new Error('The upload helper did not arrive intact. Try again.');
        }

        await this.exec(
            'import os\n' +
            'try:\n' +
            '    os.rename("mieoupload.py.tmp","mieoupload.py")\n' +
            'except OSError:\n' +
            '    os.remove("mieoupload.py")\n' +
            '    os.rename("mieoupload.py.tmp","mieoupload.py")\n'
        );
        await this.exec('import mieoupload as _u');
    }

    /**
     * Turn one of the board's refusals into something worth reading.
     * @param {string} name - the file being sent.
     * @param {string} reply - what the board answered.
     * @returns {string} - an explanation.
     * @private
     */
    _explainUpload (name, reply) {
        const parts = reply.split(' ');
        if (parts[0] === 'CRC') {
            return `${name} arrived damaged and was thrown away. ` +
                'The board is still running the program it had before. Try again.';
        }
        if (reply.startsWith('ERR NOSPACE')) {
            return `There is not enough room on the board for ${name} ` +
                `(needs ${parts[2]} bytes, ${parts[3]} free).`;
        }
        if (reply.startsWith('ERR SHORT')) {
            return `Only ${parts[3]} of ${parts[2]} bytes of ${name} arrived. ` +
                'The board is still running the program it had before.';
        }
        if (reply.startsWith('ERR BADNAME')) {
            return `The board refused to write ${name}.`;
        }
        return `The board refused ${name}: ${reply}`;
    }

    /**
     * Open the link again after it dropped, without asking for another click.
     *
     * The retained device object is the only way back: this Chromium has no
     * getDevices, so a board forgotten here cannot be found again without the
     * user starting a fresh scan.
     * @returns {Promise} - resolves once the REPL is reachable again.
     * @private
     */
    async _reconnect () {
        if (!this._device) {
            throw new Error('The board disconnected.');
        }
        this._connected = false;
        await this._openLink(this._device);

        this._runtime.emit(this._runtime.constructor.PERIPHERAL_CONNECTED);
        await this.enterRaw();
        // A new link is a new negotiation, so the old packet size means
        // nothing now.
        await this._learnChunk(() => {});
        await this.exec('import mieoupload as _u');
    }

    /**
     * Reopen the GATT link to a board already chosen, and nothing more: no
     * interrupt and no raw REPL. That is what makes it safe right after a
     * restart, when the board is running the program just uploaded.
     * @param {BluetoothDevice} device - the board to reach.
     * @returns {Promise} - resolves once bytes can flow both ways.
     * @private
     */
    async _openLink (device) {
        this._linkAttempt += 1;
        const attempt = this._linkAttempt;
        this._buffer = '';

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(UART_SERVICE);
        const rx = await service.getCharacteristic(UART_RX);
        const tx = await service.getCharacteristic(UART_TX);
        tx.removeEventListener('characteristicvaluechanged', this._handleNotification);
        await tx.startNotifications();
        tx.addEventListener('characteristicvaluechanged', this._handleNotification);

        if (this._device !== device) {
            // Disconnected by hand while this was pending. Bringing the link
            // back up behind the user's back would undo what they just did.
            this._letGo(device);
            throw new Error('Disconnected.');
        }
        if (this._linkAttempt !== attempt) {
            // Given up on, and replaced by a newer attempt that owns the link.
            throw new Error('Superseded.');
        }
        this._server = server;
        this._rx = rx;
        this._tx = tx;
        this._connected = true;
    }

    /**
     * @param {BluetoothDevice} device - the board to drop. Also cancels a
     *   connection attempt still in progress.
     * @private
     */
    _letGo (device) {
        try {
            device.gatt.disconnect();
        } catch (err) {
            // Nothing to let go of.
        }
    }

    /**
     * Restart the board so it runs the new program, then come back to it.
     *
     * A hard reset, not the Ctrl-D soft reset used to be sent: a soft reset
     * with the radio running panics this board (Guru Meditation,
     * StoreProhibited), and the new program only ever started because the
     * crash rebooted it.
     *
     * The link is let go on this side rather than waited on. A board that
     * resets mid-connection says nothing on the way down, so Chromium would
     * hold a dead link until its supervision timeout, and a reconnect tried
     * before then would "succeed" against it.
     *
     * The USB cable already gets this from the link server, which reopens the
     * port after every upload. Without it Bluetooth was the one connection an
     * upload quietly ended.
     * @param {Function} say - writes a line to the upload console.
     * @returns {Promise<boolean>} - whether the board is connected again.
     * @private
     */
    async _restartAndReconnect (say) {
        const device = this._device;
        if (!device) return false;

        say('Restarting board...\n');
        this._restarting = true;
        let reconnected = false;
        try {
            await this.write(`import machine\nmachine.reset()${CTRL_D}`);
            await delay(RESTART_SETTLE_MS);
            this._connected = false;
            this._letGo(device);

            say('Reconnecting over Bluetooth...\n');
            const deadline = Date.now() + RESTART_RECONNECT_MS;
            while (this._device === device && Date.now() < deadline) {
                try {
                    await withTimeout(this._openLink(device), RECONNECT_ATTEMPT_MS, () => {
                        this._linkAttempt += 1;
                        this._letGo(device);
                    });
                    reconnected = true;
                    break;
                } catch (err) {
                    // Still booting, most likely. Try again shortly.
                    if (this._device === device && Date.now() < deadline) {
                        await delay(RECONNECT_RETRY_MS);
                    }
                }
            }
        } finally {
            this._restarting = false;
        }

        if (reconnected) {
            say('Connected again.\n');
            return true;
        }
        // Disconnected by hand while it restarted: that already told the editor.
        if (this._device !== device) {
            return false;
        }
        // The program is on the board and running. Only the link is lost, so
        // this is a disconnect to report, not a failed upload.
        say('Could not reconnect over Bluetooth. The new program is running -- ' +
            'connect again from the connection menu to carry on.\n');
        this.disconnect();
        return false;
    }

    /**
     * Start a transfer on the board.
     * @param {string} name - the file to write.
     * @param {number} size - how many bytes it is.
     * @param {number} crc - CRC-32 of the whole file.
     * @returns {Promise<string>} - the board's session id for this transfer.
     * @private
     */
    async _beginTransfer (name, size, crc) {
        const reply = (await this.exec(
            `_u.begin(${JSON.stringify(name)},${size},${crc},${FILE_CHUNK})`
        )).trim();
        if (!reply.startsWith('OK ')) {
            throw new Error(this._explainUpload(name, reply));
        }
        return reply.split(' ')[2];
    }

    /**
     * Send one file, and only let it take effect if it arrived whole.
     *
     * The board stages every byte in a temporary file and checks it against
     * this CRC before putting it in place, so an upload that is interrupted --
     * the board carried out of range, a flat battery, the editor closed --
     * leaves the program that was already working exactly as it was.
     * @param {string} name - the file to write on the board.
     * @param {Uint8Array} bytes - its contents.
     * @param {Function} say - writes a line to the upload console.
     * @returns {Promise} - resolves once the file is in place.
     * @private
     */
    async _transfer (name, bytes, say) {
        const expected = crc32(bytes);
        const total = Math.max(1, Math.ceil(bytes.length / FILE_CHUNK));

        let session = await this._beginTransfer(name, bytes.length, expected);
        let seq = 0;
        let rewinds = 0;
        let reconnected = false;
        let lastBeat = Date.now();

        while (seq < total) {
            if (this._abort) {
                await this.exec('_u.abort()').catch(() => {});
                throw new Error('ABORTED');
            }

            const slice = bytes.subarray(seq * FILE_CHUNK, (seq + 1) * FILE_CHUNK);
            let reply;
            try {
                reply = (await this.exec(`_u.w(${seq},"${toBase64(slice)}")`)).trim();
            } catch (err) {
                // One attempt to pick up where it stopped. Everything the board
                // accepted so far is still staged, so resuming costs nothing
                // and starting over is the fallback rather than the rule.
                if (reconnected || this._abort) {
                    throw err;
                }
                reconnected = true;
                say('Bluetooth dropped. Reconnecting...\n');
                await this._reconnect();

                const line = (await this.exec('_u.status()')).trim();
                const parts = line.split(' ');
                if (parts.length === 5 && parts[0] === session && parts[1] === name) {
                    seq = parseInt(parts[2], 10) || 0;
                    say(`Carrying on from chunk ${seq} of ${total}.\n`);
                } else {
                    session = await this._beginTransfer(name, bytes.length, expected);
                    seq = 0;
                    say('Starting the file again.\n');
                }
                continue;
            }

            const code = reply.charAt(0);
            const at = parseInt(reply.slice(2), 10);

            if (code === 'A') {
                seq += 1;
            } else if (code === 'D' || code === 'G' || code === 'L') {
                // The board says which chunk it actually wants next: one it
                // already has, one it never got, or one that arrived the wrong
                // length. All three are answered the same way -- go back to
                // where it asked for and carry on from there.
                if (!isNaN(at)) {
                    seq = at;
                }
                rewinds += 1;
                if (rewinds > MAX_REWINDS) {
                    throw new Error(
                        `The board kept losing parts of ${name}. ` +
                        'Move it closer, or connect over USB.'
                    );
                }
            } else if (code === 'E') {
                throw new Error(`The board could not store ${name}: ${reply.slice(2)}`);
            } else {
                throw new Error(`Unexpected answer from the board: ${reply}`);
            }

            if (Date.now() - lastBeat > HEARTBEAT_MS) {
                lastBeat = Date.now();
                say(`  ${name} ${Math.floor((seq / total) * 100)}%\n`);
            }
        }

        const done = (await this.exec('_u.commit()')).trim();
        if (done !== 'OK') {
            throw new Error(this._explainUpload(name, done));
        }
    }

    /**
     * Send a program to the board over Bluetooth.
     * @param {string} code - the MicroPython program to run as main.py.
     * @returns {Promise} - resolves once the board has restarted and, where it
     *   can be, been reconnected.
     */
    async upload (code) {
        const Runtime = this._runtime.constructor;
        const say = message => this._runtime.emit(Runtime.PERIPHERAL_UPLOAD_STDOUT, {message});

        this._abort = false;
        this._piping = false;
        this._runtime.emit(Runtime.PERIPHERAL_SET_UPLOAD_ABORT_ENABLED, true);

        try {
            say('Waking the board over Bluetooth...\n');
            await this.enterRaw();
            await this._learnChunk(say);
            await this._ensureReceiver(say);

            await this._syncLibrary(say);

            if (!this._abort) {
                const bytes = utf8Bytes(code);
                say(`Sending main.py (${bytes.length} bytes)...\n`);
                await this._transfer('main.py', bytes, say);

                // The program is committed; there is nothing left to abort.
                this._runtime.emit(Runtime.PERIPHERAL_SET_UPLOAD_ABORT_ENABLED, false);
                await this._restartAndReconnect(say);
            }

            this._piping = true;
            this._runtime.emit(Runtime.PERIPHERAL_SET_UPLOAD_ABORT_ENABLED, false);
            this._runtime.emit(Runtime.PERIPHERAL_UPLOAD_SUCCESS, this._abort);
        } catch (err) {
            this._piping = true;
            this._runtime.emit(Runtime.PERIPHERAL_SET_UPLOAD_ABORT_ENABLED, false);

            if (err.message === 'ABORTED') {
                this._runtime.emit(Runtime.PERIPHERAL_UPLOAD_SUCCESS, true);
                return;
            }

            this._runtime.emit(Runtime.PERIPHERAL_UPLOAD_ERROR, {
                message: `${err.message}\n` +
                    'The board is still running whatever program it had before. ' +
                    'If this keeps happening, connect it with a USB cable and upload that way.'
            });
        }
    }

    /**
     * Copy across whichever library files the board does not already have.
     *
     * Over Bluetooth this is the slow part, so it is skipped whenever the
     * board's own record says it is already up to date -- which it will be,
     * because the library is installed the first time over USB.
     * @param {Function} say - writes a line to the upload console.
     * @returns {Promise} - resolves once the board is up to date.
     * @private
     */
    async _syncLibrary (say) {
        let wanted;
        try {
            wanted = (await (await fetchOrThrow(LIBRARY_URL)).json()).files;
            if (!wanted || typeof wanted !== 'object') {
                throw new Error('the library server sent no file list');
            }
        } catch (err) {
            say('Could not check the board library; sending the program only.\n');
            return;
        }

        let installed = {};
        try {
            const raw = await this.readFile(VERSION_FILE);
            if (raw) {
                installed = JSON.parse(raw);
            }
        } catch (err) {
            installed = {};
        }

        const stale = Object.keys(wanted).filter(name => installed[name] !== wanted[name]);
        if (stale.length === 0) {
            return;
        }

        // The receiver goes first, always. It is the thing that decides which
        // filenames are allowed to be written, so a board still running an
        // older copy refuses any library file added since -- and refuses it by
        // name, which looks like corruption rather than what it is. Updating
        // it before anything else is what lets a new file exist at all.
        stale.sort((a, b) => {
            if (a === RECEIVER_FILE) return -1;
            if (b === RECEIVER_FILE) return 1;
            return 0;
        });

        say(`Updating ${stale.length} library file(s) over Bluetooth. This is slow -- ` +
            'connect over USB if you would rather not wait.\n');

        for (const name of stale) {
            if (this._abort) return;
            let contents;
            try {
                contents = await (await fetchOrThrow(
                    `${LIBRARY_URL}/${encodeURIComponent(name)}`
                )).text();
            } catch (err) {
                // Deliberately fatal rather than skipped: carrying on would
                // write whatever the server did send -- an error page, a
                // truncated body -- onto the board as a library file.
                throw new Error(`Could not fetch ${name}: ${err.message}`);
            }
            say(`Sending ${name}...\n`);
            // Through the same staged and checksummed path as the program
            // itself, so a half-sent boot.py or mieoble.py can never leave a
            // board across the room unable to start its radio.
            await this._transfer(name, utf8Bytes(contents), say);

            if (name === RECEIVER_FILE) {
                // Writing the file is not enough. The copy already imported is
                // the one deciding which names may be written, and it goes on
                // refusing anything added since until it is loaded again --
                // which looks exactly like the new file being corrupt.
                await this.exec(
                    'import sys\n' +
                    'sys.modules.pop("mieoupload", None)\n' +
                    'import mieoupload as _u\n'
                );
            }
        }

        if (!this._abort) {
            await this._transfer(VERSION_FILE, utf8Bytes(JSON.stringify(wanted)), say);
        }
    }

    /**
     * Not possible over Bluetooth, and not a shortcoming of this code.
     */
    uploadFirmware () {
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_UPLOAD_ERROR, {
            message: 'Firmware can only be flashed over USB.\n' +
                "The chip's built-in bootloader is what receives the firmware, and it can only " +
                'be reached through the USB cable -- Bluetooth does not exist until the firmware ' +
                'it would be replacing is already running.\n' +
                'Connect the board with a USB cable, pick its COM port, and flash it there. ' +
                'Programs can go back over Bluetooth afterwards.'
        });
    }

    // -------------------------------------------------------------- waiting

    _expect (needle, timeout) {
        return new Promise((resolve, reject) => {
            if (this._waiter) {
                return reject(new Error('a read is already in progress'));
            }
            this._waiter = {
                needle,
                resolve,
                reject,
                timer: setTimeout(() => {
                    this._rejectWaiter(new Error(
                        `The board stopped answering (expected ${JSON.stringify(needle)}).`
                    ));
                }, timeout)
            };
            this._checkWaiter();
        });
    }

    _checkWaiter () {
        const waiter = this._waiter;
        if (!waiter) return;
        const index = this._buffer.indexOf(waiter.needle);
        if (index < 0) return;

        const before = this._buffer.slice(0, index);
        this._buffer = this._buffer.slice(index + waiter.needle.length);
        this._waiter = null;
        clearTimeout(waiter.timer);
        waiter.resolve(before);
    }

    _rejectWaiter (err) {
        const waiter = this._waiter;
        if (!waiter) return;
        this._waiter = null;
        clearTimeout(waiter.timer);
        waiter.reject(err);
    }
}

module.exports = MieoBle;
module.exports.BLE_PREFIX = BLE_PREFIX;
// Exported so a test can check it against the board's binascii.crc32:
// the two agreeing is what decides whether an upload may replace a
// working program, so it is worth pinning down.
module.exports.crc32 = crc32;

