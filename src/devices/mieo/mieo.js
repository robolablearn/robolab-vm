const formatMessage = require('format-message');

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const ProgramModeType = require('../../extension-support/program-mode-type');

const ArduinoPeripheral = require('../common/arduino-peripheral');

/**
 * The list of USB device filters.
 * @readonly
 */
const PNPID_LIST = [
    // USB VID/PID for Mieo board
    // This should be updated with actual Mieo board VID/PID
    'USB\\VID_1A86&PID_7523' // Using CH340 VID/PID as default for Arduino clones
];

/**
 * Configuration of serialport
 * @readonly
 */
const SERIAL_CONFIG = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1
};

/**
 * Configuration for arduino-cli.
 * @readonly
 */
const DIVECE_OPT = {
    type: 'arduino',
    fqbn: 'arduino:avr:uno', // Using Arduino Uno as base for Mieo
    firmware: 'mieo.hex',
    defaultBaudrate: 9600,
    disableRealtime: true
};

const Pins = {
    D0: '0',
    D1: '1',
    D2: '2',
    D3: '3',
    D4: '4',
    D5: '5',
    D6: '6',
    D7: '7',
    D8: '8',
    D9: '9',
    D10: '10',
    D11: '11',
    D12: '12',
    D13: '13',
    A0: 'A0',
    A1: 'A1',
    A2: 'A2',
    A3: 'A3',
    A4: 'A4',
    A5: 'A5'
};

const Level = {
    High: 'HIGH',
    Low: 'LOW'
};

const Buadrate = {
    B4800: '4800',
    B9600: '9600',
    B19200: '19200',
    B38400: '38400',
    B57600: '57600',
    B76800: '76800',
    B115200: '115200'
};

const Eol = {
    Warp: 'warp',
    NoWarp: 'noWarp'
};

const Mode = {
    Input: 'INPUT',
    Output: 'OUTPUT',
    InputPullup: 'INPUT_PULLUP'
};

const InterrupMode = {
    Rising: 'RISING',
    Falling: 'FALLING',
    Change: 'CHANGE',
    Low: 'LOW'
};

const DataType = {
    Char: 'char',
    Byte: 'byte',
    Int: 'int',
    Long: 'long',
    Float: 'float',
    String: 'string'
};

const Direction = {
    Forward: 'FORWARD',
    Backward: 'BACKWARD',
    Left: 'LEFT',
    Right: 'RIGHT'
};

const Orientation = {
    Horizontal: '0',
    Vertical: '1'
};

const TouchPadChannel = {
    T1: '0',
    T2: '1'
};

const InfraredSensor = {
    Left: 'A3',
    Right: 'A2'
};

const MotorSide = {
    Left: 'L',
    Right: 'R'
};

const ServoPort = {
    Servo1: '1',
    Servo2: '2'
};

const UltrasonicPort = {
    Port1: '1',
    Port2: '2'
};

const BuzzerSong = {
    HappyBirthday: 'HAPPY_BIRTHDAY',
    JingleBells: 'JINGLE_BELLS',
    WeWishYou: 'WE_WISH_YOU',
    TwinkleTwinkle: 'TWINKLE_TWINKLE',
    OdeToJoy: 'ODE_TO_JOY',
    MaryHadALittleLamb: 'MARY_HAD_A_LITTLE_LAMB',
    Startup: 'STARTUP',
    Error: 'ERROR'
};

const BuzzerNote = {
    C4: 'C4',
    D4: 'D4',
    E4: 'E4',
    F4: 'F4',
    G4: 'G4',
    A4: 'A4',
    B4: 'B4',
    C5: 'C5',
    D5: 'D5',
    E5: 'E5',
    F5: 'F5',
    G5: 'G5',
    A5: 'A5',
    B5: 'B5',
    C6: 'C6',
    D6: 'D6',
    E6: 'E6',
    F6: 'F6',
    G6: 'G6',
    A6: 'A6',
    B6: 'B6',
    C7: 'C7',
    D7: 'D7',
    E7: 'E7',
    F7: 'F7',
    G7: 'G7',
    A7: 'A7',
    B7: 'B7'
};

const BuzzerDuration = {
    Whole: '1',
    Half: '2',
    Quarter: '4',
    Eighth: '8',
    Sixteenth: '16'
};

const ToggleState = {
    On: '1',
    Off: '0'
};

const BluetoothButton = {
    Up: 'F',
    Down: 'B',
    Right: 'R',
    Left: 'L',
    Triangle: 'T',
    Cross: 'X',
    Circle: 'C',
    Square: 'S',
    Start: 'A',
    Pause: 'P'
};

/**
 * Manage communication with a Mieo peripheral over a OpenBlock Link client socket.
 */
class OpenBlockMieoDevice {
    /**
     * Construct a Mieo communication object.
     * @param {Runtime} runtime - the OpenBlock runtime
     * @param {string} originalDeviceId - the original id of the peripheral, like xxx_mieo
     */
    constructor (runtime, originalDeviceId) {
        this.runtime = runtime;

        // Create Arduino peripheral for code upload
        this._peripheral = new ArduinoPeripheral(runtime, this.DEVICE_ID, originalDeviceId, PNPID_LIST, SERIAL_CONFIG, DIVECE_OPT);

        // Initialize pin state
        this._pinState = {};
        Object.keys(Pins).forEach(pin => {
            this._pinState[Pins[pin]] = 0;
        });

        // Bind block handler methods to preserve 'this' context
        this.event_whenmieostartsup = this.event_whenmieostartsup.bind(this);
        this.mieo_setDigitalOutput = this.mieo_setDigitalOutput.bind(this);
        this.mieo_setDigitalPinHighLow = this.mieo_setDigitalPinHighLow.bind(this);
        this.mieo_readDigitalPin = this.mieo_readDigitalPin.bind(this);
        this.mieo_readDigitalPinBoolean = this.mieo_readDigitalPinBoolean.bind(this);
        this.mieo_readAnalogSensorString = this.mieo_readAnalogSensorString.bind(this);
        this.mieo_readAnalogPin = this.mieo_readAnalogPin.bind(this);
        this.mieo_setPwmOutput = this.mieo_setPwmOutput.bind(this);
        this.mieo_setServoOutput = this.mieo_setServoOutput.bind(this);
        this.mieo_showEmotion = this.mieo_showEmotion.bind(this);
        this.mieo_displayText = this.mieo_displayText.bind(this);
        this.mieo_clearDisplay = this.mieo_clearDisplay.bind(this);
        this.mieo_runRobot = this.mieo_runRobot.bind(this);
        this.mieo_goForwardFor1s = this.mieo_goForwardFor1s.bind(this);
        this.mieo_setOrientation = this.mieo_setOrientation.bind(this);
        this.mieo_stopRobot = this.mieo_stopRobot.bind(this);
        this.mieo_isButtonPressed = this.mieo_isButtonPressed.bind(this);
        this.mieo_isTouchPadPressed = this.mieo_isTouchPadPressed.bind(this);
        this.mieo_isInfraredActive = this.mieo_isInfraredActive.bind(this);
        this.mieo_setInfraredThreshold = this.mieo_setInfraredThreshold.bind(this);
        this.mieo_getInfraredValue = this.mieo_getInfraredValue.bind(this);
        this.mieo_runMotor = this.mieo_runMotor.bind(this);
        this.mieo_setServoAngle = this.mieo_setServoAngle.bind(this);
        this.mieo_setLineThresholds = this.mieo_setLineThresholds.bind(this);
        this.mieo_followLine = this.mieo_followLine.bind(this);
        this.mieo_isOnTrack = this.mieo_isOnTrack.bind(this);
        this.mieo_connectUltrasonic = this.mieo_connectUltrasonic.bind(this);
        this.mieo_getUltrasonicDistance = this.mieo_getUltrasonicDistance.bind(this);
        this.mieo_playMusic = this.mieo_playMusic.bind(this);
        this.mieo_playTone = this.mieo_playTone.bind(this);
        this.mieo_buzzStop = this.mieo_buzzStop.bind(this);
        this.mieo_setupBluetooth = this.mieo_setupBluetooth.bind(this);
        this.mieo_toggleSwitch = this.mieo_toggleSwitch.bind(this);
        this.mieo_isBtButton = this.mieo_isBtButton.bind(this);
        this.mieo_putToTerminal = this.mieo_putToTerminal.bind(this);
        this.mieo_enableSerial = this.mieo_enableSerial.bind(this);
        this.mieo_writeSerial = this.mieo_writeSerial.bind(this);
        this.mieo_byteAvailable = this.mieo_byteAvailable.bind(this);
        this.mieo_readAsString = this.mieo_readAsString.bind(this);
        this.mieo_readAsNumber = this.mieo_readAsNumber.bind(this);
    }

    /**
     * @return {string} - the ID of this extension.
     */
    get DEVICE_ID () {
        return 'mieo';
    }

    /**
     * Called by the runtime when user wants to upload code to a peripheral.
     * @param {string} code - the code want to upload.
     */
    upload (code) {
        return this._peripheral.upload(code);
    }

    /**
     * Called by the runtime when user wants to program mode.
     * @param {string} mode - the program mode.
     */
    setProgramMode (mode) {
        return this._peripheral.setProgramMode(mode);
    }

    /**
     * Generate pins menu.
     * @return {Array} - the menu array.
     */
    get PINS_MENU () {
        return [
            { text: '0', value: Pins.D0 },
            { text: '1', value: Pins.D1 },
            { text: '2', value: Pins.D2 },
            { text: '3', value: Pins.D3 },
            { text: '4', value: Pins.D4 },
            { text: '5', value: Pins.D5 },
            { text: '6', value: Pins.D6 },
            { text: '7', value: Pins.D7 },
            { text: '8', value: Pins.D8 },
            { text: '9', value: Pins.D9 },
            { text: '10', value: Pins.D10 },
            { text: '11', value: Pins.D11 },
            { text: '12', value: Pins.D12 },
            { text: '13', value: Pins.D13 },
            { text: 'A0', value: Pins.A0 },
            { text: 'A1', value: Pins.A1 },
            { text: 'A2', value: Pins.A2 },
            { text: 'A3', value: Pins.A3 },
            { text: 'A4', value: Pins.A4 },
            { text: 'A5', value: Pins.A5 }
        ];
    }

    /**
     * Generate analog pins menu.
     * @return {Array} - the menu array.
     */
    get ANALOG_PINS_MENU () {
        return [
            { text: 'A0', value: Pins.A0 },
            { text: 'A1', value: Pins.A1 },
            { text: 'A2', value: Pins.A2 },
            { text: 'A3', value: Pins.A3 },
            { text: 'A4', value: Pins.A4 },
            { text: 'A5', value: Pins.A5 }
        ];
    }

    /**
     * Generate pwm pins menu.
     * @return {Array} - the menu array.
     */
    get PWM_PINS_MENU () {
        return [
            { text: '3', value: Pins.D3 },
            { text: '5', value: Pins.D5 },
            { text: '6', value: Pins.D6 },
            { text: '9', value: Pins.D9 },
            { text: '10', value: Pins.D10 },
            { text: '11', value: Pins.D11 }
        ];
    }

    /**
     * Generate level menu.
     * @return {Array} - the menu array.
     */
    get LEVEL_MENU () {
        return [
            { text: 'high', value: Level.High },
            { text: 'low', value: Level.Low }
        ];
    }

    /**
     * Generate emoji menu.
     * @return {Array} - the menu array.
     */
    get EMOJI_MENU () {
        return [
            { text: 'smile', value: 'EMOJI_SMILE' },
            { text: 'sad', value: 'EMOJI_SAD' },
            { text: 'angry', value: 'EMOJI_ANGRY' },
            { text: 'cry', value: 'EMOJI_CRY' },
            { text: 'heart', value: 'EMOJI_HEART' },
            { text: 'nerd', value: 'EMOJI_NERD' },
            { text: 'surprise', value: 'EMOJI_SURPRISE' },
            { text: 'think', value: 'EMOJI_THINK' },
            { text: 'dude', value: 'EMOJI_DUDE' }
        ];
    }

    /**
     * Generate speed menu.
     * @return {Array} - the menu array.
     */
    get SPEED_MENU () {
        return [
            { text: 'fast', value: '125' },
            { text: 'medium', value: '200' },
            { text: 'slow', value: '300' }
        ];
    }

    /**
     * Generate direction menu.
     * @return {Array} - the menu array.
     */
    get DIRECTION_MENU () {
        return [
            { text: 'forward', value: Direction.Forward },
            { text: 'backward', value: Direction.Backward },
            { text: 'left', value: Direction.Left },
            { text: 'right', value: Direction.Right }
        ];
    }

    /**
     * Generate button menu.
     * @return {Array} - the menu array.
     */
    get BUTTON_MENU () {
        return [
            { text: 'R', value: '7' },
            { text: 'L', value: '8' }
        ];
    }

    /**
     * Generate touchpad menu.
     * @return {Array} - the menu array.
     */
    get TOUCHPAD_MENU () {
        return [
            { text: 'T1', value: TouchPadChannel.T1 },
            { text: 'T2', value: TouchPadChannel.T2 }
        ];
    }

    /**
     * Generate infrared menu.
     * @return {Array} - the menu array.
     */
    get INFRARED_MENU () {
        return [
            { text: 'IR-L', value: InfraredSensor.Left },
            { text: 'IR-R', value: InfraredSensor.Right }
        ];
    }

    /**
     * Generate motor side menu.
     * @return {Array} - the menu array.
     */
    get MOTOR_SIDE_MENU () {
        return [
            { text: 'left', value: MotorSide.Left },
            { text: 'right', value: MotorSide.Right }
        ];
    }

    /**
     * Generate motor direction menu.
     * @return {Array} - the menu array.
     */
    get MOTOR_DIR_MENU () {
        return [
            { text: 'forward', value: Direction.Forward },
            { text: 'backward', value: Direction.Backward }
        ];
    }

    /**
     * Generate ultrasonic menu.
     * @return {Array} - the menu array.
     */
    get ULTRASONIC_MENU () {
        return [
            { text: '1', value: UltrasonicPort.Port1 },
            { text: '2', value: UltrasonicPort.Port2 }
        ];
    }

    /**
     * Generate ultrasonic pin menu.
     * @return {Array} - the menu array.
     */
    get ULTRASONIC_PINS_MENU () {
        return [
            { text: 'D1', value: Pins.A5 },
            { text: 'D2', value: Pins.A4 },
            { text: 'A1', value: Pins.A0 },
            { text: 'A2', value: Pins.A1 }
        ];
    }

    /**
     * Generate buzzer song menu.
     * @return {Array} - the menu array.
     */
    get BUZZER_SONG_MENU () {
        return [
            { text: 'happy birthday', value: BuzzerSong.HappyBirthday },
            { text: 'jingle bells', value: BuzzerSong.JingleBells },
            { text: 'we wish you', value: BuzzerSong.WeWishYou },
            { text: 'twinkle twinkle', value: BuzzerSong.TwinkleTwinkle },
            { text: 'ode to joy', value: BuzzerSong.OdeToJoy },
            { text: 'mary had a little lamb', value: BuzzerSong.MaryHadALittleLamb },
            { text: 'startup', value: BuzzerSong.Startup },
            { text: 'error', value: BuzzerSong.Error }
        ];
    }

    /**
     * Generate buzzer note menu.
     * @return {Array} - the menu array.
     */
    get BUZZER_NOTE_MENU () {
        return [
            { text: 'C4', value: BuzzerNote.C4 },
            { text: 'D4', value: BuzzerNote.D4 },
            { text: 'E4', value: BuzzerNote.E4 },
            { text: 'F4', value: BuzzerNote.F4 },
            { text: 'G4', value: BuzzerNote.G4 },
            { text: 'A4', value: BuzzerNote.A4 },
            { text: 'B4', value: BuzzerNote.B4 },
            { text: 'C5', value: BuzzerNote.C5 },
            { text: 'D5', value: BuzzerNote.D5 },
            { text: 'E5', value: BuzzerNote.E5 },
            { text: 'F5', value: BuzzerNote.F5 },
            { text: 'G5', value: BuzzerNote.G5 },
            { text: 'A5', value: BuzzerNote.A5 },
            { text: 'B5', value: BuzzerNote.B5 },
            { text: 'C6', value: BuzzerNote.C6 },
            { text: 'D6', value: BuzzerNote.D6 },
            { text: 'E6', value: BuzzerNote.E6 },
            { text: 'F6', value: BuzzerNote.F6 },
            { text: 'G6', value: BuzzerNote.G6 },
            { text: 'A6', value: BuzzerNote.A6 },
            { text: 'B6', value: BuzzerNote.B6 },
            { text: 'C7', value: BuzzerNote.C7 },
            { text: 'D7', value: BuzzerNote.D7 },
            { text: 'E7', value: BuzzerNote.E7 },
            { text: 'F7', value: BuzzerNote.F7 },
            { text: 'G7', value: BuzzerNote.G7 },
            { text: 'A7', value: BuzzerNote.A7 },
            { text: 'B7', value: BuzzerNote.B7 }
        ];
    }

    /**
     * Generate buzzer duration menu.
     * @return {Array} - the menu array.
     */
    get BUZZER_DURATION_MENU () {
        return [
            { text: 'whole', value: BuzzerDuration.Whole },
            { text: 'half', value: BuzzerDuration.Half },
            { text: 'quarter', value: BuzzerDuration.Quarter },
            { text: 'eighth', value: BuzzerDuration.Eighth },
            { text: 'sixteenth', value: BuzzerDuration.Sixteenth }
        ];
    }

    /**
     * Generate toggle state menu.
     * @return {Array} - the menu array.
     */
    get TOGGLE_STATE_MENU () {
        return [
            { text: 'on', value: ToggleState.On },
            { text: 'off', value: ToggleState.Off }
        ];
    }

    /**
     * Generate bluetooth button menu.
     * @return {Array} - the menu array.
     */
    get BLUETOOTH_BUTTON_MENU () {
        return [
            { text: 'up', value: BluetoothButton.Up },
            { text: 'down', value: BluetoothButton.Down },
            { text: 'right', value: BluetoothButton.Right },
            { text: 'left', value: BluetoothButton.Left },
            { text: 'triangle', value: BluetoothButton.Triangle },
            { text: 'cross', value: BluetoothButton.Cross },
            { text: 'circle', value: BluetoothButton.Circle },
            { text: 'square', value: BluetoothButton.Square },
            { text: 'start', value: BluetoothButton.Start },
            { text: 'pause', value: BluetoothButton.Pause }
        ];
    }

    /**
     * Generate servo menu.
     * @return {Array} - the menu array.
     */
    get SERVO_MENU () {
        return [
            { text: 'servo 1', value: ServoPort.Servo1 },
            { text: 'servo 2', value: ServoPort.Servo2 }
        ];
    }

    /**
     * Generate orientation menu.
     * @return {Array} - the menu array.
     */
    get ORIENTATION_MENU () {
        return [
            { text: 'horizontal', value: Orientation.Horizontal },
            { text: 'vertical', value: Orientation.Vertical }
        ];
    }

    /**
     * Generate baud rate menu.
     * @return {Array} - the menu array.
     */
    get BAUD_RATE_MENU () {
        return [
            { text: '4800', value: Buadrate.B4800 },
            { text: '9600', value: Buadrate.B9600 },
            { text: '19200', value: Buadrate.B19200 },
            { text: '38400', value: Buadrate.B38400 },
            { text: '57600', value: Buadrate.B57600 },
            { text: '76800', value: Buadrate.B76800 },
            { text: '115200', value: Buadrate.B115200 }
        ];
    }

    /**
     * Generate serial end-of-line menu.
     * @return {Array} - the menu array.
     */
    get SERIAL_EOL_MENU () {
        return [
            { text: 'new line', value: Eol.Warp },
            { text: 'inline', value: Eol.NoWarp }
        ];
    }

    /**
     * Digital pin menu for boolean read (mapped to Arduino analog pins).
     * @return {Array} - the menu array.
     */
    get BOOL_DIGITAL_PINS_MENU () {
        return [
            { text: 'D1', value: 'A5' },
            { text: 'D2', value: 'A4' },
            { text: 'A1', value: 'A0' },
            { text: 'A2', value: 'A1' }
        ];
    }

    /**
     * Get info of the peripheral.
     * @return {Array} - array of category objects with blocks.
     */
    getInfo () {
        return [
            {
                id: 'mieo',
                name: 'Mieo',
                color1: '#F9A320',
                color2: '#F9A320',
                color3: '#F9A320',

                blocks: [
                    {
                        opcode: 'event_whenmieostartsup',
                        blockType: BlockType.HAT,
                        text: 'Mieo start up',
                        arguments: {}
                    },
                    {
                        opcode: 'mieo_readDigitalPinBoolean',
                        blockType: BlockType.BOOLEAN,
                        text: 'read digital pin [PIN]',
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'boolDigitalPins',
                                defaultValue: 'A5'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_setDigitalPinHighLow',
                        blockType: BlockType.COMMAND,
                        text: 'set digital pin [PIN] to [LEVEL]',
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'boolDigitalPins',
                                defaultValue: 'A5'
                            },
                            LEVEL: {
                                type: ArgumentType.STRING,
                                menu: 'level',
                                defaultValue: 'HIGH'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_readAnalogSensorString',
                        blockType: BlockType.REPORTER,
                        text: 'read analog sensor [PIN]',
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'boolDigitalPins',
                                defaultValue: 'A5'
                            }
                        }
                    }
                ],
                menus: {
                    pins: {
                        items: this.PINS_MENU
                    },
                    analogPins: {
                        items: this.ANALOG_PINS_MENU
                    },
                    pwmPins: {
                        items: this.PWM_PINS_MENU
                    },
                    level: {
                        items: this.LEVEL_MENU
                    },
                    boolDigitalPins: {
                        items: this.BOOL_DIGITAL_PINS_MENU
                    },
                    emoji: {
                        items: this.EMOJI_MENU
                    },
                    speed: {
                        items: this.SPEED_MENU
                    },
                    direction: {
                        items: this.DIRECTION_MENU
                    },
                    orientation: {
                        items: this.ORIENTATION_MENU
                    }
                }
            },
            {
                id: 'mieodisplay',
                name: 'Display',
                color1: '#4CBFE6',
                color2: '#2E8EB8',
                color3: '#2E8EB8',
                blocks: [
                    {
                        opcode: 'mieo_showEmotionFixed',
                        blockType: BlockType.COMMAND,
                        text: 'show [EMOJI]',
                        arguments: {
                            EMOJI: {
                                type: ArgumentType.STRING,
                                menu: 'emoji',
                                defaultValue: 'EMOJI_SMILE'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_showEmotion',
                        blockType: BlockType.COMMAND,
                        text: 'show [EMOJI] color R [R] G [G] B [B]',
                        arguments: {
                            EMOJI: {
                                type: ArgumentType.STRING,
                                menu: 'emoji',
                                defaultValue: 'EMOJI_SMILE'
                            },
                            R: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 150
                            },
                            G: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 100
                            },
                            B: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 0
                            }
                        }
                    },
                    {
                        opcode: 'mieo_showNumberColor',
                        blockType: BlockType.COMMAND,
                        text: 'show number [NUMBER] color R [R] G [G] B [B]',
                        arguments: {
                            NUMBER: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 0
                            },
                            R: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 255
                            },
                            G: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 0
                            },
                            B: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 0
                            }
                        }
                    },
                    {
                        opcode: 'mieo_displayText',
                        blockType: BlockType.COMMAND,
                        text: 'show [TEXT] color R [R] G [G] B [B] speed [SPEED]',
                        arguments: {
                            TEXT: {
                                type: ArgumentType.STRING,
                                defaultValue: 'hi'
                            },
                            R: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 75
                            },
                            G: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 75
                            },
                            B: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 75
                            },
                            SPEED: {
                               type: ArgumentType.STRING,
                                menu: 'speed',
                                defaultValue: '200'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_clearDisplay',
                        blockType: BlockType.COMMAND,
                        text: 'clear display',
                        arguments: {}
                    }
                ],
                menus: {
                    emoji: {
                        items: this.EMOJI_MENU
                    },
                    speed: {
                        items: this.SPEED_MENU
                    }
                }
            },
            {
                id: 'mieosens',
                name: 'Sens',
                color1: '#4CAF50',
                color2: '#45A049',
                color3: '#45A049',
                blocks: [
                    {
                        opcode: 'mieo_isButtonPressed',
                        blockType: BlockType.BOOLEAN,
                        text: 'is button [BUTTON] pressed',
                        arguments: {
                            BUTTON: {
                                type: ArgumentType.STRING,
                                menu: 'button',
                                defaultValue: '7'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_isTouchPadPressed',
                        blockType: BlockType.BOOLEAN,
                        text: 'is touch [TOUCH] pressed',
                        arguments: {
                            TOUCH: {
                                type: ArgumentType.STRING,
                                menu: 'touchpad',
                                defaultValue: TouchPadChannel.T1
                            }
                        }
                    },
                    {
                        opcode: 'mieo_isInfraredActive',
                        blockType: BlockType.BOOLEAN,
                        text: 'is [IR] active',
                        arguments: {
                            IR: {
                                type: ArgumentType.STRING,
                                menu: 'infrared',
                                defaultValue: InfraredSensor.Left
                            }
                        }
                    },
                    {
                        opcode: 'mieo_setInfraredThreshold',
                        blockType: BlockType.COMMAND,
                        text: 'set [IR] threshold [THRESHOLD]',
                        arguments: {
                            IR: {
                                type: ArgumentType.STRING,
                                menu: 'infrared',
                                defaultValue: InfraredSensor.Left
                            },
                            THRESHOLD: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 512
                            }
                        }
                    },
                    {
                        opcode: 'mieo_getInfraredValue',
                        blockType: BlockType.REPORTER,
                        text: 'get [IR] value',
                        arguments: {
                            IR: {
                                type: ArgumentType.STRING,
                                menu: 'infrared',
                                defaultValue: InfraredSensor.Left
                            }
                        }
                    }
                ],
                menus: {
                    button: {
                        items: this.BUTTON_MENU
                    },
                    touchpad: {
                        items: this.TOUCHPAD_MENU
                    },
                    infrared: {
                        items: this.INFRARED_MENU
                    }
                }
            },
            {
                id: 'mieobuzz',
                name: 'Buzz',
                color1: '#9C27B0',
                color2: '#7B1FA2',
                color3: '#7B1FA2',
                blocks: [
                    {
                        opcode: 'mieo_playMusic',
                        blockType: BlockType.COMMAND,
                        text: 'play music [SONG]',
                        arguments: {
                            SONG: {
                                type: ArgumentType.STRING,
                                menu: 'buzzerSong',
                                defaultValue: BuzzerSong.HappyBirthday
                            }
                        }
                    },
                    {
                        opcode: 'mieo_playTone',
                        blockType: BlockType.COMMAND,
                        text: 'play tone [NOTE] duration [DURATION]',
                        arguments: {
                            NOTE: {
                                type: ArgumentType.STRING,
                                menu: 'buzzerNote',
                                defaultValue: BuzzerNote.C4
                            },
                            DURATION: {
                                type: ArgumentType.STRING,
                                menu: 'buzzerDuration',
                                defaultValue: BuzzerDuration.Half
                            }
                        }
                    },
                    {
                        opcode: 'mieo_buzzStop',
                        blockType: BlockType.COMMAND,
                        text: 'buzz stop',
                        arguments: {}
                    }
                ],
                menus: {
                    buzzerSong: {
                        items: this.BUZZER_SONG_MENU
                    },
                    buzzerNote: {
                        items: this.BUZZER_NOTE_MENU
                    },
                    buzzerDuration: {
                        items: this.BUZZER_DURATION_MENU
                    }
                }
            },
            {
                id: 'mieomotor',
                name: 'Motor',
                color1: '#E91E63',
                color2: '#C2185B',
                color3: '#C2185B',
                blocks: [
                    {
                        opcode: 'mieo_runMotor',
                        blockType: BlockType.COMMAND,
                        text: 'run [SIDE] motor [DIR] at speed [SPEED]',
                        arguments: {
                            SIDE: {
                                type: ArgumentType.STRING,
                                menu: 'motorSide',
                                defaultValue: MotorSide.Left
                            },
                            DIR: {
                                type: ArgumentType.STRING,
                                menu: 'motorDir',
                                defaultValue: Direction.Forward
                            },
                            SPEED: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 100
                            }
                        }
                    },
                    {
                        opcode: 'mieo_stopMotor',
                        blockType: BlockType.COMMAND,
                        text: 'stop [SIDE] motor',
                        arguments: {
                            SIDE: {
                                type: ArgumentType.STRING,
                                menu: 'motorSide',
                                defaultValue: MotorSide.Left
                            }
                        }
                    },
                    {
                        opcode: 'mieo_setServoAngle',
                        blockType: BlockType.COMMAND,
                        text: 'set [SERVO] angle [ANGLE]',
                        arguments: {
                            SERVO: {
                                type: ArgumentType.STRING,
                                menu: 'servo',
                                defaultValue: ServoPort.Servo1
                            },
                            ANGLE: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 90
                            }
                        }
                    }
                ],
                menus: {
                    motorSide: {
                        items: this.MOTOR_SIDE_MENU
                    },
                    motorDir: {
                        items: this.MOTOR_DIR_MENU
                    },
                    servo: {
                        items: this.SERVO_MENU
                    }
                }
            },
            {
                id: 'mieorobo',
                name: 'Robo',
                color1: '#009688',
                color2: '#00796B',
                color3: '#00796B',
                blocks: [
                    {
                        opcode: 'mieo_runRobot',
                        blockType: BlockType.COMMAND,
                        text: 'go [DIR] speed [SPEED]',
                        arguments: {
                            DIR: {
                                type: ArgumentType.STRING,
                                menu: 'direction',
                                defaultValue: Direction.Forward
                            },
                            SPEED: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 100
                            }
                        }
                    },
                    {
                        opcode: 'mieo_goForwardFor1s',
                        blockType: BlockType.COMMAND,
                        text: 'go [DIR] speed [SPEED] for [DELAY] sec',
                        arguments: {
                            DIR: {
                                type: ArgumentType.STRING,
                                menu: 'direction',
                                defaultValue: Direction.Forward
                            },
                            SPEED: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 100
                            },
                            DELAY: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 1
                            }
                        }
                    },
                    {
                        opcode: 'mieo_stopRobot',
                        blockType: BlockType.COMMAND,
                        text: 'stop mieo',
                        arguments: {}
                    },
                    {
                        opcode: 'mieo_setOrientation',
                        blockType: BlockType.COMMAND,
                        text: 'set mieo orientation [ORIENTATION]',
                        arguments: {
                            ORIENTATION: {
                                type: ArgumentType.STRING,
                                menu: 'orientation',
                                defaultValue: Orientation.Horizontal
                            }
                        }
                    }
                ],
                menus: {
                    direction: {
                        items: this.DIRECTION_MENU
                    },
                    orientation: {
                        items: this.ORIENTATION_MENU
                    }
                }
            },
            {
                id: 'mieoline',
                name: 'Line Following',
                color1: '#3F51B5',
                color2: '#303F9F',
                color3: '#303F9F',
                blocks: [
                    {
                        opcode: 'mieo_setLineThresholds',
                        blockType: BlockType.COMMAND,
                        text: 'set ir threshold L [LEFT] R [RIGHT]',
                        arguments: {
                            LEFT: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 512
                            },
                            RIGHT: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 512
                            }
                        }
                    },
                    {
                        opcode: 'mieo_followLine',
                        blockType: BlockType.COMMAND,
                        text: 'line follow',
                        arguments: {}
                    },
                    {
                        opcode: 'mieo_isOnTrack',
                        blockType: BlockType.BOOLEAN,
                        text: 'mieo on track',
                        arguments: {}
                    }
                ],
                menus: {}
            },
            {
                id: 'mieoultrasonic',
                name: 'Ultrasonic',
                color1: '#00BCD4',
                color2: '#0097A7',
                color3: '#0097A7',
                blocks: [
                    {
                        opcode: 'mieo_connectUltrasonic',
                        blockType: BlockType.COMMAND,
                        text: 'connect ultrasonic [ULTRA] trig [TRIG] echo [ECHO]',
                        arguments: {
                            ULTRA: {
                                type: ArgumentType.STRING,
                                menu: 'ultrasonic',
                                defaultValue: UltrasonicPort.Port1
                            },
                            TRIG: {
                                type: ArgumentType.STRING,
                                menu: 'ultrasonicPins',
                                defaultValue: Pins.D1
                            },
                            ECHO: {
                                type: ArgumentType.STRING,
                                menu: 'ultrasonicPins',
                                defaultValue: Pins.D2
                            }
                        }
                    },
                    {
                        opcode: 'mieo_getUltrasonicDistance',
                        blockType: BlockType.REPORTER,
                        text: 'get ultrasonic [ULTRA] distance (cm)',
                        arguments: {
                            ULTRA: {
                                type: ArgumentType.STRING,
                                menu: 'ultrasonic',
                                defaultValue: UltrasonicPort.Port1
                            }
                        }
                    }
                ],
                menus: {
                    ultrasonic: {
                        items: this.ULTRASONIC_MENU
                    },
                    ultrasonicPins: {
                        items: this.ULTRASONIC_PINS_MENU
                    }
                }
            },
            {
                id: 'mieoappcontrols',
                name: 'App Controls',
                color1: '#FFC107',
                color2: '#FFA000',
                color3: '#FFA000',
                blocks: [
                    {
                        opcode: 'mieo_setupBluetooth',
                        blockType: BlockType.COMMAND,
                        text: 'set up bluetooth',
                        arguments: {}
                    },
                    {
                        opcode: 'mieo_refreshBluetooth',
                        blockType: BlockType.COMMAND,
                        text: 'refresh bluetooth',
                        arguments: {}
                    },
                    {
                        opcode: 'mieo_toggleSwitch',
                        blockType: BlockType.BOOLEAN,
                        text: 'toggle switch [STATE]',
                        arguments: {
                            STATE: {
                                type: ArgumentType.STRING,
                                menu: 'toggleState',
                                defaultValue: ToggleState.On
                            }
                        }
                    },
                    {
                        opcode: 'mieo_isBtButton',
                        blockType: BlockType.BOOLEAN,
                        text: 'is [BUTTON] pressed',
                        arguments: {
                            BUTTON: {
                                type: ArgumentType.STRING,
                                menu: 'bluetoothButton',
                                defaultValue: BluetoothButton.Up
                            }
                        }
                    },
                    {
                        opcode: 'mieo_btStringEquals',
                        blockType: BlockType.BOOLEAN,
                        text: 'if terminal data is [TEXT]',
                        arguments: {
                            TEXT: {
                                type: ArgumentType.STRING,
                                defaultValue: 'hi'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_putToTerminal',
                        blockType: BlockType.COMMAND,
                        text: 'put [TEXT] to terminal',
                        arguments: {
                            TEXT: {
                                type: ArgumentType.STRING,
                                defaultValue: 'hello'
                            }
                        }
                    }
                ],
                menus: {
                    toggleState: {
                        items: this.TOGGLE_STATE_MENU
                    },
                    bluetoothButton: {
                        items: this.BLUETOOTH_BUTTON_MENU
                    }
                }
            },
            {
                id: 'mieoSerial',
                name: 'Serial',
                color1: '#795548',
                color2: '#5D4037',
                color3: '#5D4037',
                blocks: [
                    {
                        opcode: 'mieo_enableSerial',
                        blockType: BlockType.COMMAND,
                        text: 'enable serial baud [BAUD]',
                        arguments: {
                            BAUD: {
                                type: ArgumentType.STRING,
                                menu: 'baudRate',
                                defaultValue: Buadrate.B9600
                            }
                        }
                    },
                    {
                        opcode: 'mieo_writeSerial',
                        blockType: BlockType.COMMAND,
                        text: 'write [VALUE] serial [EOL]',
                        arguments: {
                            VALUE: {
                                type: ArgumentType.STRING,
                                defaultValue: 'hello'
                            },
                            EOL: {
                                type: ArgumentType.STRING,
                                menu: 'serialEol',
                                defaultValue: Eol.Warp
                            }
                        }
                    },
                    {
                        opcode: 'mieo_byteAvailable',
                        blockType: BlockType.BOOLEAN,
                        text: 'byte available',
                        arguments: {}
                    },
                    {
                        opcode: 'mieo_readAsString',
                        blockType: BlockType.REPORTER,
                        text: 'read as string',
                        arguments: {}
                    },
                    {
                        opcode: 'mieo_readAsNumber',
                        blockType: BlockType.REPORTER,
                        text: 'read as number',
                        arguments: {}
                    }
                ],
                menus: {
                    baudRate: {
                        items: this.BAUD_RATE_MENU
                    },
                    serialEol: {
                        items: this.SERIAL_EOL_MENU
                    }
                }
            }
        ];
    }

    /**
     * Set pin digital output.
     */
    mieo_setDigitalOutput (args) {
        this._peripheral.setDigitalOutput(args.PIN, args.LEVEL);
        return Promise.resolve();
    }

    /**
     * Set digital pin HIGH/LOW.
     */
    mieo_setDigitalPinHighLow (args) {
        this._peripheral.setDigitalOutput(args.PIN, args.LEVEL);
        return Promise.resolve();
    }

    /**
     * Read pin digital level.
     */
    mieo_readDigitalPin (args) {
        return this._peripheral.readDigitalPin(args.PIN);
    }

    /**
     * Read digital pin as boolean.
     */
    mieo_readDigitalPinBoolean (args) {
        return this._peripheral.readDigitalPin(args.PIN);
    }

    /**
     * Read analog sensor and return as string.
     */
    mieo_readAnalogSensorString (args) {
        return this._peripheral.readAnalogPin(args.PIN);
    }

    /**
     * Read analog pin.
     */
    mieo_readAnalogPin (args) {
        return this._peripheral.readAnalogPin(args.PIN);
    }

    /**
     * Set pin pwm output.
     */
    mieo_setPwmOutput (args) {
        this._peripheral.setPwmOutput(args.PIN, args.OUT);
        return Promise.resolve();
    }

    /**
     * Show emotion on Mieo LED matrix (Arduino mode only).
     */
    mieo_showEmotion () {
        return Promise.resolve();
    }

    /**
     * Show emotion on Mieo LED matrix with default color mapping (Arduino mode only).
     */
    mieo_showEmotionFixed () {
        return Promise.resolve();
    }

    /**
     * Display text on Mieo LED matrix (Arduino mode only).
     */
    mieo_displayText () {
        return Promise.resolve();
    }

    /**
     * Clear Mieo LED matrix (Arduino mode only).
     */
    mieo_clearDisplay () {
        return Promise.resolve();
    }

    /**
     * Display number on Mieo LED matrix with default red color (Arduino mode only).
     */
    mieo_showNumber () {
        return Promise.resolve();
    }

    /**
     * Display number on Mieo LED matrix with color (Arduino mode only).
     */
    mieo_showNumberColor () {
        return Promise.resolve();
    }

    /**
     * Set servo output.
     */
    mieo_setServoOutput (args) {
        this._peripheral.setServoOutput(args.PIN, args.OUT);
        return Promise.resolve();
    }

    /**
     * Run robot movement (Arduino mode only).
     */
    mieo_runRobot () {
        return Promise.resolve();
    }

    /**
     * Go forward with speed for 1 second (Arduino mode only).
     */
    mieo_goForwardFor1s () {
        return Promise.resolve();
    }

    /**
     * Set Mieo orientation (Arduino mode only).
     */
    mieo_setOrientation () {
        return Promise.resolve();
    }

    /**
     * Stop robot (Arduino mode only).
     */
    mieo_stopRobot () {
        return Promise.resolve();
    }

    /**
     * Button pressed state (Arduino mode only).
     */
    mieo_isButtonPressed () {
        return Promise.resolve(false);
    }

    /**
     * Touch pad pressed state (Arduino mode only).
     */
    mieo_isTouchPadPressed () {
        return Promise.resolve(false);
    }

    /**
     * Infrared sensor active (Arduino mode only).
     */
    mieo_isInfraredActive () {
        return Promise.resolve(false);
    }

    /**
     * Set infrared sensor threshold (Arduino mode only).
     */
    mieo_setInfraredThreshold () {
        return Promise.resolve();
    }

    /**
     * Get infrared sensor value (Arduino mode only).
     */
    mieo_getInfraredValue () {
        return Promise.resolve(0);
    }

    /**
     * Run single motor (Arduino mode only).
     */
    mieo_runMotor () {
        return Promise.resolve();
    }

    /**
     * Stop single motor (Arduino mode only).
     */
    mieo_stopMotor () {
        return Promise.resolve();
    }

    /**
     * Set servo angle (Arduino mode only).
     */
    mieo_setServoAngle () {
        return Promise.resolve();
    }

    /**
     * Set line follower thresholds (Arduino mode only).
     */
    mieo_setLineThresholds () {
        return Promise.resolve();
    }

    /**
     * Follow line (Arduino mode only).
     */
    mieo_followLine () {
        return Promise.resolve();
    }

    /**
     * On track (Arduino mode only).
     */
    mieo_isOnTrack () {
        return Promise.resolve(false);
    }

    /**
     * Connect ultrasonic sensor (Arduino mode only).
     */
    mieo_connectUltrasonic () {
        return Promise.resolve();
    }

    /**
     * Get ultrasonic distance (Arduino mode only).
     */
    mieo_getUltrasonicDistance () {
        return Promise.resolve(0);
    }

    /**
     * Play buzzer music (Arduino mode only).
     */
    mieo_playMusic () {
        return Promise.resolve();
    }

    /**
     * Play buzzer tone (Arduino mode only).
     */
    mieo_playTone () {
        return Promise.resolve();
    }

    /**
     * Stop buzzer (Arduino mode only).
     */
    mieo_buzzStop () {
        return Promise.resolve();
    }

    /**
     * Set up bluetooth (Arduino mode only).
     */
    mieo_setupBluetooth () {
        return Promise.resolve();
    }

    /**
     * Refresh bluetooth (Arduino mode only).
     */
    mieo_refreshBluetooth () {
        return Promise.resolve();
    }

    /**
     * Toggle switch state (Arduino mode only).
     */
    mieo_toggleSwitch () {
        return Promise.resolve(false);
    }

    /**
     * Bluetooth button pressed (Arduino mode only).
     */
    mieo_isBtButton () {
        return Promise.resolve(false);
    }

    /**
     * Bluetooth string equals (Arduino mode only).
     */
    mieo_btStringEquals () {
        return Promise.resolve(false);
    }

    /**
     * Put text to bluetooth terminal (Arduino mode only).
     */
    mieo_putToTerminal () {
        return Promise.resolve();
    }

    /**
     * Enable serial (Arduino mode only).
     */
    mieo_enableSerial () {
        return Promise.resolve();
    }

    /**
     * Write serial (Arduino mode only).
     */
    mieo_writeSerial () {
        return Promise.resolve();
    }

    /**
     * Byte available (Arduino mode only).
     */
    mieo_byteAvailable () {
        return Promise.resolve(false);
    }

    /**
     * Read as string (Arduino mode only).
     */
    mieo_readAsString () {
        return Promise.resolve('');
    }

    /**
     * Read as number (Arduino mode only).
     */
    mieo_readAsNumber () {
        return Promise.resolve(0);
    }

    /**
     * When Mieo starts up - HAT block for setup code
     */
    event_whenmieostartsup () {
        return Promise.resolve();
    }
}

module.exports = OpenBlockMieoDevice;
