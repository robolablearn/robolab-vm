const Buffer = require('buffer').Buffer;

const CommonPeripheral = require('../common/common-peripheral');
const MieoBle = require('./mieo-ble');

/**
 * A Mieo, reachable two ways at once.
 *
 * The board can be plugged in or it can be across the room on Bluetooth, and
 * the editor should not have to care which. This puts both in one connection
 * list -- COM ports and Bluetooth boards together -- and sends everything that
 * follows down whichever one was picked.
 *
 * Ids are how the two are told apart: a Bluetooth board's id carries the
 * BLE_PREFIX, and anything else is a serial port.
 */
class MieoPeripheral extends CommonPeripheral {
    constructor (runtime, deviceId, originalDeviceId, pnpidList, serialConfig, diveceOpt) {
        super(runtime, deviceId, originalDeviceId, pnpidList, serialConfig, diveceOpt);

        this._serialList = {};
        this._bleList = {};

        /** Whether the board in use is the Bluetooth one. */
        this._overBle = false;

        this._ble = new MieoBle(runtime, originalDeviceId, diveceOpt,
            list => this._onBleList(list));
        this._ble.setOnMessage(bytes => {
            this._runtime.emit(this._runtime.constructor.PERIPHERAL_RECIVE_DATA,
                Buffer.from(bytes));
        });
    }

    /**
     * @returns {boolean} - whether the connected board is on Bluetooth.
     */
    get isOverBluetooth () {
        return this._overBle;
    }

    // ------------------------------------------------------------ discovery

    scan (pnpidList, listAll) {
        this._overBle = false;
        this._serialList = {};
        this._bleList = {};

        super.scan(pnpidList, listAll);

        // Take the serial results rather than letting them go straight to the
        // GUI, so they can be shown alongside the Bluetooth ones.
        this._serialport.setOnPeripheralList(list => {
            this._serialList = list;
            this._emitList();
        });

        if (MieoBle.isSupported) {
            this._ble.scan(listAll);
        }
    }

    _onBleList (list) {
        this._bleList = list;
        this._emitList();
    }

    _emitList () {
        this._runtime.emit(
            this._runtime.constructor.PERIPHERAL_LIST_UPDATE,
            Object.assign({}, this._serialList, this._bleList)
        );
    }

    // ----------------------------------------------------------- connecting

    connect (id, baudrate = null) {
        if (String(id).startsWith(MieoBle.BLE_PREFIX)) {
            this._overBle = true;
            // The serial scan is still running; end it quietly, because a
            // "disconnected" now would land in the middle of connecting.
            if (this._serialport) {
                this._serialport.stopDiscovery();
                this._serialport = null;
            }
            this._ble.connect(id).catch(err => {
                this._overBle = false;
                this._runtime.emit(this._runtime.constructor.PERIPHERAL_REQUEST_ERROR, {
                    message: err.message,
                    deviceId: this._originalDeviceId
                });
            });
            return;
        }

        this._overBle = false;
        this._ble.stopScan();
        super.connect(id, baudrate);
    }

    disconnect () {
        this._ble.stopScan();
        if (this._overBle) {
            this._overBle = false;
            this._ble.disconnect();
            this.reset();
            return;
        }
        super.disconnect();
    }

    isConnected () {
        return this._overBle ? this._ble.isConnected() : super.isConnected();
    }

    // ---------------------------------------------------------------- bytes

    setBaudrate (baudrate) {
        // Bluetooth has no baud rate; the editor sets one anyway on a mode
        // switch, and it is simply not its business.
        if (this._overBle) return;
        super.setBaudrate(baudrate);
    }

    write (data) {
        if (this._overBle) {
            this._ble.write(data);
            return;
        }
        super.write(data);
    }

    send (message) {
        if (this._overBle) {
            this._ble.write(message);
            return;
        }
        super.send(message);
    }

    // ------------------------------------------------------------ uploading

    upload (code) {
        if (this._overBle) {
            this._ble.upload(code);
            return;
        }
        super.upload(code);
    }

    uploadFirmware () {
        if (this._overBle) {
            this._ble.uploadFirmware();
            return;
        }
        super.uploadFirmware();
    }

    abortUpload () {
        if (this._overBle) {
            this._ble.abortUpload();
            return;
        }
        super.abortUpload();
    }
}

module.exports = MieoPeripheral;
