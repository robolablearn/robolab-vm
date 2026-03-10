/**
 * Code generator for Mieo device - generates Arduino C code
 * This file registers code generators for Mieo blocks with Blockly
 */

function setupMieoCodeGenerators (GeneratorOrBlockly) {
    // Support both Blockly and Generator parameter names
    const Blockly = GeneratorOrBlockly;
    
    // Ensure we have the Arduino namespace
    if (!Blockly.Arduino) {
        Blockly.Arduino = {};
    }
    if (!Blockly.Arduino.definitions_) {
        Blockly.Arduino.definitions_ = {};
    }
    if (!Blockly.Arduino.includes_) {
        Blockly.Arduino.includes_ = {};
    }
    if (!Blockly.Arduino.setups_) {
        Blockly.Arduino.setups_ = {};
    }
    if (!Blockly.Arduino.ORDER_EQUALITY) {
        Blockly.Arduino.ORDER_EQUALITY = 5;
    }
    if (!Blockly.Arduino.ORDER_FUNCTION_CALL) {
        Blockly.Arduino.ORDER_FUNCTION_CALL = 1;
    }
    
    /**
     * Arduino code for Mieo set digital output
     * Block: set digital pin [PIN] to [LEVEL]
     */
    Blockly.Arduino['mieo_setDigitalOutput'] = function (block) {
        const pin = block.getFieldValue('PIN') || '13';
        const level = block.getFieldValue('LEVEL') || 'HIGH';
        
        // Add setup code for pinMode
        const setupKey = 'mieo_digitalWrite_' + pin;
        if (!Blockly.Arduino.definitions_[setupKey]) {
            Blockly.Arduino.definitions_[setupKey] = `pinMode(${pin}, OUTPUT);`;
        }
        
        const code = `digitalWrite(${pin}, ${level});\n`;
        return code;
    };

    /**
     * Arduino code for Mieo read digital pin (boolean)
     * Block: digital pin [PIN] is high?
     */
    Blockly.Arduino['mieo_readDigitalPin'] = function (block) {
        const pin = block.getFieldValue('PIN') || '13';
        
        // Add setup code for pinMode
        const setupKey = 'mieo_digitalRead_' + pin;
        if (!Blockly.Arduino.definitions_[setupKey]) {
            Blockly.Arduino.definitions_[setupKey] = `pinMode(${pin}, INPUT);`;
        }
        
        const code = `(digitalRead(${pin}) == HIGH)`;
        return [code, Blockly.Arduino.ORDER_EQUALITY];
    };

    /**
     * Arduino code for Mieo read analog pin (reporter)
     * Block: read analog pin [PIN]
     */
    Blockly.Arduino['mieo_readAnalogPin'] = function (block) {
        const pin = block.getFieldValue('PIN') || 'A0';
        
        const code = `analogRead(${pin})`;
        return [code, Blockly.Arduino.ORDER_FUNCTION_CALL];
    };

    /**
     * Arduino code for Mieo set PWM output
     * Block: set PWM pin [PIN] to [OUT]
     */
    Blockly.Arduino['mieo_setPwmOutput'] = function (block) {
        const pin = block.getFieldValue('PIN') || '3';
        const value = block.getFieldValue('OUT') || '128';
        
        // Add setup code for pinMode
        const setupKey = 'mieo_analogWrite_' + pin;
        if (!Blockly.Arduino.definitions_[setupKey]) {
            Blockly.Arduino.definitions_[setupKey] = `pinMode(${pin}, OUTPUT);`;
        }
        
        const code = `analogWrite(${pin}, ${value});\n`;
        return code;
    };

    /**
     * Arduino code for Mieo set servo output
     * Block: set servo pin [PIN] to [OUT] degree
     */
    Blockly.Arduino['mieo_setServoOutput'] = function (block) {
        const pin = block.getFieldValue('PIN') || '3';
        const angle = block.getFieldValue('OUT') || '90';
        
        // Add Servo include
        if (!Blockly.Arduino.includes_['include_servo']) {
            Blockly.Arduino.includes_['include_servo'] = '#include <Servo.h>';
        }
        
        // Add servo variable
        const servoVar = `servo_pin_${pin}`;
        if (!Blockly.Arduino.definitions_[servoVar]) {
            Blockly.Arduino.definitions_[servoVar] = `Servo ${servoVar};`;
        }
        
        // Add servo attach in setup
        const setupCode = `${servoVar}.attach(${pin});`;
        if (!Blockly.Arduino.setups_['mieo_servo_setup_' + pin]) {
            Blockly.Arduino.setups_['mieo_servo_setup_' + pin] = setupCode;
        }
        
        const code = `${servoVar}.write(${angle});\n`;
        return code;
    };

    /**
     * Arduino code for Mieo robot run
     * Block: go [DIR] speed [SPEED]
     */
    Blockly.Arduino['mieo_runRobot'] = function (block) {
        const dir = block.getFieldValue('DIR') || 'FORWARD';
        const speed = block.getFieldValue('SPEED') || '100';

        if (!Blockly.Arduino.includes_['include_mieo_motor']) {
            Blockly.Arduino.includes_['include_mieo_motor'] = '#include "mieo_motor.h"';
        }
        if (!Blockly.Arduino.setups_['mieo_motor_init']) {
            Blockly.Arduino.setups_['mieo_motor_init'] = 'mieo_motor_init();';
        }

        const code = `mieo_run(${dir}, ${speed});\n`;
        return code;
    };

    /**
     * Arduino code for Mieo go forward for 1 second
     * Block: go forward speed [SPEED] for 1 second
     */
    Blockly.Arduino['mieo_goForwardFor1s'] = function (block) {
        const dir = block.getFieldValue('DIR') || 'FORWARD';
        const speed = block.getFieldValue('SPEED') || '100';
        const delaySec = block.getFieldValue('DELAY') || '1';

        if (!Blockly.Arduino.includes_['include_mieo_motor']) {
            Blockly.Arduino.includes_['include_mieo_motor'] = '#include "mieo_motor.h"';
        }
        if (!Blockly.Arduino.setups_['mieo_motor_init']) {
            Blockly.Arduino.setups_['mieo_motor_init'] = 'mieo_motor_init();';
        }

        const code = `mieo_run(${dir}, ${speed});\n` +
            `delay(${delaySec}* 1000);\n` +
            'stopRobot();\n';
        return code;
    };

    /**
     * Arduino code for Mieo stop
     * Block: stop mieo
     */
    Blockly.Arduino['mieo_stopRobot'] = function () {
        if (!Blockly.Arduino.includes_['include_mieo_motor']) {
            Blockly.Arduino.includes_['include_mieo_motor'] = '#include "mieo_motor.h"';
        }
        if (!Blockly.Arduino.setups_['mieo_motor_init']) {
            Blockly.Arduino.setups_['mieo_motor_init'] = 'mieo_motor_init();';
        }

        return 'stopRobot();\n';
    };

    /**
     * Arduino code for Mieo orientation
     * Block: set mieo orientation [ORIENTATION]
     */
    Blockly.Arduino['mieo_setOrientation'] = function (block) {
        const orientation = block.getFieldValue('ORIENTATION') || '0';

        if (!Blockly.Arduino.includes_['include_mieo_motor']) {
            Blockly.Arduino.includes_['include_mieo_motor'] = '#include "mieo_motor.h"';
        }
        if (!Blockly.Arduino.setups_['mieo_motor_init']) {
            Blockly.Arduino.setups_['mieo_motor_init'] = 'mieo_motor_init();';
        }

        return `mieo_orientation = ${orientation};\n`;
    };

    /**
     * Arduino code for Mieo button pressed
     * Block: is button [BUTTON] pressed
     */
    Blockly.Arduino['mieo_isButtonPressed'] = function (block) {
        const pin = block.getFieldValue('BUTTON') || '7';
        const setupKey = `mieo_button_${pin}`;
        if (!Blockly.Arduino.setups_[setupKey]) {
            Blockly.Arduino.setups_[setupKey] = `pinMode(${pin}, INPUT_PULLUP);`;
        }

        const code = `!digitalRead(${pin})`;
        return [code, Blockly.Arduino.ORDER_EQUALITY];
    };

    /**
     * Arduino code for Mieo touch pad pressed
     * Block: is touch [TOUCH] pressed
     */
    Blockly.Arduino['mieo_isTouchPadPressed'] = function (block) {
        const channel = block.getFieldValue('TOUCH') || '0';

        if (!Blockly.Arduino.includes_['include_touchpad']) {
            Blockly.Arduino.includes_['include_touchpad'] = '#include "touchpad.h"';
        }
        if (!Blockly.Arduino.definitions_['touchpad_instance']) {
            Blockly.Arduino.definitions_['touchpad_instance'] = 'TouchPad tp;';
        }

        const code = `tp.padtouched(${channel})`;
        return [code, Blockly.Arduino.ORDER_EQUALITY];
    };

    /**
     * Arduino code for Mieo infrared sensor active
     * Block: is [IR] active
     */
    Blockly.Arduino['mieo_isInfraredActive'] = function (block) {
        const ir = block.getFieldValue('IR') || 'A3';

        let threshold = 'ThresholdA3';
        if (ir === 'A2') {
            threshold = 'ThresholdA2';
            if (!Blockly.Arduino.definitions_['mieo_ir_threshold_a2']) {
                Blockly.Arduino.definitions_['mieo_ir_threshold_a2'] = 'int ThresholdA2 = 512;';
            }
        } else if (!Blockly.Arduino.definitions_['mieo_ir_threshold_a3']) {
            Blockly.Arduino.definitions_['mieo_ir_threshold_a3'] = 'int ThresholdA3 = 512;';
        }

        const code = `analogRead(${ir}) < ${threshold}`;
        return [code, Blockly.Arduino.ORDER_EQUALITY];
    };

    /**
     * Arduino code for Mieo infrared threshold
     * Block: set [IR] threshold [THRESHOLD]
     */
    Blockly.Arduino['mieo_setInfraredThreshold'] = function (block) {
        const ir = block.getFieldValue('IR') || 'A3';
        const thresholdValue = block.getFieldValue('THRESHOLD') || '512';

        if (ir === 'A2') {
            if (!Blockly.Arduino.definitions_['mieo_ir_threshold_a2']) {
                Blockly.Arduino.definitions_['mieo_ir_threshold_a2'] = 'int ThresholdA2 = 512;';
            }
            return `ThresholdA2 = ${thresholdValue};\n`;
        }

        if (!Blockly.Arduino.definitions_['mieo_ir_threshold_a3']) {
            Blockly.Arduino.definitions_['mieo_ir_threshold_a3'] = 'int ThresholdA3 = 512;';
        }
        return `ThresholdA3 = ${thresholdValue};\n`;
    };

    /**
     * Arduino code for Mieo infrared value
     * Block: get [IR] value
     */
    Blockly.Arduino['mieo_getInfraredValue'] = function (block) {
        const ir = block.getFieldValue('IR') || 'A3';
        const code = `analogRead(${ir})`;
        return [code, Blockly.Arduino.ORDER_FUNCTION_CALL || Blockly.Arduino.ORDER_ATOMIC];
    };

    /**
     * Arduino code for Mieo run single motor
     * Block: run [SIDE] motor [DIR] at speed [SPEED]
     */
    Blockly.Arduino['mieo_runMotor'] = function (block) {
        const side = block.getFieldValue('SIDE') || 'L';
        const dir = block.getFieldValue('DIR') || 'FORWARD';
        const speed = block.getFieldValue('SPEED') || '100';

        if (!Blockly.Arduino.includes_['include_mieo_motor']) {
            Blockly.Arduino.includes_['include_mieo_motor'] = '#include "mieo_motor.h"';
        }
        if (!Blockly.Arduino.setups_['mieo_motor_init']) {
            Blockly.Arduino.setups_['mieo_motor_init'] = 'mieo_motor_init();';
        }

        return `mieo_runMotor("${side}", ${dir}, ${speed});\n`;
    };

    /**
     * Arduino code for Mieo stop single motor
     * Block: stop [SIDE] motor
     */
    Blockly.Arduino['mieo_stopMotor'] = function (block) {
        const side = block.getFieldValue('SIDE') || 'L';

        if (!Blockly.Arduino.includes_['include_mieo_motor']) {
            Blockly.Arduino.includes_['include_mieo_motor'] = '#include "mieo_motor.h"';
        }
        if (!Blockly.Arduino.setups_['mieo_motor_init']) {
            Blockly.Arduino.setups_['mieo_motor_init'] = 'mieo_motor_init();';
        }

        return `stopMotor("${side}");\n`;
    };

    /**
     * Arduino code for Mieo set servo angle
     * Block: set [SERVO] angle [ANGLE]
     */
    Blockly.Arduino['mieo_setServoAngle'] = function (block) {
        const servo = block.getFieldValue('SERVO') || '1';
        const angle = block.getFieldValue('ANGLE') || '90';

        if (!Blockly.Arduino.includes_['include_servo']) {
            Blockly.Arduino.includes_['include_servo'] = '#include <Servo.h>';
        }

        if (servo === '2') {
            if (!Blockly.Arduino.definitions_['servo_9']) {
                Blockly.Arduino.definitions_['servo_9'] = 'Servo myservo_9;';
            }
            if (!Blockly.Arduino.setups_['servo_9_attach']) {
                Blockly.Arduino.setups_['servo_9_attach'] = 'myservo_9.attach(9);';
            }
            return `myservo_9.write(${angle});\n`;
        }

        if (!Blockly.Arduino.definitions_['servo_10']) {
            Blockly.Arduino.definitions_['servo_10'] = 'Servo myservo_10;';
        }
        if (!Blockly.Arduino.setups_['servo_10_attach']) {
            Blockly.Arduino.setups_['servo_10_attach'] = 'myservo_10.attach(10);';
        }

        return `myservo_10.write(${angle});\n`;
    };

    /**
     * Arduino code for Mieo line follower thresholds
     * Block: set ir threshold L [LEFT] R [RIGHT]
     */
    Blockly.Arduino['mieo_setLineThresholds'] = function (block) {
        const left = block.getFieldValue('LEFT') || '512';
        const right = block.getFieldValue('RIGHT') || '512';

        if (!Blockly.Arduino.includes_['include_mieo_line_follower']) {
            Blockly.Arduino.includes_['include_mieo_line_follower'] = '#include "mieo_line_follower.h"';
        }
        if (!Blockly.Arduino.definitions_['mieo_line_follower']) {
            Blockly.Arduino.definitions_['mieo_line_follower'] = 'MIEOLineFollower lineFollower;';
        }
        if (!Blockly.Arduino.setups_['mieo_line_follower_begin']) {
            Blockly.Arduino.setups_['mieo_line_follower_begin'] = 'lineFollower.begin();';
        }
        if (!Blockly.Arduino.definitions_['mieo_ir_threshold_a3']) {
            Blockly.Arduino.definitions_['mieo_ir_threshold_a3'] = 'int ThresholdA3 = 512;';
        }
        if (!Blockly.Arduino.definitions_['mieo_ir_threshold_a2']) {
            Blockly.Arduino.definitions_['mieo_ir_threshold_a2'] = 'int ThresholdA2 = 512;';
        }

        return `ThresholdA3 = ${left};\nThresholdA2 = ${right};\nlineFollower.setThresholds(${left}, ${right});\n`;
    };

    /**
     * Arduino code for Mieo line follow
     * Block: line follow
     */
    Blockly.Arduino['mieo_followLine'] = function () {
        if (!Blockly.Arduino.includes_['include_mieo_line_follower']) {
            Blockly.Arduino.includes_['include_mieo_line_follower'] = '#include "mieo_line_follower.h"';
        }
        if (!Blockly.Arduino.definitions_['mieo_line_follower']) {
            Blockly.Arduino.definitions_['mieo_line_follower'] = 'MIEOLineFollower lineFollower;';
        }

        if (!Blockly.Arduino.setups_['mieo_motor_init']) {
            Blockly.Arduino.setups_['mieo_motor_init'] = 'mieo_motor_init();';
        }
        if (!Blockly.Arduino.setups_['mieo_line_follower_begin']) {
            Blockly.Arduino.setups_['mieo_line_follower_begin'] = 'lineFollower.begin();';
        }

        return 'lineFollower.followLine();\n';
    };

    /**
     * Arduino code for Mieo on track
     * Block: mieo on track
     */
    Blockly.Arduino['mieo_isOnTrack'] = function () {
        if (!Blockly.Arduino.definitions_['mieo_ir_threshold_a3']) {
            Blockly.Arduino.definitions_['mieo_ir_threshold_a3'] = 'int ThresholdA3 = 512;';
        }
        if (!Blockly.Arduino.definitions_['mieo_ir_threshold_a2']) {
            Blockly.Arduino.definitions_['mieo_ir_threshold_a2'] = 'int ThresholdA2 = 512;';
        }

        const code = '(analogRead(A3) < ThresholdA3) || (analogRead(A2) < ThresholdA2)';
        return [code, Blockly.Arduino.ORDER_EQUALITY];
    };

    /**
     * Arduino code for Mieo connect ultrasonic
     * Block: connect ultrasonic [ULTRA] trig [TRIG] echo [ECHO]
     */
    Blockly.Arduino['mieo_connectUltrasonic'] = function (block) {
        const ultra = block.getFieldValue('ULTRA') || '1';
        const trig = block.getFieldValue('TRIG') || 'A5';
        const echo = block.getFieldValue('ECHO') || 'A4';

        if (!Blockly.Arduino.includes_['include_hcsr04']) {
            Blockly.Arduino.includes_['include_hcsr04'] = '#include "HCSR04.h"';
        }

        if (ultra === '2') {
            if (!Blockly.Arduino.definitions_['mieo_ultra_2']) {
                Blockly.Arduino.definitions_['mieo_ultra_2'] = `HCSR04 hc_2(${trig}, ${echo});`;
            }
            return '';
        }

        if (!Blockly.Arduino.definitions_['mieo_ultra_1']) {
            Blockly.Arduino.definitions_['mieo_ultra_1'] = `HCSR04 hc_1(${trig}, ${echo});`;
        }
        return '';
    };

    /**
     * Arduino code for Mieo ultrasonic distance
     * Block: get ultrasonic [ULTRA] distance (cm)
     */
    Blockly.Arduino['mieo_getUltrasonicDistance'] = function (block) {
        const ultra = block.getFieldValue('ULTRA') || '1';

        if (ultra === '2') {
            return ['hc_2.dist()', Blockly.Arduino.ORDER_FUNCTION_CALL || Blockly.Arduino.ORDER_ATOMIC];
        }

        return ['hc_1.dist()', Blockly.Arduino.ORDER_FUNCTION_CALL || Blockly.Arduino.ORDER_ATOMIC];
    };

    /**
     * Arduino code for Mieo play music
     * Block: play music [SONG]
     */
    Blockly.Arduino['mieo_playMusic'] = function (block) {
        const song = block.getFieldValue('SONG') || 'HAPPY_BIRTHDAY';

        if (!Blockly.Arduino.includes_['include_mieo_buzz']) {
            Blockly.Arduino.includes_['include_mieo_buzz'] = '#include "MIEO_BUZZ.h"';
        }
        if (!Blockly.Arduino.definitions_['mieo_buzzer']) {
            Blockly.Arduino.definitions_['mieo_buzzer'] = 'MIEO_BUZZ buzzer;';
        }

        if (song === 'JINGLE_BELLS') {
            return 'buzzer.playJingleBells();\n';
        }
        if (song === 'WE_WISH_YOU') {
            return 'buzzer.playWeWishYou();\n';
        }
        if (song === 'TWINKLE_TWINKLE') {
            return 'buzzer.playTwinkleTwinkle();\n';
        }
        if (song === 'ODE_TO_JOY') {
            return 'buzzer.playOdeToJoy();\n';
        }
        if (song === 'MARY_HAD_A_LITTLE_LAMB') {
            return 'buzzer.playMaryHadALittleLamb();\n';
        }
        if (song === 'STARTUP') {
            return 'buzzer.playStartup();\n';
        }
        if (song === 'ERROR') {
            return 'buzzer.playError();\n';
        }

        return 'buzzer.playHappyBirthday();\n';
    };

    /**
     * Arduino code for Mieo play tone
     * Block: play tone [NOTE] duration [DURATION]
     */
    Blockly.Arduino['mieo_playTone'] = function (block) {
        const note = block.getFieldValue('NOTE') || 'C4';
        const duration = block.getFieldValue('DURATION') || '2';

        if (!Blockly.Arduino.includes_['include_mieo_buzz']) {
            Blockly.Arduino.includes_['include_mieo_buzz'] = '#include "MIEO_BUZZ.h"';
        }
        if (!Blockly.Arduino.definitions_['mieo_buzzer']) {
            Blockly.Arduino.definitions_['mieo_buzzer'] = 'MIEO_BUZZ buzzer;';
        }

        return `buzzer.playtone("${note}", ${duration});\n`;
    };

    /**
     * Arduino code for Mieo buzz stop
     * Block: buzz stop
     */
    Blockly.Arduino['mieo_buzzStop'] = function () {
        return 'noTone(11);\n';
    };

    /**
     * Arduino code for Mieo setup bluetooth
     * Block: set up bluetooth
     */
    Blockly.Arduino['mieo_setupBluetooth'] = function () {
        if (!Blockly.Arduino.includes_['include_software_serial']) {
            Blockly.Arduino.includes_['include_software_serial'] = '#include <SoftwareSerial.h>';
        }
        if (!Blockly.Arduino.definitions_['mieo_bluetooth_serial']) {
            Blockly.Arduino.definitions_['mieo_bluetooth_serial'] = 'SoftwareSerial bluetooth(2, 3);';
        }
        if (!Blockly.Arduino.definitions_['mieo_bluetooth_command']) {
            Blockly.Arduino.definitions_['mieo_bluetooth_command'] = 'char btCommand = 0;';
        }
        if (!Blockly.Arduino.definitions_['mieo_bluetooth_string']) {
            Blockly.Arduino.definitions_['mieo_bluetooth_string'] = 'String btString = "";';
        }
        if (!Blockly.Arduino.setups_['mieo_bluetooth_begin']) {
            Blockly.Arduino.setups_['mieo_bluetooth_begin'] = 'bluetooth.begin(9600);';
        }

        return '';
    };

    /**
     * Arduino code for Mieo refresh bluetooth
     * Block: refresh bluetooth
     */
    Blockly.Arduino['mieo_refreshBluetooth'] = function () {
        if (!Blockly.Arduino.definitions_['mieo_bluetooth_serial']) {
            Blockly.Arduino.definitions_['mieo_bluetooth_serial'] = 'SoftwareSerial bluetooth(2, 3);';
        }
        if (!Blockly.Arduino.definitions_['mieo_bluetooth_command']) {
            Blockly.Arduino.definitions_['mieo_bluetooth_command'] = 'char btCommand = 0;';
        }
        if (!Blockly.Arduino.definitions_['mieo_bluetooth_string']) {
            Blockly.Arduino.definitions_['mieo_bluetooth_string'] = 'String btString = "";';
        }

        return 'while (bluetooth.available()) {\n' +
            '  char c = bluetooth.read();\n' +
            '  btCommand = c;\n' +
            '  btString += c;\n' +
            '}\n';
    };

    /**
     * Arduino code for Mieo toggle switch
     * Block: toggle switch [STATE]
     */
    Blockly.Arduino['mieo_toggleSwitch'] = function (block) {
        const state = block.getFieldValue('STATE') || '1';

        if (!Blockly.Arduino.definitions_['mieo_bluetooth_command']) {
            Blockly.Arduino.definitions_['mieo_bluetooth_command'] = 'char btCommand = 0;';
        }

        const code = `btCommand == '${state}'`;
        return [code, Blockly.Arduino.ORDER_EQUALITY];
    };

    /**
     * Arduino code for Mieo bluetooth button
     * Block: is [BUTTON] pressed
     */
    Blockly.Arduino['mieo_isBtButton'] = function (block) {
        const button = block.getFieldValue('BUTTON') || 'F';

        if (!Blockly.Arduino.definitions_['mieo_bluetooth_command']) {
            Blockly.Arduino.definitions_['mieo_bluetooth_command'] = 'char btCommand = 0;';
        }

        const code = `btCommand == '${button}'`;
        return [code, Blockly.Arduino.ORDER_EQUALITY];
    };

    /**
     * Arduino code for Mieo bt string equals
     * Block: bt string equals [TEXT]
     */
    Blockly.Arduino['mieo_btStringEquals'] = function (block) {
        const text = block.getFieldValue('TEXT') || 'hi';

        if (!Blockly.Arduino.definitions_['mieo_bluetooth_string']) {
            Blockly.Arduino.definitions_['mieo_bluetooth_string'] = 'String btString = "";';
        }

        const code = `btString == "${text}"`;
        return [code, Blockly.Arduino.ORDER_EQUALITY];
    };

    /**
     * Arduino code for Mieo put to terminal
     * Block: put [TEXT] to terminal
     */
    Blockly.Arduino['mieo_putToTerminal'] = function (block) {
        const text = block.getFieldValue('TEXT') || 'hello';

        if (!Blockly.Arduino.includes_['include_software_serial']) {
            Blockly.Arduino.includes_['include_software_serial'] = '#include <SoftwareSerial.h>';
        }
        if (!Blockly.Arduino.definitions_['mieo_bluetooth_serial']) {
            Blockly.Arduino.definitions_['mieo_bluetooth_serial'] = 'SoftwareSerial bluetooth(2, 3);';
        }
        if (!Blockly.Arduino.setups_['mieo_bluetooth_begin']) {
            Blockly.Arduino.setups_['mieo_bluetooth_begin'] = 'bluetooth.begin(9600);';
        }

        return `bluetooth.println("${text}");\n`;
    };

    /**
     * Arduino code for Mieo enable serial
     * Block: enable serial baud [BAUD]
     */
    Blockly.Arduino['mieo_enableSerial'] = function (block) {
        const baud = block.getFieldValue('BAUD') || '9600';

        if (!Blockly.Arduino.setups_['mieo_serial_begin']) {
            Blockly.Arduino.setups_['mieo_serial_begin'] = `Serial.begin(${baud});`;
        }

        return '';
    };

    /**
     * Arduino code for Mieo write serial
     * Block: write [VALUE] serial
     */
    Blockly.Arduino['mieo_writeSerial'] = function (block) {
        // Try to get value from connected block
        const valueCode = Blockly.Arduino.valueToCode(block, 'VALUE', Blockly.Arduino.ORDER_NONE);
        const eol = block.getFieldValue('EOL') || 'warp';
        let finalValue;
        
        if (valueCode) {
            // A block is connected - use its value as-is
            finalValue = valueCode;
        } else {
            // No block connected - get text field value and quote it
            const text = block.getFieldValue('VALUE') || 'hello';
            finalValue = Blockly.Arduino.quote_(text);
        }

        const serialMethod = eol === 'warp' ? 'println' : 'print';
        return `Serial.${serialMethod}(${finalValue});\n`;
    };

    /**
     * Arduino code for Mieo byte available
     * Block: byte available
     */
    Blockly.Arduino['mieo_byteAvailable'] = function () {
        const code = 'Serial.available()';
        return [code, Blockly.Arduino.ORDER_FUNCTION_CALL];
    };

    /**
     * Arduino code for Mieo read as string
     * Block: read as string
     */
    Blockly.Arduino['mieo_readAsString'] = function () {
        const code = 'Serial.readString()';
        return [code, Blockly.Arduino.ORDER_FUNCTION_CALL];
    };

    /**
     * Arduino code for Mieo read as number
     * Block: read as number
     */
    Blockly.Arduino['mieo_readAsNumber'] = function () {
        const code = 'Serial.parseFloat()';
        return [code, Blockly.Arduino.ORDER_FUNCTION_CALL];
    };

    /**
     * Arduino code for Mieo startup event (hat)
     * Block: when Mieo starts up
     * This block does not generate code directly; it only provides a top-level entry point.
     */
    Blockly.Arduino['event_whenmieostartsup'] = function () {
        return '';
    };
}

module.exports = setupMieoCodeGenerators;
