#include "mieo_line_follower.h"

MIEOLineFollower::MIEOLineFollower() {
    // Default thresholds
    _thresholdL = 800;
    _thresholdR = 550;
}

void MIEOLineFollower::setThresholds(int leftThreshold, int rightThreshold) {
    _thresholdL = leftThreshold;
    _thresholdR = rightThreshold;
}

void MIEOLineFollower::begin() {
    pinMode(IR_L, INPUT);
    pinMode(IR_R, INPUT);
}

void MIEOLineFollower::followLine() {
    int leftValue  = analogRead(IR_L);
    int rightValue = analogRead(IR_R);

    bool leftOnLine  = (leftValue  > _thresholdL);
    bool rightOnLine = (rightValue > _thresholdR);

    // both white -> forward
    if (!leftOnLine && !rightOnLine) {
        mieo_run(FORWARD, 30);
    }
    // left on line
    else if (leftOnLine && !rightOnLine) {
        mieo_runMotor("R", BACKWARD, 30);
        mieo_runMotor("L", FORWARD, 40);
    }
    // right on line
    else if (!leftOnLine && rightOnLine) {
        mieo_runMotor("R", FORWARD, 40);
        mieo_runMotor("L", BACKWARD, 30);
    }
    // both on line
    else {
        stopRobot();
    }
}
