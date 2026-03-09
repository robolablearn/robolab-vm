/**
 * Mieo Device
 *
 * @overview An Arduino Uno compatible custom board with MIEO-specific
 * peripherals: LED matrix display, motors, sensors, buzzer, line follower,
 * ultrasonic, bluetooth, and serial communication.
 */
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');

const ArduinoPeripheral = require('../common/arduino-peripheral');

const PNPID_LIST = [
    'USB\\VID_1A86&PID_7523'
];

const SERIAL_CONFIG = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1
};

const DIVECE_OPT = {
    type: 'arduino',
    fqbn: 'arduino:avr:uno',
    firmware: 'mieo.hex',
    defaultBaudrate: 9600,
    disableRealtime: true
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

class OpenBlockMieoDevice {

    get DEVICE_ID () {
        return 'mieo';
    }

    constructor (runtime, originalDeviceId) {
        this.runtime = runtime;
        this._peripheral = new ArduinoPeripheral(runtime, this.DEVICE_ID, originalDeviceId, PNPID_LIST, SERIAL_CONFIG, DIVECE_OPT);

        this._pinState = {};
        Object.keys(Pins).forEach(pin => {
            this._pinState[Pins[pin]] = 0;
        });

        // Bind all block handler methods
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
        this.mieo_showEmotionFixed = this.mieo_showEmotionFixed.bind(this);
        this.mieo_displayText = this.mieo_displayText.bind(this);
        this.mieo_clearDisplay = this.mieo_clearDisplay.bind(this);
        this.mieo_showNumberColor = this.mieo_showNumberColor.bind(this);
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
        this.mieo_stopMotor = this.mieo_stopMotor.bind(this);
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
        this.mieo_refreshBluetooth = this.mieo_refreshBluetooth.bind(this);
        this.mieo_toggleSwitch = this.mieo_toggleSwitch.bind(this);
        this.mieo_isBtButton = this.mieo_isBtButton.bind(this);
        this.mieo_btStringEquals = this.mieo_btStringEquals.bind(this);
        this.mieo_putToTerminal = this.mieo_putToTerminal.bind(this);
        this.mieo_enableSerial = this.mieo_enableSerial.bind(this);
        this.mieo_writeSerial = this.mieo_writeSerial.bind(this);
        this.mieo_byteAvailable = this.mieo_byteAvailable.bind(this);
        this.mieo_readAsString = this.mieo_readAsString.bind(this);
        this.mieo_readAsNumber = this.mieo_readAsNumber.bind(this);
    }

    get DIGITAL_PINS_MENU () {
        return [
            {text: '0', value: Pins.D0}, {text: '1', value: Pins.D1},
            {text: '2', value: Pins.D2}, {text: '3', value: Pins.D3},
            {text: '4', value: Pins.D4}, {text: '5', value: Pins.D5},
            {text: '6', value: Pins.D6}, {text: '7', value: Pins.D7},
            {text: '8', value: Pins.D8}, {text: '9', value: Pins.D9},
            {text: '10', value: Pins.D10}, {text: '11', value: Pins.D11},
            {text: '12', value: Pins.D12}, {text: '13', value: Pins.D13},
            {text: 'A0', value: Pins.A0}, {text: 'A1', value: Pins.A1},
            {text: 'A2', value: Pins.A2}, {text: 'A3', value: Pins.A3},
            {text: 'A4', value: Pins.A4}, {text: 'A5', value: Pins.A5}
        ];
    }

    get ANALOG_PINS_MENU () {
        return [
            {text: 'A0', value: Pins.A0}, {text: 'A1', value: Pins.A1},
            {text: 'A2', value: Pins.A2}, {text: 'A3', value: Pins.A3},
            {text: 'A4', value: Pins.A4}, {text: 'A5', value: Pins.A5}
        ];
    }

    get BOOL_DIGITAL_PINS_MENU () {
        return [
            {text: 'A0', value: 'A0'}, {text: 'A1', value: 'A1'},
            {text: 'A2', value: 'A2'}, {text: 'A3', value: 'A3'},
            {text: 'A4', value: 'A4'}, {text: 'A5', value: 'A5'},
            {text: '2', value: '2'}, {text: '3', value: '3'},
            {text: '4', value: '4'}, {text: '5', value: '5'},
            {text: '6', value: '6'}, {text: '7', value: '7'},
            {text: '8', value: '8'}, {text: '9', value: '9'},
            {text: '10', value: '10'}, {text: '11', value: '11'},
            {text: '12', value: '12'}, {text: '13', value: '13'}
        ];
    }

    get PWM_PINS_MENU () {
        return [
            {text: '3', value: Pins.D3}, {text: '5', value: Pins.D5},
            {text: '6', value: Pins.D6}, {text: '9', value: Pins.D9},
            {text: '10', value: Pins.D10}, {text: '11', value: Pins.D11}
        ];
    }

    get LEVEL_MENU () {
        return [
            {text: 'HIGH', value: Level.High},
            {text: 'LOW', value: Level.Low}
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
            {text: 'forward', value: 'FORWARD'},
            {text: 'backward', value: 'BACKWARD'},
            {text: 'left', value: 'LEFT'},
            {text: 'right', value: 'RIGHT'}
        ];
    }

    get SPEED_MENU () {
        return [
            {text: '50', value: '50'},
            {text: '100', value: '100'},
            {text: '150', value: '150'},
            {text: '200', value: '200'},
            {text: '255', value: '255'}
        ];
    }

    get ORIENTATION_MENU () {
        return [
            {text: '0', value: '0'},
            {text: '1', value: '1'}
        ];
    }

    get MOTOR_SIDE_MENU () {
        return [
            {text: 'left', value: 'L'},
            {text: 'right', value: 'R'}
        ];
    }

    get MOTOR_DIR_MENU () {
        return [
            {text: 'forward', value: 'FORWARD'},
            {text: 'backward', value: 'BACKWARD'}
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
            {text: 'Touch 1', value: '1'}
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
            {text: 'C4', value: 'C4'}, {text: 'D4', value: 'D4'},
            {text: 'E4', value: 'E4'}, {text: 'F4', value: 'F4'},
            {text: 'G4', value: 'G4'}, {text: 'A4', value: 'A4'},
            {text: 'B4', value: 'B4'}, {text: 'C5', value: 'C5'},
            {text: 'D5', value: 'D5'}, {text: 'E5', value: 'E5'},
            {text: 'F5', value: 'F5'}, {text: 'G5', value: 'G5'},
            {text: 'A5', value: 'A5'}, {text: 'B5', value: 'B5'}
        ];
    }

    get DURATION_MENU () {
        return [
            {text: '1', value: '1'}, {text: '2', value: '2'},
            {text: '4', value: '4'}, {text: '8', value: '8'},
            {text: '16', value: '16'}
        ];
    }

    get BT_BUTTON_MENU () {
        return [
            {text: 'Up', value: 'F'}, {text: 'Down', value: 'B'},
            {text: 'Right', value: 'R'}, {text: 'Left', value: 'L'},
            {text: 'Triangle', value: 'T'}, {text: 'Cross', value: 'X'},
            {text: 'Circle', value: 'C'}, {text: 'Square', value: 'S'},
            {text: 'Start', value: 'A'}, {text: 'Pause', value: 'P'}
        ];
    }

    get TOGGLE_MENU () {
        return [
            {text: 'ON', value: '1'},
            {text: 'OFF', value: '0'}
        ];
    }

    get BAUD_RATE_MENU () {
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

    get SERIAL_EOL_MENU () {
        return [
            {text: 'warp', value: Eol.Warp},
            {text: 'no-warp', value: Eol.NoWarp}
        ];
    }

    getInfo () {
        return [
            // ---- Mieo I/O ----
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
                        items: this.DIGITAL_PINS_MENU
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

            // ---- Display ----
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
                        text: 'show emotion [EMOJI]',
                        arguments: {
                            EMOJI: {
                                type: ArgumentType.STRING,
                                menu: 'emojis',
                                defaultValue: 'EMOJI_SMILE'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_showEmotion',
                        blockType: BlockType.COMMAND,
                        text: 'show [EMOJI] R [R] G [G] B [B]',
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
                        }
                    },
                    {
                        opcode: 'mieo_showNumberColor',
                        blockType: BlockType.COMMAND,
                        text: 'show number [NUMBER] R [R] G [G] B [B]',
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
                        }
                    },
                    {
                        opcode: 'mieo_displayText',
                        blockType: BlockType.COMMAND,
                        text: 'display text [TEXT] R [R] G [G] B [B] speed [SPEED]',
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
                        }
                    },
                    {
                        opcode: 'mieo_clearDisplay',
                        blockType: BlockType.COMMAND,
                        text: 'clear display'
                    }
                ],
                menus: {
                    emojis: {
                        items: this.EMOJI_MENU
                    }
                }
            },

            // ---- Sensors ----
            {
                id: 'mieosens',
                name: 'Sensors',
                color1: '#FF8C1A',
                color2: '#DB6E00',
                color3: '#DB6E00',

                blocks: [
                    {
                        opcode: 'mieo_isButtonPressed',
                        blockType: BlockType.BOOLEAN,
                        text: 'button [BUTTON] pressed?',
                        arguments: {
                            BUTTON: {
                                type: ArgumentType.STRING,
                                menu: 'buttons',
                                defaultValue: '7'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_isTouchPadPressed',
                        blockType: BlockType.BOOLEAN,
                        text: 'touch pad [TOUCH] pressed?',
                        arguments: {
                            TOUCH: {
                                type: ArgumentType.STRING,
                                menu: 'touchPads',
                                defaultValue: '0'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_isInfraredActive',
                        blockType: BlockType.BOOLEAN,
                        text: 'infrared [IR] active?',
                        arguments: {
                            IR: {
                                type: ArgumentType.STRING,
                                menu: 'irSensors',
                                defaultValue: 'A3'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_setInfraredThreshold',
                        blockType: BlockType.COMMAND,
                        text: 'set infrared [IR] threshold [THRESHOLD]',
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
                        }
                    },
                    {
                        opcode: 'mieo_getInfraredValue',
                        blockType: BlockType.REPORTER,
                        text: 'infrared [IR] value',
                        arguments: {
                            IR: {
                                type: ArgumentType.STRING,
                                menu: 'irSensors',
                                defaultValue: 'A3'
                            }
                        }
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

            // ---- Buzzer ----
            {
                id: 'mieobuzz',
                name: 'Buzzer',
                color1: '#FFAB19',
                color2: '#EC9C13',
                color3: '#CF8B17',

                blocks: [
                    {
                        opcode: 'mieo_playMusic',
                        blockType: BlockType.COMMAND,
                        text: 'play music [SONG]',
                        arguments: {
                            SONG: {
                                type: ArgumentType.STRING,
                                menu: 'songs',
                                defaultValue: 'HAPPY_BIRTHDAY'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_playTone',
                        blockType: BlockType.COMMAND,
                        text: 'play note [NOTE] for [DURATION]',
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
                        }
                    },
                    {
                        opcode: 'mieo_buzzStop',
                        blockType: BlockType.COMMAND,
                        text: 'stop buzzer'
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

            // ---- Motor ----
            {
                id: 'mieomotor',
                name: 'Motor',
                color1: '#59C059',
                color2: '#389438',
                color3: '#389438',

                blocks: [
                    {
                        opcode: 'mieo_runMotor',
                        blockType: BlockType.COMMAND,
                        text: 'run [SIDE] motor [DIR] speed [SPEED]',
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
                        }
                    },
                    {
                        opcode: 'mieo_stopMotor',
                        blockType: BlockType.COMMAND,
                        text: 'stop [SIDE] motor',
                        arguments: {
                            SIDE: {
                                type: ArgumentType.STRING,
                                menu: 'motorSides',
                                defaultValue: 'L'
                            }
                        }
                    },
                    '---',
                    {
                        opcode: 'mieo_setServoAngle',
                        blockType: BlockType.COMMAND,
                        text: 'set [SERVO] angle [ANGLE]',
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
                        }
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

            // ---- Robot ----
            {
                id: 'mieorobo',
                name: 'Robot',
                color1: '#4C97FF',
                color2: '#3373CC',
                color3: '#3373CC',

                blocks: [
                    {
                        opcode: 'mieo_runRobot',
                        blockType: BlockType.COMMAND,
                        text: 'run robot [DIR] speed [SPEED]',
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
                        }
                    },
                    {
                        opcode: 'mieo_goForwardFor1s',
                        blockType: BlockType.COMMAND,
                        text: 'go [DIR] speed [SPEED] for [DELAY] seconds',
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
                        }
                    },
                    {
                        opcode: 'mieo_stopRobot',
                        blockType: BlockType.COMMAND,
                        text: 'stop mieo'
                    },
                    {
                        opcode: 'mieo_setOrientation',
                        blockType: BlockType.COMMAND,
                        text: 'set mieo orientation [ORIENTATION]',
                        arguments: {
                            ORIENTATION: {
                                type: ArgumentType.STRING,
                                menu: 'orientations',
                                defaultValue: '0'
                            }
                        }
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

            // ---- Line Following ----
            {
                id: 'mieoline',
                name: 'Line Follow',
                color1: '#CF63CF',
                color2: '#C94FC9',
                color3: '#BD42BD',

                blocks: [
                    {
                        opcode: 'mieo_setLineThresholds',
                        blockType: BlockType.COMMAND,
                        text: 'set line thresholds left [LEFT] right [RIGHT]',
                        arguments: {
                            LEFT: {
                                type: ArgumentType.UINT10_NUMBER,
                                defaultValue: '512'
                            },
                            RIGHT: {
                                type: ArgumentType.UINT10_NUMBER,
                                defaultValue: '512'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_followLine',
                        blockType: BlockType.COMMAND,
                        text: 'follow line'
                    },
                    {
                        opcode: 'mieo_isOnTrack',
                        blockType: BlockType.BOOLEAN,
                        text: 'mieo on track'
                    }
                ],
                menus: {}
            },

            // ---- Ultrasonic ----
            {
                id: 'mieoultrasonic',
                name: 'Ultrasonic',
                color1: '#5CB1D6',
                color2: '#47A0C7',
                color3: '#3D8EB5',

                blocks: [
                    {
                        opcode: 'mieo_connectUltrasonic',
                        blockType: BlockType.COMMAND,
                        text: 'connect ultrasonic [ULTRA] trig [TRIG] echo [ECHO]',
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
                        }
                    },
                    {
                        opcode: 'mieo_getUltrasonicDistance',
                        blockType: BlockType.REPORTER,
                        text: 'ultrasonic [ULTRA] distance (cm)',
                        arguments: {
                            ULTRA: {
                                type: ArgumentType.STRING,
                                menu: 'ultrasonics',
                                defaultValue: '1'
                            }
                        }
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

            // ---- Bluetooth / App Controls ----
            {
                id: 'mieoappcontrols',
                name: 'Bluetooth',
                color1: '#0FBD8C',
                color2: '#0DA57A',
                color3: '#0B8E69',

                blocks: [
                    {
                        opcode: 'mieo_setupBluetooth',
                        blockType: BlockType.COMMAND,
                        text: 'setup Bluetooth'
                    },
                    {
                        opcode: 'mieo_refreshBluetooth',
                        blockType: BlockType.COMMAND,
                        text: 'refresh Bluetooth'
                    },
                    '---',
                    {
                        opcode: 'mieo_toggleSwitch',
                        blockType: BlockType.BOOLEAN,
                        text: 'toggle switch [STATE]',
                        arguments: {
                            STATE: {
                                type: ArgumentType.STRING,
                                menu: 'toggleStates',
                                defaultValue: '1'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_isBtButton',
                        blockType: BlockType.BOOLEAN,
                        text: 'bluetooth button [BUTTON]?',
                        arguments: {
                            BUTTON: {
                                type: ArgumentType.STRING,
                                menu: 'btButtons',
                                defaultValue: 'F'
                            }
                        }
                    },
                    {
                        opcode: 'mieo_btStringEquals',
                        blockType: BlockType.BOOLEAN,
                        text: 'bluetooth string equals [TEXT]',
                        arguments: {
                            TEXT: {
                                type: ArgumentType.STRING,
                                defaultValue: 'hi'
                            }
                        }
                    },
                    '---',
                    {
                        opcode: 'mieo_putToTerminal',
                        blockType: BlockType.COMMAND,
                        text: 'send [TEXT] to terminal',
                        arguments: {
                            TEXT: {
                                type: ArgumentType.STRING,
                                defaultValue: 'hello'
                            }
                        }
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
                name: 'Serial',
                color1: '#9966FF',
                color2: '#774DCB',
                color3: '#774DCB',

                blocks: [
                    {
                        opcode: 'mieo_enableSerial',
                        blockType: BlockType.COMMAND,
                        text: 'enable serial baudrate [BAUD]',
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
                        text: 'serial print [VALUE] [EOL]',
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
                        blockType: BlockType.REPORTER,
                        text: 'serial available',
                        disableMonitor: true
                    },
                    {
                        opcode: 'mieo_readAsString',
                        blockType: BlockType.REPORTER,
                        text: 'serial read string',
                        disableMonitor: true
                    },
                    {
                        opcode: 'mieo_readAsNumber',
                        blockType: BlockType.REPORTER,
                        text: 'serial read number',
                        disableMonitor: true
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

    // ---- Block handler stubs ----

    mieo_setDigitalOutput (args) {
        this._peripheral.setDigitalOutput(args.PIN, args.LEVEL);
        return Promise.resolve();
    }

    mieo_setDigitalPinHighLow (args) {
        this._peripheral.setDigitalOutput(args.PIN, args.LEVEL);
        return Promise.resolve();
    }

    mieo_readDigitalPin (args) {
        return this._peripheral.readDigitalPin(args.PIN);
    }

    mieo_readDigitalPinBoolean (args) {
        return this._peripheral.readDigitalPin(args.PIN);
    }

    mieo_readAnalogSensorString (args) {
        return this._peripheral.readAnalogPin(args.PIN);
    }

    mieo_readAnalogPin (args) {
        return this._peripheral.readAnalogPin(args.PIN);
    }

    mieo_setPwmOutput (args) {
        this._peripheral.setPwmOutput(args.PIN, args.OUT);
        return Promise.resolve();
    }

    mieo_setServoOutput (args) {
        this._peripheral.setServoOutput(args.PIN, args.OUT);
        return Promise.resolve();
    }

    mieo_showEmotion () { return Promise.resolve(); }
    mieo_showEmotionFixed () { return Promise.resolve(); }
    mieo_displayText () { return Promise.resolve(); }
    mieo_clearDisplay () { return Promise.resolve(); }
    mieo_showNumberColor () { return Promise.resolve(); }
    mieo_runRobot () { return Promise.resolve(); }
    mieo_goForwardFor1s () { return Promise.resolve(); }
    mieo_setOrientation () { return Promise.resolve(); }
    mieo_stopRobot () { return Promise.resolve(); }
    mieo_isButtonPressed () { return Promise.resolve(false); }
    mieo_isTouchPadPressed () { return Promise.resolve(false); }
    mieo_isInfraredActive () { return Promise.resolve(false); }
    mieo_setInfraredThreshold () { return Promise.resolve(); }
    mieo_getInfraredValue () { return Promise.resolve(0); }
    mieo_runMotor () { return Promise.resolve(); }
    mieo_stopMotor () { return Promise.resolve(); }
    mieo_setServoAngle () { return Promise.resolve(); }
    mieo_setLineThresholds () { return Promise.resolve(); }
    mieo_followLine () { return Promise.resolve(); }
    mieo_isOnTrack () { return Promise.resolve(false); }
    mieo_connectUltrasonic () { return Promise.resolve(); }
    mieo_getUltrasonicDistance () { return Promise.resolve(0); }
    mieo_playMusic () { return Promise.resolve(); }
    mieo_playTone () { return Promise.resolve(); }
    mieo_buzzStop () { return Promise.resolve(); }
    mieo_setupBluetooth () { return Promise.resolve(); }
    mieo_refreshBluetooth () { return Promise.resolve(); }
    mieo_toggleSwitch () { return Promise.resolve(false); }
    mieo_isBtButton () { return Promise.resolve(false); }
    mieo_btStringEquals () { return Promise.resolve(false); }
    mieo_putToTerminal () { return Promise.resolve(); }
    mieo_enableSerial () { return Promise.resolve(); }
    mieo_writeSerial () { return Promise.resolve(); }
    mieo_byteAvailable () { return Promise.resolve(false); }
    mieo_readAsString () { return Promise.resolve(''); }
    mieo_readAsNumber () { return Promise.resolve(0); }
    event_whenmieostartsup () { return Promise.resolve(); }
}

module.exports = OpenBlockMieoDevice;
