/**
 * Mieo Device
 *
 * @overview An Arduino Uno compatible custom board. Uses the same
 * pin configuration, serial settings, and FQBN as the Arduino Uno.
 */
const OpenBlockArduinoUnoDevice = require('../arduinoUno/arduinoUno');

const ArduinoPeripheral = require('../common/arduino-peripheral');

/**
 * The list of USB device filters.
 * @readonly
 */
const PNPID_LIST = [
    // https://github.com/arduino/Arduino/blob/1.8.0/hardware/arduino/avr/boards.txt#L51-L58
    'USB\\VID_2341&PID_0043',
    'USB\\VID_2341&PID_0001',
    'USB\\VID_2A03&PID_0043',
    'USB\\VID_2341&PID_0243',
    // For chinese clones that use CH340
    'USB\\VID_1A86&PID_7523'
];

/**
 * Configuration of serialport
 * @readonly
 */
const SERIAL_CONFIG = {
    baudRate: 57600,
    dataBits: 8,
    stopBits: 1
};

/**
 * Configuration for arduino-cli.
 * @readonly
 */
const DIVECE_OPT = {
    type: 'arduino',
    fqbn: 'arduino:avr:uno',
    firmware: 'arduinoUno.hex'
};

/**
 * Manage communication with a Mieo peripheral over a OpenBlock Link client socket.
 */
class MieoPeripheral extends ArduinoPeripheral{
    /**
     * Construct a Mieo communication object.
     * @param {Runtime} runtime - the OpenBlock runtime
     * @param {string} deviceId - the id of the extension
     * @param {string} originalDeviceId - the original id of the peripheral, like xxx_mieo
     */
    constructor (runtime, deviceId, originalDeviceId) {
        super(runtime, deviceId, originalDeviceId, PNPID_LIST, SERIAL_CONFIG, DIVECE_OPT);
    }
}

/**
 * OpenBlock blocks to interact with a Mieo peripheral.
 */
class OpenBlockMieoDevice extends OpenBlockArduinoUnoDevice{

    /**
     * @return {string} - the ID of this extension.
     */
    get DEVICE_ID () {
        return 'mieo';
    }

    /**
     * Construct a set of Mieo blocks.
     * @param {Runtime} runtime - the OpenBlock runtime.
     * @param {string} originalDeviceId - the original id of the peripheral, like xxx_mieo
     */
    constructor (runtime, originalDeviceId) {
        super(runtime, originalDeviceId);

        // Create a new Mieo peripheral instance
        this._peripheral = new MieoPeripheral(this.runtime, this.DEVICE_ID, originalDeviceId);

        this._peripheral.numDigitalPins = 14;
    }
}

module.exports = OpenBlockMieoDevice;
