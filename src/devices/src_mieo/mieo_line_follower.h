#ifndef MIEO_LINE_FOLLOWER_H
#define MIEO_LINE_FOLLOWER_H

#include <Arduino.h>
#include "mieo_motor.h"

// Fixed IR sensor pins
#define IR_L A2
#define IR_R A3

class MIEOLineFollower {
public:
    MIEOLineFollower();

    void begin();
    void setThresholds(int leftThreshold, int rightThreshold);
    void followLine();

private:
    int _thresholdL;
    int _thresholdR;
};

#endif
