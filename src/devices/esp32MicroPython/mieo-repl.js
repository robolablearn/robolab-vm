const Buffer = require('buffer').Buffer;

/**
 * Live ("Arena") mode driver for the Mieo board.
 *
 * Upload mode compiles the blocks into main.py and copies it over with
 * mpremote. Live mode instead keeps the serial port open and feeds one line
 * of MicroPython at a time to the board's raw REPL, which is already sitting
 * on the same wire -- so unlike the Arduino boards there is no separate
 * realtime firmware to flash. The REPL *is* the agent.
 *
 * Every call goes through a queue and resolves only once the board has
 * finished the statement and handed the prompt back, so a stack of blocks
 * runs strictly in order, the same as it would in upload mode.
 */

// raw REPL control bytes, see docs.micropython.org "raw REPL"
const CTRL_A = '\x01'; // enter raw REPL
const CTRL_B = '\x02'; // back to the friendly REPL
const CTRL_C = '\x03'; // interrupt whatever is running
const CTRL_D = '\x04'; // execute the buffered statement
// Carriage return, built from its code point so no escape can be mangled.
const CR = String.fromCharCode(13);

/**
 * End of a raw-REPL reply: the board sends OK, stdout, \x04, stderr, \x04, >.
 * It has to be the EOT *and* the prompt together -- a bare '>' also turns up
 * inside every traceback, which all mention File "<stdin>".
 * @type {string}
 */
const RAW_TERMINATOR = `${CTRL_D}>`;
const RAW_BANNER = 'raw REPL; CTRL-B to exit';

/**
 * How long to wait for the board to finish one statement. Animations and
 * patterns run about 3s on the board, so this has to be comfortably above
 * that, while still failing rather than hanging the VM forever if a board is
 * unplugged mid-statement.
 * @type {number}
 */
const EXEC_TIMEOUT_MS = 15000;

/** Time allowed for the board to drop into the raw REPL when live mode starts. */
const HANDSHAKE_TIMEOUT_MS = 4000;

/**
 * How much unread chatter to keep between statements. Only ever needs to hold
 * the tail a reply could start in, so a few KB is generous.
 * @type {number}
 */
const IDLE_BUFFER_LIMIT = 4096;

class MieoRepl {
    /**
     * @param {object} runtime - the VM runtime, used for the incoming data event.
     * @param {object} peripheral - the CommonPeripheral owning the serial port.
     */
    constructor (runtime, peripheral) {
        this._runtime = runtime;
        this._peripheral = peripheral;

        this._buffer = '';
        this._pending = null;      // {resolve, reject, match, timer}
        this._queue = Promise.resolve();
        //: Bumped to abandon everything still queued. A stop that merely joined
        //: the back of the queue would run after the drive statements it was
        //: meant to cancel, which on a robot is the wrong way round.
        this._epoch = 0;
        this._ready = false;       // raw REPL entered and `import mieo` done

        this._onData = this._onData.bind(this);
        this._runtime.on('PERIPHERAL_RECIVE_DATA', this._onData);

        // A session is only valid while one board stays connected in one mode.
        // Switching to Upload hands the port to mpremote, and unplugging
        // leaves the raw REPL state behind on a board we can no longer see.
        this._runtime.on('PROGRAM_MODE_UPDATE', () => this.release());
        this._runtime.on('PERIPHERAL_DISCONNECTED', () => this.reset());
    }

    /**
     * Forget the session. The next statement re-runs the handshake, which is
     * what we want after a disconnect, an upload, or a mode switch.
     */
    reset () {
        this._ready = false;
        this._buffer = '';
        if (this._pending) {
            this._settle(null, new Error('Connection to the Mieo was interrupted.'));
        }
    }

    /**
     * Hand the board back to the friendly REPL so it behaves normally for
     * anyone opening a serial terminal, and so mpremote can take over.
     */
    release () {
        if (this._ready && this._peripheral.isConnected()) {
            // Stop the wheels before handing the port over. Switching to
            // Upload mode does not stop the project, so without this a robot
            // driving in Arena mode carries on driving with nothing left
            // watching it -- the motor duty is latched in hardware and needs
            // no CPU to keep going.
            this._epoch += 1;
            this._peripheral.write(`mieo.stoprobot()${CTRL_D}`);
            this._peripheral.write(CTRL_B);
        }
        this.reset();
    }

    /**
     * Run one line of MicroPython on the board.
     * @param {string} statement - e.g. "mieo.showemotion('happy')".
     * @returns {Promise<string>} - anything the statement printed, trimmed.
     */
    exec (statement) {
        // Chain onto the queue so two scripts, or a fast click, cannot
        // interleave halfway through a statement on the wire.
        const epoch = this._epoch;
        const run = () => (epoch === this._epoch ?
            this._execNow(statement) :
            Promise.resolve(''));
        this._queue = this._queue.then(run, run);
        return this._queue;
    }

    /**
     * Throw away everything still queued and run this instead.
     *
     * For stopping. Anything queued behind a stop was written on the
     * assumption the robot was still going, so running it afterwards would
     * start the wheels again a moment after the button was pressed.
     * @param {string} statement - what to run in place of the queue.
     * @returns {Promise<string>} - whatever it printed.
     */
    abort (statement) {
        this._epoch += 1;
        return this.exec(statement);
    }

    /**
     * Reporter blocks (sensors, pin reads) will want a value rather than a
     * side effect. repr() keeps floats and strings intact across the wire.
     * @param {string} expression - a MicroPython expression.
     * @returns {Promise<string>} - the repr of the value.
     */
    evaluate (expression) {
        return this.exec(`print(repr(${expression}))`);
    }

    async _execNow (statement) {
        if (!this._peripheral.isConnected()) {
            throw new Error('The Mieo is not connected.');
        }
        if (!this._ready) {
            await this._handshake();
        }
        return this._sendAndWait(statement);
    }

    /**
     * Stop whatever main.py is doing, drop into the raw REPL, and pull in the
     * library the blocks are written against.
     * @private
     */
    async _handshake () {
        // Same sequence pyboard.py uses, and the leading CR matters: it
        // terminates any half-typed line so the ctrl-C is seen as its own
        // input rather than being swallowed by whatever came before it.
        // Two interrupts because the first can land while the board is still
        // booting, before the interpreter is listening.
        const knock = async () => {
            this._buffer = '';
            this._peripheral.write(CR + CTRL_C + CTRL_C);
            this._peripheral.write(CR + CTRL_A);
            return this._waitFor(RAW_BANNER, HANDSHAKE_TIMEOUT_MS,
                'The Mieo did not answer. Unplug and replug it, then try again.');
        };

        try {
            await knock();
        } catch (err) {
            // One retry: a board busy in a long sleep can miss the first
            // interrupt entirely, and a second knock usually lands.
            await knock();
        }
        this._ready = true;

        try {
            await this._sendAndWait('import mieo');
        } catch (err) {
            this._ready = false;
            if (/ImportError|no module named/i.test(err.message)) {
                throw new Error(
                    'The Mieo library is not on this board yet. Switch to Upload mode ' +
                    'and upload once to install it, then come back to Arena mode.'
                );
            }
            throw err;
        }
    }

    /**
     * Push one statement through the raw REPL and wait for the board to
     * finish it. The board answers "OK<stdout>\x04<stderr>\x04>".
     * @private
     */
    async _sendAndWait (statement) {
        this._buffer = '';
        this._peripheral.write(`${statement}${CTRL_D}`);

        const reply = await this._waitFor(RAW_TERMINATOR, EXEC_TIMEOUT_MS,
            `The Mieo did not finish "${statement}".`);

        // What is left is OK<stdout>\x04<stderr> -- the closing \x04 went with
        // the terminator above.
        const body = reply.replace(/^\s*OK/, '');
        const parts = body.split(CTRL_D);
        const stdout = (parts[0] || '').trim();
        const stderr = (parts[1] || '').trim();

        if (stderr) {
            // Last line of a traceback is the useful part for a student.
            const lines = stderr.split('\n').map(l => l.trim()).filter(l => l);
            const message = lines[lines.length - 1] || stderr;
            // The library is only ever copied to the board by an upload, never
            // by Arena mode, so a board that has not been uploaded to since the
            // blocks changed is missing the function the block just called.
            // "AttributeError: 'module' object has no attribute 'showmatrix'"
            // is not a clue anyone can act on.
            if (/AttributeError/i.test(message) && /mieo|display/i.test(statement)) {
                throw new Error(`${message}\n` +
                    'The Mieo library on this board is older than these blocks. ' +
                    'Switch to Upload mode and upload once to refresh it, then ' +
                    'come back to Arena mode.');
            }
            throw new Error(message);
        }
        return stdout;
    }

    /**
     * Resolve once `token` shows up in the incoming stream.
     * @private
     */
    _waitFor (token, timeoutMs, timeoutMessage) {
        return new Promise((resolve, reject) => {
            this._pending = {
                token,
                resolve,
                reject,
                timer: setTimeout(() => {
                    this._settle(null, new Error(timeoutMessage));
                }, timeoutMs)
            };
            // The reply may already be sitting in the buffer.
            this._drain();
        });
    }

    /**
     * @param {Buffer} data - bytes from the board.
     * @private
     */
    _onData (data) {
        this._buffer += Buffer.from(data).toString('binary');

        // Between statements this is console output, a boot banner, or a
        // print() from the user's own program, and nothing will ever consume
        // it. Keep only the tail so a chatty board cannot grow this for the
        // whole session -- but never discard outright, because a reply can
        // land before the waiter is registered.
        if (!this._pending && this._buffer.length > IDLE_BUFFER_LIMIT) {
            this._buffer = this._buffer.slice(-IDLE_BUFFER_LIMIT);
        }
        this._drain();
    }

    /** @private */
    _drain () {
        if (!this._pending) return;
        const at = this._buffer.indexOf(this._pending.token);
        if (at === -1) return;

        const reply = this._buffer.slice(0, at);
        this._buffer = this._buffer.slice(at + this._pending.token.length);
        this._settle(reply, null);
    }

    /** @private */
    _settle (value, error) {
        const pending = this._pending;
        if (!pending) return;
        this._pending = null;
        clearTimeout(pending.timer);
        if (error) {
            pending.reject(error);
        } else {
            pending.resolve(value);
        }
    }
}

module.exports = MieoRepl;
