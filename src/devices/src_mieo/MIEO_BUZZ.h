#ifndef MIEO_BUZZ_H
#define MIEO_BUZZ_H

#include <Arduino.h>

class MIEO_BUZZ {
  public:
    MIEO_BUZZ();

    // Tempo & basic tone
    void setBeatTime(int ms);
    void playTone(String note, char duration);

    // Quarky-compatible functions
    void playtone(String note, int beats);
    void playfreq(int freqs[], int duration);

    // Pre-built melodies
    void playHappyBirthday();
    void playJingleBells();
    void playWeWishYou();
    void playTwinkleTwinkle();
    void playOdeToJoy();
    void playMaryHadALittleLamb();
    void playStartup();
    void playError();

  private:
    const int buzzerPin = 11;   // Fixed pin
    int beatTime;

    int noteToFreq(String note);
    int durationToTime(char duration);
};

#endif
