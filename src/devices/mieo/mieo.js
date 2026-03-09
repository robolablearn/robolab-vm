/**
 * Mieo Device
 *
 * @overview An Arduino Uno compatible custom board with MIEO-specific
 * peripherals: LED matrix display, motors, sensors, buzzer, line follower,
 * ultrasonic, bluetooth, and serial communication.
 */
const formatMessage = require('format-message');

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const ProgramModeType = require('../../extension-support/program-mode-type');

const ArduinoPeripheral = require('../common/arduino-peripheral');

const PNPID_LIST = [
    'USB\\VID_2341&PID_0043',
    'USB\\VID_2341&PID_0001',
    'USB\\VID_2A03&PID_0043',
    'USB\\VID_2341&PID_0243',
    'USB\\VID_1A86&PID_7523'
];

const SERIAL_CONFIG = {
    baudRate: 57600,
    dataBits: 8,
    stopBits: 1
};

const DIVECE_OPT = {
    type: 'arduino',
    fqbn: 'arduino:avr:uno',
    firmware: 'arduinoUno.hex'
};

const Pins = {
    D0: '0', D1: '1', D2: '2', D3: '3', D4: '4', D5: '5', D6: '6',
    D7: '7', D8: '8', D9: '9', D10: '10', D11: '11', D12: '12', D13: '13',
    A0: 'A0', A1: 'A1', A2: 'A2', A3: 'A3', A4: 'A4', A5: 'A5'
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

class MieoPeripheral extends ArduinoPeripheral {
    constructor (runtime, deviceId, originalDeviceId) {
        super(runtime, deviceId, originalDeviceId, PNPID_LIST, SERIAL_CONFIG, DIVECE_OPT);
    }
}

class OpenBlockMieoDevice {

    get DEVICE_ID () {
        return 'mieo';
    }

    constructor (runtime, originalDeviceId) {
        this.runtime = runtime;
        this._peripheral = new MieoPeripheral(this.runtime, this.DEVICE_ID, originalDeviceId);
        this._peripheral.numDigitalPins = 14;
    }

    get DIGITAL_PINS_MENU () {
        return [
            {text: '0', value: Pins.D0},
            {text: '1', value: Pins.D1},
            {text: '2', value: Pins.D2},
            {text: '3', value: Pins.D3},
            {text: '4', value: Pins.D4},
            {text: '5', value: Pins.D5},
            {text: '6', value: Pins.D6},
            {text: '7', value: Pins.D7},
            {text: '8', value: Pins.D8},
            {text: '9', value: Pins.D9},
            {text: '10', value: Pins.D10},
            {text: '11', value: Pins.D11},
            {text: '12', value: Pins.D12},
            {text: '13', value: Pins.D13},
            {text: 'A0', value: Pins.A0},
            {text: 'A1', value: Pins.A1},
            {text: 'A2', value: Pins.A2},
            {text: 'A3', value: Pins.A3},
            {text: 'A4', value: Pins.A4},
            {text: 'A5', value: Pins.A5}
        ];
    }

    get ANALOG_PINS_MENU () {
        return [
            {text: 'A0', value: Pins.A0},
            {text: 'A1', value: Pins.A1},
            {text: 'A2', value: Pins.A2},
            {text: 'A3', value: Pins.A3},
            {text: 'A4', value: Pins.A4},
            {text: 'A5', value: Pins.A5}
        ];
    }

    get PWM_PINS_MENU () {
        return [
            {text: '3', value: Pins.D3},
            {text: '5', value: Pins.D5},
            {text: '6', value: Pins.D6},
            {text: '9', value: Pins.D9},
            {text: '10', value: Pins.D10},
            {text: '11', value: Pins.D11}
        ];
    }

    get LEVEL_MENU () {
        return [
            {text: formatMessage({id: 'mieo.levelMenu.high', default: 'high'}), value: Level.High},
            {text: formatMessage({id: 'mieo.levelMenu.low', default: 'low'}), value: Level.Low}
        ];
    }

    get EMOJI_MENU () {
        return [
            {text: 'Smile', value: 'EMOJI_SMILE'},
            {text: 'Sad', value: 'EMOJI_SAD'},
            {text: 'Angry', value: 'EMOJI_ANGRY'},
            {text: 'Cry', value: 'EMOJI_CRY'},
            {text: 'Nerd', value: 'EMOJI_NERD'},
            {text: 'Surprise', value: 'EMOJI_SURPRISE'},
            {text: 'Think', value: 'EMOJI_THINK'},
            {text: 'Dude', value: 'EMOJI_DUDE'},
            {text: 'Heart', value: 'EMOJI_HEART'}
        ];
    }

    get DIRECTION_MENU () {
        return [
            {text: formatMessage({id: 'mieo.dirMenu.forward', default: 'forward'}), value: 'FORWARD'},
            {text: formatMessage({id: 'mieo.dirMenu.backward', default: 'backward'}), value: 'BACKWARD'},
            {text: formatMessage({id: 'mieo.dirMenu.left', default: 'left'}), value: 'LEFT'},
            {text: formatMessage({id: 'mieo.dirMenu.right', default: 'right'}), value: 'RIGHT'}
        ];
    }

    get MOTOR_SIDE_MENU () {
        return [
            {text: formatMessage({id: 'mieo.motorSide.left', default: 'left'}), value: 'L'},
            {text: formatMessage({id: 'mieo.motorSide.right', default: 'right'}), value: 'R'}
        ];
    }

    get MOTOR_DIR_MENU () {
        return [
            {text: formatMessage({id: 'mieo.motorDir.forward', default: 'forward'}), value: 'FORWARD'},
            {text: formatMessage({id: 'mieo.motorDir.backward', default: 'backward'}), value: 'BACKWARD'}
        ];
    }

    get BUTTON_MENU () {
        return [
            {text: 'Button 1 (D7)', value: '7'},
            {text: 'Button 2 (D8)', value: '8'}
        ];
    }

    get TOUCH_MENU () {
        return [
            {text: 'Touch 0', value: '0'},
            {text: 'Touch 1', value: '1'},
            {text: 'Touch 2', value: '2'},
            {text: 'Touch 3', value: '3'}
        ];
    }

    get IR_MENU () {
        return [
            {text: 'IR Left (A3)', value: 'A3'},
            {text: 'IR Right (A2)', value: 'A2'}
        ];
    }

    get SERVO_MENU () {
        return [
            {text: 'Servo 1 (D10)', value: '1'},
            {text: 'Servo 2 (D9)', value: '2'}
        ];
    }

    get ULTRASONIC_MENU () {
        return [
            {text: 'Ultrasonic 1', value: '1'},
            {text: 'Ultrasonic 2', value: '2'}
        ];
    }

    get SONG_MENU () {
        return [
            {text: 'Happy Birthday', value: 'HAPPY_BIRTHDAY'},
            {text: 'Jingle Bells', value: 'JINGLE_BELLS'},
            {text: 'We Wish You', value: 'WE_WISH_YOU'},
            {text: 'Twinkle Twinkle', value: 'TWINKLE_TWINKLE'},
            {text: 'Ode to Joy', value: 'ODE_TO_JOY'},
            {text: 'Mary Had a Little Lamb', value: 'MARY_HAD_A_LITTLE_LAMB'},
            {text: 'Startup', value: 'STARTUP'},
            {text: 'Error', value: 'ERROR'}
        ];
    }

    get NOTE_MENU () {
        return [
            {text: 'C4', value: 'C4'},
            {text: 'D4', value: 'D4'},
            {text: 'E4', value: 'E4'},
            {text: 'F4', value: 'F4'},
            {text: 'G4', value: 'G4'},
            {text: 'A4', value: 'A4'},
            {text: 'B4', value: 'B4'},
            {text: 'C5', value: 'C5'},
            {text: 'D5', value: 'D5'},
            {text: 'E5', value: 'E5'},
            {text: 'F5', value: 'F5'},
            {text: 'G5', value: 'G5'},
            {text: 'A5', value: 'A5'},
            {text: 'B5', value: 'B5'}
        ];
    }

    get DURATION_MENU () {
        return [
            {text: '1 beat', value: '1'},
            {text: '2 beats', value: '2'},
            {text: '4 beats', value: '4'},
            {text: '1/2 beat', value: '0.5'},
            {text: '1/4 beat', value: '0.25'}
        ];
    }

    get BT_BUTTON_MENU () {
        return [
            {text: 'Forward', value: 'F'},
            {text: 'Backward', value: 'B'},
            {text: 'Left', value: 'L'},
            {text: 'Right', value: 'R'},
            {text: 'Stop', value: 'S'}
        ];
    }

    get TOGGLE_MENU () {
        return [
            {text: 'ON', value: '1'},
            {text: 'OFF', value: '0'}
        ];
    }

    get BAUDRATE_MENU () {
        return [
            {text: '4800', value: Buadrate.B4800},
            {text: '9600', value: Buadrate.B9600},
            {text: '19200', value: Buadrate.B19200},
            {text: '38400', value: Buadrate.B38400},
            {text: '57600', value: Buadrate.B57600},
            {text: '76800', value: Buadrate.B76800},
            {text: '115200', value: Buadrate.B115200}
        ];
    }

    get EOL_MENU () {
        return [
            {text: formatMessage({id: 'mieo.eolMenu.warp', default: 'warp'}), value: Eol.Warp},
            {text: formatMessage({id: 'mieo.eolMenu.noWarp', default: 'no-warp'}), value: Eol.NoWarp}
        ];
    }

    get ORIENTATION_MENU () {
        return [
            {text: '0°', value: '0'},
            {text: '1 (reversed)', value: '1'}
        ];
    }

    get ANALOG_SENSOR_PINS_MENU () {
        return [
            {text: 'A0', value: 'A0'},
            {text: 'A1', value: 'A1'},
            {text: 'A2', value: 'A2'},
            {text: 'A3', value: 'A3'},
            {text: 'A4', value: 'A4'},
            {text: 'A5', value: 'A5'}
        ];
    }

    get DIGITAL_READ_PINS_MENU () {
        return [
            {text: 'A0', value: 'A0'},
            {text: 'A1', value: 'A1'},
            {text: 'A2', value: 'A2'},
            {text: 'A3', value: 'A3'},
            {text: 'A4', value: 'A4'},
            {text: 'A5', value: 'A5'},
            {text: '2', value: '2'},
            {text: '3', value: '3'},
            {text: '4', value: '4'},
            {text: '5', value: '5'},
            {text: '6', value: '6'},
            {text: '7', value: '7'},
            {text: '8', value: '8'},
            {text: '9', value: '9'},
            {text: '10', value: '10'},
            {text: '11', value: '11'},
            {text: '12', value: '12'},
            {text: '13', value: '13'}
        ];
    }

    getInfo () {
        return [
            // ---- Mieo I/O ----
            {
                id: 'mieo',
                name: formatMessage({
                    id: 'mieo.category.mieo',
                    default: 'Mieo',
                    description: 'The name of the Mieo device main category'
                }),
                color1: '#FF6B6B',
                color2: '#FF5252',
                color3: '#FF4040',

                blocks: [
                    {
                        opcode: 'event_whenmieostartsup',
                        text: formatMessage({
                            id: 'mieo.mieo.whenMieoStartsUp',
                            default: 'when Mieo starts up'
                        }),
                        blockType: BlockType.EVENT,
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    '---',
                    {
                        opcode: 'mieo_setDigitalOutput',
                        text: formatMessage({
                            id: 'mieo.mieo.setDigitalOutput',
                            default: 'set digital pin [PIN] to [LEVEL]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'digitalPins',
                                defaultValue: Pins.D13
                            },
                            LEVEL: {
                                type: ArgumentType.STRING,
                                menu: 'level',
                                defaultValue: Level.High
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_setDigitalPinHighLow',
                        text: formatMessage({
                            id: 'mieo.mieo.setDigitalPinHighLow',
                            default: 'set pin [PIN] to [LEVEL]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'digitalReadPins',
                                defaultValue: 'A5'
                            },
                            LEVEL: {
                                type: ArgumentType.STRING,
                                menu: 'level',
                                defaultValue: Level.High
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_readDigitalPin',
                        text: formatMessage({
                            id: 'mieo.mieo.readDigitalPin',
                            default: 'read digital pin [PIN]'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'digitalPins',
                                defaultValue: Pins.D13
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_readDigitalPinBoolean',
                        text: formatMessage({
                            id: 'mieo.mieo.readDigitalPinBoolean',
                            default: 'digital pin [PIN] is HIGH'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'digitalReadPins',
                                defaultValue: 'A5'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_readAnalogPin',
                        text: formatMessage({
                            id: 'mieo.mieo.readAnalogPin',
                            default: 'read analog pin [PIN]'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'analogPins',
                                defaultValue: Pins.A0
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_readAnalogSensorString',
                        text: formatMessage({
                            id: 'mieo.mieo.readAnalogSensorString',
                            default: 'analog sensor [PIN]'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'analogSensorPins',
                                defaultValue: 'A5'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    '---',
                    {
                        opcode: 'mieo_setPwmOutput',
                        text: formatMessage({
                            id: 'mieo.mieo.setPwmOutput',
                            default: 'set PWM pin [PIN] out [OUT]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'pwmPins',
                                defaultValue: Pins.D3
                            },
                            OUT: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '128'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_setServoOutput',
                        text: formatMessage({
                            id: 'mieo.mieo.setServoOutput',
                            default: 'set servo pin [PIN] angle [OUT]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'pwmPins',
                                defaultValue: Pins.D3
                            },
                            OUT: {
                                type: ArgumentType.HALF_ANGLE,
                                defaultValue: '90'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {
                    digitalPins: {
                        items: this.DIGITAL_PINS_MENU
                    },
                    analogPins: {
                        items: this.ANALOG_PINS_MENU
                    },
                    analogSensorPins: {
                        items: this.ANALOG_SENSOR_PINS_MENU
                    },
                    digitalReadPins: {
                        items: this.DIGITAL_READ_PINS_MENU
                    },
                    pwmPins: {
                        items: this.PWM_PINS_MENU
                    },
                    level: {
                        acceptReporters: true,
                        items: this.LEVEL_MENU
                    }
                }
            },

            // ---- Display ----
            {
                id: 'mieodisplay',
                name: formatMessage({
                    id: 'mieo.category.display',
                    default: 'Display',
                    description: 'The name of the Mieo display category'
                }),
                color1: '#9966FF',
                color2: '#774DCB',
                color3: '#774DCB',

                blocks: [
                    {
                        opcode: 'mieo_showEmotion',
                        text: formatMessage({
                            id: 'mieo.display.showEmotion',
                            default: 'show [EMOJI] R [R] G [G] B [B]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            EMOJI: {
                                type: ArgumentType.STRING,
                                menu: 'emojis',
                                defaultValue: 'EMOJI_SMILE'
                            },
                            R: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '150'
                            },
                            G: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '100'
                            },
                            B: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '0'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_showEmotionFixed',
                        text: formatMessage({
                            id: 'mieo.display.showEmotionFixed',
                            default: 'show emotion [EMOJI]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            EMOJI: {
                                type: ArgumentType.STRING,
                                menu: 'emojis',
                                defaultValue: 'EMOJI_SMILE'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_displayText',
                        text: formatMessage({
                            id: 'mieo.display.displayText',
                            default: 'display text [TEXT] R [R] G [G] B [B] speed [SPEED]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            TEXT: {
                                type: ArgumentType.STRING,
                                defaultValue: 'hi'
                            },
                            R: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '75'
                            },
                            G: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '75'
                            },
                            B: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '75'
                            },
                            SPEED: {
                                type: ArgumentType.POSITIVE_NUMBER,
                                defaultValue: '300'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_showNumberColor',
                        text: formatMessage({
                            id: 'mieo.display.showNumberColor',
                            default: 'show number [NUMBER] R [R] G [G] B [B]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            NUMBER: {
                                type: ArgumentType.NUMBER,
                                defaultValue: '0'
                            },
                            R: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '255'
                            },
                            G: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '0'
                            },
                            B: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '0'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_clearDisplay',
                        text: formatMessage({
                            id: 'mieo.display.clearDisplay',
                            default: 'clear display'
                        }),
                        blockType: BlockType.COMMAND,
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {
                    emojis: {
                        items: this.EMOJI_MENU
                    }
                }
            },

            // ---- Robot ----
            {
                id: 'mieorobo',
                name: formatMessage({
                    id: 'mieo.category.robot',
                    default: 'Robot',
                    description: 'The name of the Mieo robot category'
                }),
                color1: '#4C97FF',
                color2: '#3373CC',
                color3: '#3373CC',

                blocks: [
                    {
                        opcode: 'mieo_runRobot',
                        text: formatMessage({
                            id: 'mieo.robot.runRobot',
                            default: 'run robot [DIR] speed [SPEED]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            DIR: {
                                type: ArgumentType.STRING,
                                menu: 'directions',
                                defaultValue: 'FORWARD'
                            },
                            SPEED: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '100'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_goForwardFor1s',
                        text: formatMessage({
                            id: 'mieo.robot.goForwardFor1s',
                            default: 'go [DIR] speed [SPEED] for [DELAY] seconds'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            DIR: {
                                type: ArgumentType.STRING,
                                menu: 'directions',
                                defaultValue: 'FORWARD'
                            },
                            SPEED: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '100'
                            },
                            DELAY: {
                                type: ArgumentType.POSITIVE_NUMBER,
                                defaultValue: '1'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_stopRobot',
                        text: formatMessage({
                            id: 'mieo.robot.stopRobot',
                            default: 'stop robot'
                        }),
                        blockType: BlockType.COMMAND,
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_setOrientation',
                        text: formatMessage({
                            id: 'mieo.robot.setOrientation',
                            default: 'set orientation [ORIENTATION]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            ORIENTATION: {
                                type: ArgumentType.STRING,
                                menu: 'orientations',
                                defaultValue: '0'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {
                    directions: {
                        items: this.DIRECTION_MENU
                    },
                    orientations: {
                        items: this.ORIENTATION_MENU
                    }
                }
            },

            // ---- Sensors ----
            {
                id: 'mieosens',
                name: formatMessage({
                    id: 'mieo.category.sensors',
                    default: 'Sensors',
                    description: 'The name of the Mieo sensors category'
                }),
                color1: '#FF8C1A',
                color2: '#DB6E00',
                color3: '#DB6E00',

                blocks: [
                    {
                        opcode: 'mieo_isButtonPressed',
                        text: formatMessage({
                            id: 'mieo.sensors.isButtonPressed',
                            default: 'button [BUTTON] pressed?'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            BUTTON: {
                                type: ArgumentType.STRING,
                                menu: 'buttons',
                                defaultValue: '7'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_isTouchPadPressed',
                        text: formatMessage({
                            id: 'mieo.sensors.isTouchPadPressed',
                            default: 'touch pad [TOUCH] pressed?'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            TOUCH: {
                                type: ArgumentType.STRING,
                                menu: 'touchPads',
                                defaultValue: '0'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    '---',
                    {
                        opcode: 'mieo_isInfraredActive',
                        text: formatMessage({
                            id: 'mieo.sensors.isInfraredActive',
                            default: 'infrared [IR] active?'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            IR: {
                                type: ArgumentType.STRING,
                                menu: 'irSensors',
                                defaultValue: 'A3'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_setInfraredThreshold',
                        text: formatMessage({
                            id: 'mieo.sensors.setInfraredThreshold',
                            default: 'set infrared [IR] threshold [THRESHOLD]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            IR: {
                                type: ArgumentType.STRING,
                                menu: 'irSensors',
                                defaultValue: 'A3'
                            },
                            THRESHOLD: {
                                type: ArgumentType.UINT10_NUMBER,
                                defaultValue: '512'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_getInfraredValue',
                        text: formatMessage({
                            id: 'mieo.sensors.getInfraredValue',
                            default: 'infrared [IR] value'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            IR: {
                                type: ArgumentType.STRING,
                                menu: 'irSensors',
                                defaultValue: 'A3'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {
                    buttons: {
                        items: this.BUTTON_MENU
                    },
                    touchPads: {
                        items: this.TOUCH_MENU
                    },
                    irSensors: {
                        items: this.IR_MENU
                    }
                }
            },

            // ---- Motor ----
            {
                id: 'mieomotor',
                name: formatMessage({
                    id: 'mieo.category.motor',
                    default: 'Motor',
                    description: 'The name of the Mieo motor category'
                }),
                color1: '#59C059',
                color2: '#389438',
                color3: '#389438',

                blocks: [
                    {
                        opcode: 'mieo_runMotor',
                        text: formatMessage({
                            id: 'mieo.motor.runMotor',
                            default: 'run [SIDE] motor [DIR] speed [SPEED]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            SIDE: {
                                type: ArgumentType.STRING,
                                menu: 'motorSides',
                                defaultValue: 'L'
                            },
                            DIR: {
                                type: ArgumentType.STRING,
                                menu: 'motorDirections',
                                defaultValue: 'FORWARD'
                            },
                            SPEED: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '100'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_stopMotor',
                        text: formatMessage({
                            id: 'mieo.motor.stopMotor',
                            default: 'stop [SIDE] motor'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            SIDE: {
                                type: ArgumentType.STRING,
                                menu: 'motorSides',
                                defaultValue: 'L'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    '---',
                    {
                        opcode: 'mieo_setServoAngle',
                        text: formatMessage({
                            id: 'mieo.motor.setServoAngle',
                            default: 'set [SERVO] angle [ANGLE]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            SERVO: {
                                type: ArgumentType.STRING,
                                menu: 'servos',
                                defaultValue: '1'
                            },
                            ANGLE: {
                                type: ArgumentType.HALF_ANGLE,
                                defaultValue: '90'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {
                    motorSides: {
                        items: this.MOTOR_SIDE_MENU
                    },
                    motorDirections: {
                        items: this.MOTOR_DIR_MENU
                    },
                    servos: {
                        items: this.SERVO_MENU
                    }
                }
            },

            // ---- Line Following ----
            {
                id: 'mieoline',
                name: formatMessage({
                    id: 'mieo.category.line',
                    default: 'Line Follow',
                    description: 'The name of the Mieo line following category'
                }),
                color1: '#CF63CF',
                color2: '#C94FC9',
                color3: '#BD42BD',

                blocks: [
                    {
                        opcode: 'mieo_setLineThresholds',
                        text: formatMessage({
                            id: 'mieo.line.setLineThresholds',
                            default: 'set line thresholds left [LEFT] right [RIGHT]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            LEFT: {
                                type: ArgumentType.UINT10_NUMBER,
                                defaultValue: '512'
                            },
                            RIGHT: {
                                type: ArgumentType.UINT10_NUMBER,
                                defaultValue: '512'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_followLine',
                        text: formatMessage({
                            id: 'mieo.line.followLine',
                            default: 'follow line'
                        }),
                        blockType: BlockType.COMMAND,
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_isOnTrack',
                        text: formatMessage({
                            id: 'mieo.line.isOnTrack',
                            default: 'is on track?'
                        }),
                        blockType: BlockType.BOOLEAN,
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {}
            },

            // ---- Ultrasonic ----
            {
                id: 'mieoultrasonic',
                name: formatMessage({
                    id: 'mieo.category.ultrasonic',
                    default: 'Ultrasonic',
                    description: 'The name of the Mieo ultrasonic category'
                }),
                color1: '#5CB1D6',
                color2: '#47A0C7',
                color3: '#3D8EB5',

                blocks: [
                    {
                        opcode: 'mieo_connectUltrasonic',
                        text: formatMessage({
                            id: 'mieo.ultrasonic.connectUltrasonic',
                            default: 'connect ultrasonic [ULTRA] trig [TRIG] echo [ECHO]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            ULTRA: {
                                type: ArgumentType.STRING,
                                menu: 'ultrasonics',
                                defaultValue: '1'
                            },
                            TRIG: {
                                type: ArgumentType.STRING,
                                menu: 'digitalPins',
                                defaultValue: 'A5'
                            },
                            ECHO: {
                                type: ArgumentType.STRING,
                                menu: 'digitalPins',
                                defaultValue: 'A4'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_getUltrasonicDistance',
                        text: formatMessage({
                            id: 'mieo.ultrasonic.getUltrasonicDistance',
                            default: 'ultrasonic [ULTRA] distance (cm)'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            ULTRA: {
                                type: ArgumentType.STRING,
                                menu: 'ultrasonics',
                                defaultValue: '1'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {
                    ultrasonics: {
                        items: this.ULTRASONIC_MENU
                    },
                    digitalPins: {
                        items: this.DIGITAL_PINS_MENU
                    }
                }
            },

            // ---- Buzzer ----
            {
                id: 'mieobuzz',
                name: formatMessage({
                    id: 'mieo.category.buzzer',
                    default: 'Buzzer',
                    description: 'The name of the Mieo buzzer category'
                }),
                color1: '#FFAB19',
                color2: '#EC9C13',
                color3: '#CF8B17',

                blocks: [
                    {
                        opcode: 'mieo_playMusic',
                        text: formatMessage({
                            id: 'mieo.buzzer.playMusic',
                            default: 'play music [SONG]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            SONG: {
                                type: ArgumentType.STRING,
                                menu: 'songs',
                                defaultValue: 'HAPPY_BIRTHDAY'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_playTone',
                        text: formatMessage({
                            id: 'mieo.buzzer.playTone',
                            default: 'play note [NOTE] for [DURATION]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            NOTE: {
                                type: ArgumentType.STRING,
                                menu: 'notes',
                                defaultValue: 'C4'
                            },
                            DURATION: {
                                type: ArgumentType.STRING,
                                menu: 'durations',
                                defaultValue: '2'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_buzzStop',
                        text: formatMessage({
                            id: 'mieo.buzzer.buzzStop',
                            default: 'stop buzzer'
                        }),
                        blockType: BlockType.COMMAND,
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {
                    songs: {
                        items: this.SONG_MENU
                    },
                    notes: {
                        items: this.NOTE_MENU
                    },
                    durations: {
                        items: this.DURATION_MENU
                    }
                }
            },

            // ---- Bluetooth / App Controls ----
            {
                id: 'mieoappcontrols',
                name: formatMessage({
                    id: 'mieo.category.appControls',
                    default: 'Bluetooth',
                    description: 'The name of the Mieo bluetooth/app controls category'
                }),
                color1: '#0FBD8C',
                color2: '#0DA57A',
                color3: '#0B8E69',

                blocks: [
                    {
                        opcode: 'mieo_setupBluetooth',
                        text: formatMessage({
                            id: 'mieo.app.setupBluetooth',
                            default: 'setup Bluetooth'
                        }),
                        blockType: BlockType.COMMAND,
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_refreshBluetooth',
                        text: formatMessage({
                            id: 'mieo.app.refreshBluetooth',
                            default: 'refresh Bluetooth'
                        }),
                        blockType: BlockType.COMMAND,
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    '---',
                    {
                        opcode: 'mieo_toggleSwitch',
                        text: formatMessage({
                            id: 'mieo.app.toggleSwitch',
                            default: 'toggle switch [STATE]'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            STATE: {
                                type: ArgumentType.STRING,
                                menu: 'toggleStates',
                                defaultValue: '1'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_isBtButton',
                        text: formatMessage({
                            id: 'mieo.app.isBtButton',
                            default: 'bluetooth button [BUTTON]?'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            BUTTON: {
                                type: ArgumentType.STRING,
                                menu: 'btButtons',
                                defaultValue: 'F'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_btStringEquals',
                        text: formatMessage({
                            id: 'mieo.app.btStringEquals',
                            default: 'bluetooth string equals [TEXT]'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            TEXT: {
                                type: ArgumentType.STRING,
                                defaultValue: 'hi'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    '---',
                    {
                        opcode: 'mieo_putToTerminal',
                        text: formatMessage({
                            id: 'mieo.app.putToTerminal',
                            default: 'send [TEXT] to terminal'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            TEXT: {
                                type: ArgumentType.STRING,
                                defaultValue: 'hello'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {
                    toggleStates: {
                        items: this.TOGGLE_MENU
                    },
                    btButtons: {
                        items: this.BT_BUTTON_MENU
                    }
                }
            },

            // ---- Serial ----
            {
                id: 'mieoSerial',
                name: formatMessage({
                    id: 'mieo.category.serial',
                    default: 'Serial',
                    description: 'The name of the Mieo serial category'
                }),
                color1: '#9966FF',
                color2: '#774DCB',
                color3: '#774DCB',

                blocks: [
                    {
                        opcode: 'mieo_enableSerial',
                        text: formatMessage({
                            id: 'mieo.serial.enableSerial',
                            default: 'enable serial baudrate [BAUD]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            BAUD: {
                                type: ArgumentType.STRING,
                                menu: 'baudrate',
                                defaultValue: Buadrate.B9600
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_writeSerial',
                        text: formatMessage({
                            id: 'mieo.serial.writeSerial',
                            default: 'serial print [VALUE] [EOL]'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            VALUE: {
                                type: ArgumentType.STRING,
                                defaultValue: 'hello'
                            },
                            EOL: {
                                type: ArgumentType.STRING,
                                menu: 'eol',
                                defaultValue: Eol.Warp
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_byteAvailable',
                        text: formatMessage({
                            id: 'mieo.serial.byteAvailable',
                            default: 'serial available'
                        }),
                        blockType: BlockType.REPORTER,
                        disableMonitor: true,
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_readAsString',
                        text: formatMessage({
                            id: 'mieo.serial.readAsString',
                            default: 'serial read string'
                        }),
                        blockType: BlockType.REPORTER,
                        disableMonitor: true,
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'mieo_readAsNumber',
                        text: formatMessage({
                            id: 'mieo.serial.readAsNumber',
                            default: 'serial read number'
                        }),
                        blockType: BlockType.REPORTER,
                        disableMonitor: true,
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {
                    baudrate: {
                        items: this.BAUDRATE_MENU
                    },
                    eol: {
                        items: this.EOL_MENU
                    }
                }
            }
        ];
    }
}

module.exports = OpenBlockMieoDevice;
