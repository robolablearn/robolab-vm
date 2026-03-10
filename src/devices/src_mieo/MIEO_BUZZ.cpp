#include "MIEO_BUZZ.h"

// ================= CONSTRUCTOR =================
MIEO_BUZZ::MIEO_BUZZ() {
  beatTime = 250;          // quarter note = 250 ms
  pinMode(buzzerPin, OUTPUT);
}

// ================= SETTINGS =================
void MIEO_BUZZ::setBeatTime(int ms) {
  beatTime = ms;
}

// ================= DURATION =================
int MIEO_BUZZ::durationToTime(char d) {
  if (d == 'W') return beatTime * 4;
  if (d == 'H') return beatTime * 2;
  if (d == 'Q') return beatTime;
  if (d == 'E') return beatTime / 2;
  if (d == 'S') return beatTime / 4;
  return beatTime;
}

// ================= BASIC TONE =================
void MIEO_BUZZ::playTone(String note, char duration) {
  int freq = noteToFreq(note);
  int time = durationToTime(duration);

  if (freq > 0) {
    tone(buzzerPin, freq);
    delay(time);
    noTone(buzzerPin);
    delay(20);
  }
}

// ================= QUARKY COMPATIBLE =================

// quarky.playtone("C4", 8)
void MIEO_BUZZ::playtone(String note, int beats) {
  int freq = noteToFreq(note);
  int time = beats * beatTime;

  if (freq > 0) {
    tone(buzzerPin, freq);
    delay(time);
    noTone(buzzerPin);
  }
}

// quarky.playfreq([1000], 200)
void MIEO_BUZZ::playfreq(int freqs[], int duration) {
  int i = 0;
  while (i < 1) {
    tone(buzzerPin, freqs[i]);
    delay(duration);
    noTone(buzzerPin);
    i++;
  }
}

// ================= NOTES C0 → B7 =================
int MIEO_BUZZ::noteToFreq(String n) {
  if (n=="C0") return 16;  if (n=="D0") return 18;  if (n=="E0") return 20;
  if (n=="F0") return 21;  if (n=="G0") return 24;  if (n=="A0") return 27;
  if (n=="B0") return 31;

  if (n=="C1") return 33;  if (n=="D1") return 37;  if (n=="E1") return 41;
  if (n=="F1") return 44;  if (n=="G1") return 49;  if (n=="A1") return 55;
  if (n=="B1") return 62;

  if (n=="C2") return 65;  if (n=="D2") return 73;  if (n=="E2") return 82;
  if (n=="F2") return 87;  if (n=="G2") return 98;  if (n=="A2") return 110;
  if (n=="B2") return 123;

  if (n=="C3") return 131; if (n=="D3") return 147; if (n=="E3") return 165;
  if (n=="F3") return 175; if (n=="G3") return 196; if (n=="A3") return 220;
  if (n=="B3") return 247;

  if (n=="C4") return 262; if (n=="D4") return 294; if (n=="E4") return 330;
  if (n=="F4") return 349; if (n=="G4") return 392; if (n=="A4") return 440;
  if (n=="B4") return 494;

  if (n=="C5") return 523; if (n=="D5") return 587; if (n=="E5") return 659;
  if (n=="F5") return 698; if (n=="G5") return 784; if (n=="A5") return 880;
  if (n=="B5") return 988;

  if (n=="C6") return 1047; if (n=="D6") return 1175; if (n=="E6") return 1319;
  if (n=="F6") return 1397; if (n=="G6") return 1568; if (n=="A6") return 1760;
  if (n=="B6") return 1976;

  if (n=="C7") return 2093; if (n=="D7") return 2349; if (n=="E7") return 2637;
  if (n=="F7") return 2794; if (n=="G7") return 3136; if (n=="A7") return 3520;
  if (n=="B7") return 3951;

  return 0;
}

// ================= MELODIES =================

void MIEO_BUZZ::playHappyBirthday() {
  String n[]={"G4","G4","A4","G4","C5","B4","G4","G4","A4","G4","D5","C5",
              "G4","G4","G5","E5","C5","B4","A4","F5","F5","E5","C5","D5","C5"};
  char d[]={'Q','E','H','H','H','W','Q','E','H','H','H','W',
            'Q','E','H','H','H','H','W','Q','E','H','H','H','W'};
  int i=0; while(i<25){ playTone(n[i],d[i]); i++; }
}

void MIEO_BUZZ::playJingleBells() {
  String n[]={"E4","E4","E4","E4","E4","E4","E4","G4","C4","D4","E4",
              "F4","F4","F4","F4","F4","E4","E4","E4","E4",
              "D4","D4","E4","D4","G4"};
  char d[]={'Q','Q','H','Q','Q','H','Q','Q','Q','Q','W',
            'Q','Q','Q','Q','Q','Q','Q','E','E',
            'Q','Q','Q','Q','W'};
  int i=0; while(i<25){ playTone(n[i],d[i]); i++; }
}

void MIEO_BUZZ::playWeWishYou() {
  String n[]={"G4","C5","C5","D5","C5","B4","A4","A4","D5","D5","E5","D5","C5",
              "B4","G4","G4","E5","E5","F5","E5","D5","C5","A4","G4"};
  char d[]={'Q','Q','E','Q','Q','H','Q','Q','Q','Q','Q','Q','H',
            'Q','Q','Q','Q','Q','Q','Q','H','Q','Q','W'};
  int i=0; while(i<24){ playTone(n[i],d[i]); i++; }
}

void MIEO_BUZZ::playTwinkleTwinkle() {
  String n[]={"C4","C4","G4","G4","A4","A4","G4",
              "F4","F4","E4","E4","D4","D4","C4"};
  char d[]={'Q','Q','Q','Q','Q','Q','H','Q','Q','Q','Q','Q','Q','H'};
  int i=0; while(i<14){ playTone(n[i],d[i]); i++; }
}

void MIEO_BUZZ::playOdeToJoy() {
  String n[]={"E4","E4","F4","G4","G4","F4","E4","D4",
              "C4","C4","D4","E4","E4","D4","D4"};
  char d[]={'Q','Q','Q','Q','Q','Q','Q','Q',
            'Q','Q','Q','Q','H','Q','W'};
  int i=0; while(i<15){ playTone(n[i],d[i]); i++; }
}

void MIEO_BUZZ::playMaryHadALittleLamb() {
  String n[]={"E4","D4","C4","D4","E4","E4","E4",
              "D4","D4","D4","E4","G4","G4"};
  char d[]={'Q','Q','Q','Q','Q','Q','H','Q','Q','H','Q','Q','W'};
  int i=0; while(i<13){ playTone(n[i],d[i]); i++; }
}

void MIEO_BUZZ::playStartup() {
  String n[]={"C4","E4","G4","C5"};
  char d[]={'E','E','E','H'};
  int i=0; while(i<4){ playTone(n[i],d[i]); i++; }
}

void MIEO_BUZZ::playError() {
  int i=0;
  while(i<3){
    tone(buzzerPin, 200);
    delay(200);
    noTone(buzzerPin);
    delay(100);
    i++;
  }
}
