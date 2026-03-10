#include "touchpad.h"

int TouchPad::padtouched(int pinSelect) {
    int pin;

    // Select A6 or A7
    if (pinSelect == 0) {
        pin = A6;
    } else {
        pin = A7;
    }

    int value = analogRead(pin);

    // Return 1 if touched (value > 512), else 0
    return (value > 512) ? 1 : 0;
}
