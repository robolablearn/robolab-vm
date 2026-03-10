#ifndef TOUCHPAD_H
#define TOUCHPAD_H

#include <Arduino.h>

class TouchPad {
public:
    // pinSelect: 0 = A6, 1 = A7
    int padtouched(int pinSelect);
};

#endif
