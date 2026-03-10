#include "mieo_motor.h"

// ------------------------------------------------------------
// Orientation (0 = normal, 1 = reversed)
// ------------------------------------------------------------
int mieo_orientation = 0;

// Flip direction if orientation = 1
MotorDirection flipDirection(MotorDirection dir) {
    if (mieo_orientation == 1) {
        if (dir == FORWARD)  return BACKWARD;
        if (dir == BACKWARD) return FORWARD;
    }
    return dir;
}

// ------------------------------------------------------------
// Initialize motor pins
// ------------------------------------------------------------
void mieo_motor_init() {
    pinMode(LEFT_PWM, OUTPUT);
    pinMode(LEFT_DIR, OUTPUT);
    pinMode(RIGHT_PWM, OUTPUT);
    pinMode(RIGHT_DIR, OUTPUT);

    analogWrite(LEFT_PWM, 0);
    digitalWrite(LEFT_DIR, LOW);
    analogWrite(RIGHT_PWM, 0);
    digitalWrite(RIGHT_DIR, LOW);
}

// ------------------------------------------------------------
// LEFT motor control
// ------------------------------------------------------------
void mieo_motor_left(MotorDirection dir, int speed) {
    speed = constrain(speed, 0, 100);
    uint8_t pwm;

    switch (dir) {
        case FORWARD:
            pwm = map(speed, 0, 100, 0, 255);
            analogWrite(LEFT_PWM, pwm);
            digitalWrite(LEFT_DIR, LOW);
            break;

        case BACKWARD:
            pwm = map(speed, 0, 100, 255, 0);
            analogWrite(LEFT_PWM, pwm);
            digitalWrite(LEFT_DIR, HIGH);
            break;

        case STOP:
        default:
            analogWrite(LEFT_PWM, 0);
            digitalWrite(LEFT_DIR, LOW);
            break;
    }
}

// ------------------------------------------------------------
// RIGHT motor control
// ------------------------------------------------------------
void mieo_motor_right(MotorDirection dir, int speed) {
    uint8_t pwm;
    speed = constrain(speed, 0, 100);

    switch (dir) {
        case FORWARD:
            pwm = map(speed, 0, 100, 0, 255);
            analogWrite(RIGHT_PWM, pwm);
            digitalWrite(RIGHT_DIR, LOW);
            break;

        case BACKWARD:
            pwm = map(speed, 0, 100, 255, 0);
            analogWrite(RIGHT_PWM, pwm);
            digitalWrite(RIGHT_DIR, HIGH);
            break;

        case STOP:
        default:
            analogWrite(RIGHT_PWM, 0);
            digitalWrite(RIGHT_DIR, LOW);
            break;
    }
}

// ------------------------------------------------------------
// RUN BOTH MOTORS (with orientation)
// ------------------------------------------------------------
void mieo_run(MotorDirection dir, int speed) {

    dir = flipDirection(dir);   // <--- orientation applied here

    switch (dir) {
        case FORWARD:
            mieo_motor_left(FORWARD, speed);
            mieo_motor_right(FORWARD, speed);
            break;

        case BACKWARD:
            mieo_motor_left(BACKWARD, speed);
            mieo_motor_right(BACKWARD, speed);
            break;

        case LEFT:
            mieo_motor_left(FORWARD, speed);
            mieo_motor_right(BACKWARD, speed);
            break;

        case RIGHT:
            mieo_motor_left(BACKWARD, speed);
            mieo_motor_right(FORWARD, speed);
            break;

        case STOP:
        default:
            mieo_motor_left(STOP, 0);
            mieo_motor_right(STOP, 0);
            break;
    }
}

// ------------------------------------------------------------
// RUN INDIVIDUAL MOTOR (with orientation)
// ------------------------------------------------------------
void mieo_runMotor(String motor, MotorDirection dir, int speed) {

    dir = flipDirection(dir);    // <--- orientation applied here
    speed = constrain(speed, 0, 100);

    if (motor == "L") {
        mieo_motor_left(dir, speed);
    }
    else if (motor == "R") {
        mieo_motor_right(dir, speed);
    }
}

// ------------------------------------------------------------
// STOPS
// ------------------------------------------------------------
void stopRobot() {
    mieo_motor_left(STOP, 0);
    mieo_motor_right(STOP, 0);
}

void stopMotor(String motor) {
    if (motor == "L") {
        mieo_motor_left(STOP, 0);
    }
    else if (motor == "R") {
        mieo_motor_right(STOP, 0);
    }
}
