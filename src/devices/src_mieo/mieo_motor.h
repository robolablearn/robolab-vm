#ifndef MIEO_MOTOR_H
#define MIEO_MOTOR_H

#include <Arduino.h>

// Motor pins
const uint8_t LEFT_PWM  = 5;   // M1 PWM
const uint8_t LEFT_DIR  = 12;  // M1 direction
const uint8_t RIGHT_PWM = 6;   // M2 PWM
const uint8_t RIGHT_DIR = 13;  // M2 direction

// Motor directions
enum MotorDirection {
    FORWARD,
    BACKWARD,
    LEFT,
    RIGHT,
    STOP
};

// Orientation (0 = normal, 1 = reversed)
extern int mieo_orientation;

// Initialization
void mieo_motor_init();

// Base motor functions
void mieo_motor_left(MotorDirection dir, int speed);
void mieo_motor_right(MotorDirection dir, int speed);

// Orientation helper
MotorDirection mieo_adjust_dir(MotorDirection dir);

// Robot-level movement
void mieo_run(MotorDirection dir, int speed);
void mieo_runMotor(String motor, MotorDirection dir, int speed);

// Stop functions
void stopMotor(String motor);
void stopRobot();

// Orientation setter
void mieo_setOrientation(int orientation);

#endif
