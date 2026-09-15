const Buffer = require('buffer').Buffer;
const formatMessage = require('format-message');

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const ProgramModeType = require('../../extension-support/program-mode-type');

const MieoPeripheral = require('./mieo-peripheral');
const MieoRepl = require('./mieo-repl');

/**
 * Icon for the Mieo category in the toolbox: the Mieo mascot, padded to a
 * square so it fills the icon box -- Blockly draws category icons with
 * background-size: 100% in a 1.25rem box, which clips a portrait image.
 * Source artwork: src/assets/mieo/mieo-mascot.png in the app repo.
 * @type {string}
 */
// eslint-disable-next-line max-len
const mieoMenuIconURI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAMAAAC5zwKfAAADAFBMVEVkJh5ZWZnfaKCbVSg4o9bLYSYvn5p4KhXglqOnlZTircmUaWXJZlrsaSFf26sYYp6w2tEZM1uZKiKpdFhNr9Vmj7MlDwhjUlVrQCrr3uOSMhOHYaA8xt6Xq9Nl4e4ze8TcjS7loRnGUyLeOIjCPCW2oZy5hU6/iTq9VyLyynAsUW5hLB0z2JqXQhLMmZkyIh//VVXgJ36n4rsxP4O7cjL/wT6fOQxhP5v5+fgAAAD3dwn9ojP6hxL6my7u7OntZgT////Rxs68SwnPtazn19L6uEkQFy3zWgMnNlHppIfRmEjw5tYvFhTISQzvqErriCoRBwrqmnmPiIskKk1VR0ixmpTWhSoXKU3sdEv9mBm2tLSXlZZIODawqqzY1dXPuckvSG3RZkv+tDcuNmu/PwAtQ1dPJyUaJTexZ1PyyJK/fz+qVQAwKC59PgGFeXfPVkXrxrP//1XIhkWwdDS0dzT3eC3KdVb6xlKhhX3ySAHy2KsJG0rVUxF2dHg0So/p2uSvRDNwd4nmhWTLSDACCywypc7/qlVvam7UYyzxt20tWpTSwb7whVGNRyLxl0f/vz//fwCrZi/EiHIsaY2LKRDKrKvZ6ed/AACUmqOsOC7MVzHmy9EaVpHSpZloMyHMdzDKOgomK2SRJwu0eGh5gpAphrAwea5pV1eeg3vw1pGjiIBYUlRRWm3qZzNXYnRMSnakm5qXQxtsYVznbEwqaqn+oR7/AACtaS33qmyWNBHC6tO2usR0JxC/vz9qGxJH0uu5aBh/fwCxnKe6VjXGSRBGOm3aWJNGHBsqUnG4hGvLm4z//wC4gkL//38wAw22ajEcOnGuLQyaMxp6tejkt6yHRzKbVyuVVSidZTZyUZhtNB5oLSh9JBGnZzVGwt27WktSZ4Pvu4+rWyxWPJAwxJg5tOQmmL4pcpLTl3mdoamOqNGU7MWqAADy4bW/Pz+qOBS+dTalOxOlMxIaU3uzPRMiDgz//6qvRxkgHS+6RA68RwsMEBwAADmoSiSvWB+wXhcgk5HAAAABAHRSTlMe//9m/9j/Tf/n//P/BP/////+r///Fv///0////////8Et//uuf//sf////8bBf8D////z/26//4A/v7+/v7+Av/s//7+//7///7///P//v//////uv3//v7//////////v//BP////7/BAP/Bf/+/wP6k7D+//6q/f///P////////7//wP/+v////9T+wQC//7/Uf//Av/9/v/////9/v9s//////+r/6v///7///9q/////gGY/2v//zkEMf+zAv//zf/////9/wGuAhGt//P0////av+R////SXT/////b////////////wP/BPv/to3/1P8DkP+l0/8EiZmuAjL2cAAACk1JREFUeNqlmAlcE1cexxHE+76t9r6Pva+ZHJNOEyYREhKSlJxAAkIC0gRBZOUQEBAERRFwOb2PdT3X+1rvq1artnW12ktrq223tfe5bff/3syQmZBgXX98eJmZ9/9/5///v/fmiiB5LSA/1x29NoYkzxwif6EOnSHJMdeO6j4HZ14R/MYU8h5d69IN9WfhyG9/GW82SfYdWb9haVlFE7gHA18iH6lobT1fEz8XIf92exyYRIysj68539ra9mUgRB74AtkUXVFRNmKETq9f8iPav40mk+SP+fX6pSNay8r8bfvI/wQBZ5MPbfBXvN3ZOagmPz8/ej9y6Jm3PxoM21Z0nhpU4c//BuUvBO4gX67Z6vdXDFK1LyxWKCTFTT0TJ5NNxRKForifSvX2I363tSZ4UKaQb+Rb3X73a6p2pVsN0vUlB2dlZc2fP3j+/KlTZ0/9+mtopk5Fu3D4QXL5DGTkrWtXveYHYP5+nsT9fEJ+o7dudbv7qeJUyhq1esaMGct7inA5GKjVbUown+R2b7XmR/EZRfAlfAKAfn/rwObOU16dTvdc8ZFLb0bl5eXtzDs9bdrBaadPQzPtdB5W1KW24ud0xTrvqc5mb5nfv9Wq/4nMEgGfJaPr/e7cWFA8Vgwvmy0mRiqTQmOTxqTabKl8B9iAXewDsbG5NW31T/Cj0jUPo2tiC2JiUlOlIsmlNolMKsf/Enanm+AUuTUPkWfEwDGvxP9JGkoIJpXx/wANpZj4z/ipzQNfzi0IbYtBQmjIsxbkiqdNBDmvQBpGcgSSx8fL4YTyMCeVS2P6csuZBc4nd4YFSjEos7AHHqjgTW6YWeBUclpMeGMgxRBEphyzwyhm522BgXDkiIeI8m6hB854ifxXKCD2kXPCu/AXv5bA+jie7xBY8MA8EfBB8qxNIpHJA4ZSDgzNnDiC15McrKublUwmsYlTnk0elCkCRKl8SUPDp1wghYRAcThIqb6hoWEJ1w/TQCJRyLrVMFUQXsPlpxcvvjJOKg6PFaqkfHHG4sVPX/5UEGRqXnANA0D5uMVLoNXr5fHdcKDxmfGoTy5vuHwxQEydJgIuyPoZ4mZTll68yNYnppAIo8I5UpzrhQb0izwlsp+zBouW3kGZRMaVcAkUWb4rM47oSYVz6rEpPyiynwRLbwf5qzejpSwOconfdbWwZxrHzJyDqRgp/eO1FwDEAs+Q0QW5cG2bk5mZWfiLWIFRjysEpzlwbcwtOIsvifgeHKGXLRRY0cY1ZvMWR3J4DmthpAWHcm2JKFcEnELOk0kCQEe2Qes0m51arZkOjbM7tdnYwuDc3HVwukQSQR7CwMnkbomCB9qzDWZjCk3TKSmH12hLQvG2aNccTkEmSqPT4ORPOl0huQddwTBwuVrNAY2G7M3Aoimk0sPZ67rhKKczqb0U9dIA7a81cEFOV6vfEABnsECHwYxoBJFsb/nAnky1O7cEA51jSyna3tJih8ErpelmpyGJBc5Q90XPIxH4sYYD2hFPRRDDzEwlwzDZG2kqY7OY5zNT9vUe3L0eRi05JcWpTeaA+zjgFHKfbumL6GC2VonCK2GKNGlpJsuyIsahdIqniZMuqSxKg95lyyoZB1SATtKaUY93qS4CP5HhO9QtDHQYJmCewZRmYhhPC73XVWn0JQmBxv4llRroNFTTdLnJYETEgThpr+7L/77ETewF5O7zCOh0pgAvqTLNYgAXO5pvaRajUZRxOaMx/MAY8GD1MjEwxqpmLdrznt+Nb1P8Wu4P9TD4SqFHYzFVl/zAeCjsMzxdCKSqTZZ0o4cxONDevWmWdHTWNVqwHSm6jT5LPooyRqFDgEUOmslm8ATTzFw2Vgg0WyxmKvtbphrtrTz3B2RFGVE2fyV/LQI+D7X7KgWsyhkX1MhkMq1fBDsGV5pZCDSdMzHfZps0mr0EsZdxzaxEoR5GAf8dIEHAajz+G4tmWjwecHH1Gr3RAz7rhTVMP2fxIJ6rcXS5hhleW7QSDiq/MqIIuwF9WlTC9ZZGDVL6ycZGl4Y5WbtRCHR1pGejXlfjjZMa5ikWmIJWSwhgfxxh+fDVLo1rkysdNNzD3NhWLgSurz2p2cR2ajxM4+oilHKSQRkyZRU7KJbV25b1en1Tusbigb+qjg+EwJUdq9Nwp8bj8Vjev78IDZ0RjXIIILEO1Z/SbOtd+5cJvY5pLBaTadV7LlizlKpOqVSqwI3uqNr27oTXj2lMFgtz470ODV5gJQQVEpiMJ7PDUjXqw17vHoPlZVo9aqiRoFe43dNv3rw53b1QRZSveovtXGaqreptQTk5UIChagjp/gZVcd3QA/eN6jVz5szaVb2HvkNQRzbM3bXrambmrgSrl6CequrqvL8IXS/rtEoIMDSQsJtRjBu/qDpwYOJbb91X1fEOXA+OWK1zsazWtyki+Z1VEw9M7N37vd7bitD0ThpXR4SNELxLjBBki+uLPlVVqxpr8YB0lt1yW0HuW2VKVOSWxtXvvz+045wL8qV9PgrzQtYQK9muBAO7ceXKlr3cIZX3FQR8ZYWKO6vdWF7uoNFGEpwe88JFGEbeig0bKlaE7KK43+AI++OjOZNAOaI7sx35UCvajqzAzg6KpVDoV/UatqfCRjgpoR8YJCSohPcQ9vJVzd5cfNlUoCsngdUkVMZ/hADGJUzCSrgqAK7Rmh32pOqMjOoku2OsVnjtmcTbq8IAIWP2jMKcjScytKAMaE9oM074BF0qzjwHFSAkENZYTk6OSlT05IyMjCsjysq83guwlUELh4M1jwNeOGAoGU8MclsHWWfNmuW9ovWJePxWuBqGka9sFquEC8EPElSX7mgeOgZ6p4O8A40BUOCHIu4YSFB2o8/nC36+wxz2985SDrM6KJG6RfhoWGecFrUItdAsCqTLBcjp+SDgQEqFFRdHiYEDjlNEv0hiGDz97hny0UdDFmEOFxbnBKJGCoFTyL6JsV16UfTgOuB3keMfjqTuLSxY+/tn+lx/ZhG7jjFP+VjAK3EfeagL+AkZlbod3t5s26HdLk2sEwD7RR5/ODJy/Ktrn4wb0ufe0df3EHyIRHNs6nYbklwOHzfmsW/gGJhF/hve/nnZUoXEyH7tkaWR9KtrCwD44eg+w7rq15yYGnCSSaPY72U8UNgnkyYGsj4+ADcAXLvnep8+Q7p4yseFPjYARghSFkaIiLnJ/MIaUApb7aWL4j7+mNrz0TDuWgi8XLGLfJ4gwslklE0WRFR1TTk8nEEi6h4X84KB/5QFSf4p3dPUrnssiCfT3wYIdexUhlPzqdxg3u2BMrksMVGfyEqvh60H2A0kGXyzui1QwovfkoWXJEjwequPCgJK7lKye0TA3ZK7VpNgpbxALlfcbYCKvgIgfIEtvtsAi/ezH7+595QxursMUXEUv0fxwMHk52rFXSAVavVu7ls6F+GCl79XAPL/lVrx56AvnPDd4bNigYE62KHrkFp0lLMt/ox8aYf4kykUtOm7o7rnQGyDW24nsMtu68Tb33/XFPjC/T/v7j3KgYIj1wAAAABJRU5ErkJggg==';

/**
 * Icon for the display category in the toolbox. It renders as a
 * background-image in a 1.25rem box -- about 20 px -- so it is one bold glyph
 * on a tile of the category's own colour, and nothing finer than that.
 * A face, which is what the panel is mostly asked to show.
 * Source artwork: src/assets/mieo/display-icon.svg in the app repo.
 * @type {string}
 */
// eslint-disable-next-line max-len
const displayMenuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDQ4IDQ4Ij48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHJ4PSIxMCIgZmlsbD0iIzkwNERERCIvPjxyZWN0IHg9IjEyIiB5PSIxNCIgd2lkdGg9IjgiIGhlaWdodD0iOSIgcng9IjIuNSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjI4IiB5PSIxNCIgd2lkdGg9IjgiIGhlaWdodD0iOSIgcng9IjIuNSIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik0xMy41IDI5LjUgUTI0IDQwLjUgMzQuNSAyOS41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+';

/**
 * Icon for the speaker category in the toolbox. It renders as a
 * background-image in a 1.25rem box -- about 20 px -- so it is one bold glyph
 * on a tile of the category's own colour, and nothing finer than that.
 * A cone with two waves coming off it.
 * Source artwork: src/assets/mieo/speaker-icon.svg in the app repo.
 * @type {string}
 */
// eslint-disable-next-line max-len
const speakerMenuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDQ4IDQ4Ij48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHJ4PSIxMCIgZmlsbD0iI0VBNTI5RSIvPjxwYXRoIGQ9Ik0xMSAxOWg2bDktOHYyNmwtOS04aC02eiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik0zMSAxOC41IFEzNS41IDI0IDMxIDI5LjUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIzLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxwYXRoIGQ9Ik0zNyAxNCBRNDQgMjQgMzcgMzQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIzLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==';

/**
 * Icon for the sense category in the toolbox. It renders as a
 * background-image in a 1.25rem box -- about 20 px -- so it is one bold glyph
 * on a tile of the category's own colour, and nothing finer than that.
 * Waves coming off a point -- something being picked up.
 * Source artwork: src/assets/mieo/sense-icon.svg in the app repo.
 * @type {string}
 */
// eslint-disable-next-line max-len
const senseMenuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDQ4IDQ4Ij48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHJ4PSIxMCIgZmlsbD0iIzA5OERBNSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMzMiIHI9IjQiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMTUgMjYuNSBRMjQgMTcgMzMgMjYuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTkgMTkuNSBRMjQgMy41IDM5IDE5LjUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIzLjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==';

/**
 * Icon for the robot category in the toolbox. It renders as a
 * background-image in a 1.25rem box -- about 20 px -- so it is one bold glyph
 * on a tile of the category's own colour, and nothing finer than that.
 * A body on two wheels: these blocks are about going somewhere.
 * Source artwork: src/assets/mieo/robot-icon.svg in the app repo.
 * @type {string}
 */
// eslint-disable-next-line max-len
const robotMenuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDQ4IDQ4Ij48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHJ4PSIxMCIgZmlsbD0iIzExOUI0QiIvPjxyZWN0IHg9IjkiIHk9IjE0IiB3aWR0aD0iMzAiIGhlaWdodD0iMTUiIHJ4PSI0LjUiIGZpbGw9IiNmZmYiLz48Y2lyY2xlIGN4PSIxNiIgY3k9IjM0IiByPSI1LjUiIGZpbGw9IiNmZmYiLz48Y2lyY2xlIGN4PSIzMiIgY3k9IjM0IiByPSI1LjUiIGZpbGw9IiNmZmYiLz48L3N2Zz4=';

/**
 * The list of USB device filters, matching the USB-serial chips found on
 * common ESP32 dev boards (CH340, CH9102, CP2102).
 * @readonly
 */
const PNPID_LIST = [
    // CH340
    'USB\\VID_1A86&PID_7523',
    // CH9102
    'USB\\VID_1A86&PID_55D4',
    // CP2102
    'USB\\VID_10C4&PID_EA60'
];

/**
 * Configuration of serialport, matching the MicroPython/esptool REPL baudrate.
 * @readonly
 */
const SERIAL_CONFIG = {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    // openblock-link asserts both of these by default when it opens the port.
    // On an ESP32 they are wired to EN and IO0 through the auto-reset circuit,
    // so asserting them resets the chip (or drops it into the ROM bootloader)
    // and the MicroPython REPL never answers -- Arena mode looks dead while
    // upload still works, because esptool and mpremote drive these lines
    // themselves. The K210 board opts out for the same reason.
    dtr: false,
    rts: false
};

/**
 * Configuration passed through to openblock-link's uploader (see
 * src/upload/esp32MicroPython.js there). "firmware" is the filename of the
 * MicroPython .bin, looked for in firmwares/microPython/, which
 * `npm run fetch:firmwares` fills from openblockcc/openblock-firmwares. The
 * name below is the ESP32 (WROOM-32/32E) generic build that release ships;
 * change it here if that release starts carrying a different one.
 * @readonly
 */
const DIVECE_OPT = {
    type: 'esp32MicroPython',
    firmware: 'ESP32_GENERIC-20250415-v1.25.0.bin'
};

/**
 * Emotion/face names supported by the display.py library (display.NAMES),
 * in its menu display order. Every name has both a static face
 * (display.getface) and an animation (display._animateface).
 * @readonly
 */
const EMOTIONS = [
    'happy', 'neutral', 'shy', 'cry', 'angry', 'surprise',
    'think', 'sleep', 'nerd', 'dude', 'heart', 'disco'
];

/**
 * Light patterns supported by the display.py library (display.PATTERN_NAMES),
 * in its menu order. Each one paints the panel for a few seconds and blanks
 * it again, rather than leaving a face on screen.
 * @readonly
 */
/**
 * Scroll speeds accepted by mieo.showtext (mieo.py _SPEEDS), slowest first.
 * @readonly
 */
const TEXT_SPEEDS = ['slow', 'normal', 'fast'];

const PATTERNS = [
    'rainbow', 'disco', 'party', 'wave', 'chase', 'breathe'
];

/**
 * The built-in sounds, matching the keys of sound.SOUNDS on the board.
 *
 * These are short tunes the board plays on its speaker, not recordings: the
 * Mieo makes sound with a square wave, so it can play a melody but it cannot
 * say anything. Every name here must exist on the board or the block raises
 * at run time rather than when the code is generated.
 * @readonly
 */
const SOUNDS = [
    'beep', 'chirp', 'coin', 'win', 'lose', 'sad',
    'happy', 'sleep', 'startup', 'alarm', 'laser', 'error'
];

/**
 * Playable notes, matching sound.NOTES on the board. Four octaves either side
 * of middle C, which covers nursery tunes without an unwieldy dropdown.
 * @readonly
 */
const NOTES = [
    'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
    'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
    'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5',
    'C6', 'C#6', 'D6', 'D#6', 'E6', 'F6', 'F#6', 'G6', 'G#6', 'A6', 'A#6', 'B6',
    'C7'
];

/**
 * Note lengths, matching sound.DURATIONS. The board works these out from one
 * tempo -- 120 beats a minute -- so a quarter note is half a second.
 * @readonly
 */
const NOTE_DURATIONS = ['Whole', 'Half', 'Quarter', 'Eighth', 'Sixteenth'];

/**
 * The wheels and servos, matching motors.py. The values are what the board
 * calls them; the text is what reads well in a block.
 * @readonly
 */
const DRIVE_DIRECTIONS = [
    {text: 'forward', value: 'forward'},
    {text: 'backward', value: 'backward'},
    {text: 'left', value: 'left'},
    {text: 'right', value: 'right'}
];

/**
 * What ONE motor can be told to do. Deliberately shorter than the list above:
 * left and right are a pair of wheels turning opposite ways, so they mean
 * nothing to a single motor and motors.runmotor would refuse them.
 * @readonly
 */
const MOTOR_DIRECTIONS = [
    {text: 'forward', value: 'forward'},
    {text: 'backward', value: 'backward'}
];
const ORIENTATIONS = [
    {text: 'horizontal', value: 'horizontal'},
    {text: 'vertical', value: 'vertical'}
];
const MOTORS = [
    {text: 'left', value: 'L'},
    {text: 'right', value: 'R'}
];
const SERVOS = [
    {text: 'Servo 1', value: 'S1'},
    {text: 'Servo 2', value: 'S2'}
];

/**
 * Manage communication with an ESP32 MicroPython device.
 * Program mode is upload-only: blocks are compiled into a MicroPython (.py)
 * script rather than executed live, so the block handlers below are no-op
 * stubs kept only so the extension can register cleanly.
 */
class OpenBlockEsp32MicroPythonDevice {
    constructor (runtime, originalDeviceId) {
        this.runtime = runtime;

        // Registers itself with the runtime so scan/connect/disconnect over
        // the serial (COM) port work. Without this the device has no
        // peripheral and every connection attempt silently no-ops.
        this._peripheral = new MieoPeripheral(
            runtime, this.DEVICE_ID, originalDeviceId, PNPID_LIST, SERIAL_CONFIG, DIVECE_OPT
        );

        // Live ("Arena") mode talks to the board's MicroPython REPL over the
        // same serial connection the peripheral already owns.
        this._repl = new MieoRepl(runtime, this._peripheral);

        // Last known sensor readings. Hat blocks are polled every frame by the
        // runtime, so reading the board on each call would put ~30 serial round
        // trips a second on the wire and starve everything else.
        this._sensed = {};
        this._lineKickAt = 0;
        this._lineKickBusy = false;

        // A reading taken before an unplug or a mode switch must not linger:
        // an edge-activated hat only fires on false -> true, so a stale `true`
        // would stop that hat ever firing again.
        this.runtime.on('PROGRAM_MODE_UPDATE', () => this._forgetSensed());
        this.runtime.on('PERIPHERAL_DISCONNECTED', () => this._forgetSensed());

        // The stop button has to stop the robot, not just the script. Motor
        // duty is latched in the chip's PWM hardware: once set it keeps the
        // wheels turning with no code running at all, so ending the project
        // without saying so leaves the robot driving off the table.
        this.runtime.on('PROJECT_STOP_ALL', () => {
            this._lineKickAt = 0;
            this._lineKickBusy = false;
            this._forgetSensed();
            if (this._peripheral.isConnected() && this.runtime.isRealtimeMode()) {
                // stoplinefollower stops the board's own line-following
                // timer as well as the wheels; a bare stoprobot would leave
                // the timer driving them again 10 ms later.
                this._repl.abort('mieo.stoplinefollower()').catch(() => {});
            }
        });

        this.whenMieoStartsUp = this.whenMieoStartsUp.bind(this);
        this.showPattern = this.showPattern.bind(this);
        this.showPatternUntilDone = this.showPatternUntilDone.bind(this);
        this.showText = this.showText.bind(this);
        this.showMatrix = this.showMatrix.bind(this);
        this.setLed = this.setLed.bind(this);
        this.turnOffLed = this.turnOffLed.bind(this);
        this.clearScreen = this.clearScreen.bind(this);
        this.setDisplayBrightness = this.setDisplayBrightness.bind(this);
        this.rgb = this.rgb.bind(this);
        this.whenButtonPressed = this.whenButtonPressed.bind(this);
        this.isButtonPressed = this.isButtonPressed.bind(this);
        this.isIrActive = this.isIrActive.bind(this);
        this.getIrValue = this.getIrValue.bind(this);
        this.setIrThreshold = this.setIrThreshold.bind(this);
        this.whenTouched = this.whenTouched.bind(this);
        this.isTouched = this.isTouched.bind(this);
        this.connectUltrasonic = this.connectUltrasonic.bind(this);
        this.getUltrasonicDistance = this.getUltrasonicDistance.bind(this);
        this.readAnalogSensor = this.readAnalogSensor.bind(this);
        this.readDigitalSensor = this.readDigitalSensor.bind(this);
        this.readDigitalPin = this.readDigitalPin.bind(this);
        this.readAnalogPin = this.readAnalogPin.bind(this);
        this.setDigitalPin = this.setDigitalPin.bind(this);
        this.setPwmPin = this.setPwmPin.bind(this);
        this.setBluetoothIndicator = this.setBluetoothIndicator.bind(this);
        this.displayFace = this.displayFace.bind(this);
        this.displayFaceAnimation = this.displayFaceAnimation.bind(this);
        this.displayFaceAnimationUntilDone = this.displayFaceAnimationUntilDone.bind(this);
        this.playSound = this.playSound.bind(this);
        this.playSoundUntilDone = this.playSoundUntilDone.bind(this);
        this.playTone = this.playTone.bind(this);
        this.playFreq = this.playFreq.bind(this);
        this.stopSound = this.stopSound.bind(this);
        this.goDirection = this.goDirection.bind(this);
        this.goForSeconds = this.goForSeconds.bind(this);
        this.stopRobot = this.stopRobot.bind(this);
        this.setRobotOrientation = this.setRobotOrientation.bind(this);
        this.runMotor = this.runMotor.bind(this);
        this.stopMotor = this.stopMotor.bind(this);
        this.runBothMotors = this.runBothMotors.bind(this);
        this.setServo = this.setServo.bind(this);
        this.setLineParameters = this.setLineParameters.bind(this);
        this.doLineFollowing = this.doLineFollowing.bind(this);
    }

    /**
     * Called by the runtime when user wants to upload code to a peripheral.
     * @param {string} code - the code want to upload.
     */
    upload (code) {
        // Note: nothing actually dispatches this -- the upload button goes
        // through runtime.uploadToPeripheral -> the *peripheral*. Kept to match
        // the other devices. The live session is dropped off
        // PERIPHERAL_DISCONNECTED instead, which the link does fire before it
        // hands the port to mpremote.
        return this._peripheral.upload(code);
    }

    /**
     * @return {string} - the ID of this extension.
     */
    get DEVICE_ID () {
        return 'mieo';
    }

    /**
     * @return {Array} - menu of emotion/face names from display.py.
     */
    get EMOTION_MENU () {
        return EMOTIONS.map(name => ({text: name, value: name}));
    }

    /** @return {Array} - the two buttons. */
    get BUTTON_MENU () {
        return [{text: 'L', value: 'L'}, {text: 'R', value: 'R'}];
    }

    /** @return {Array} - the two IR sensors. */
    get IR_MENU () {
        return ['IR-L', 'IR-R'].map(n => ({text: n, value: n}));
    }

    /** @return {Array} - the four touch pads. */
    get TOUCH_MENU () {
        return ['T1', 'T2', 'T3', 'T4'].map(n => ({text: n, value: n}));
    }

    /**
     * @return {Array} - every pin that can be read or driven as a digital one.
     *
     * D1 and D2 are also the I2C pair, and S1 and S2 are the servo headers, so
     * all four are shared rather than exclusively a digital pin -- driving one
     * takes it away from whatever else was using it. A1 is missing on purpose:
     * gpio39 has no output driver and is an analog input only. The touch pins
     * are missing too, and two of them (gpio12 and gpio15) are watched by the
     * chip at power on, where a pin held high or low can stop the board
     * booting -- not something a block should be able to do by accident.
     */
    get DIGITAL_PIN_MENU () {
        return ['D1', 'D2', 'D3', 'S1', 'S2', 'A2', 'A3'].map(n => ({text: n, value: n}));
    }

    /** @return {Array} - the analog input pins. */
    get ANALOG_PIN_MENU () {
        return ['A1', 'A2', 'A3'].map(n => ({text: n, value: n}));
    }

    /**
     * @return {Array} - what to drive a digital pin to. The values are the
     * numbers pins.digitalwrite wants, so the block passes them straight on.
     */
    get DIGITAL_LEVEL_MENU () {
        return [{text: 'HIGH', value: '1'}, {text: 'LOW', value: '0'}];
    }

    /** @return {Array} - whether the Bluetooth lamp is wanted. */
    get INDICATOR_STATE_MENU () {
        return [{text: 'enable', value: 'enable'}, {text: 'disable', value: 'disable'}];
    }

    /**
     * @return {Array} - pins an ultrasonic can be wired to.
     *
     * A1 is left out on purpose. It is GPIO39, which is input only on the
     * ESP32: it could carry echo but never trig, so offering it here would
     * invite a wiring that only half works. mieo.connectultrasonic still
     * refuses it as trig, in case a hand-edited project asks.
     */
    get SONAR_PIN_MENU () {
        return ['D1', 'D2', 'D3', 'S1', 'S2', 'A2', 'A3']
            .map(n => ({text: n, value: n}));
    }

    /** @return {Array} - which ultrasonic is being talked about. */
    get SONAR_MENU () {
        return ['1', '2'].map(n => ({text: n, value: n}));
    }

    /**
     * @return {Array} - what is plugged into an analog pin. The reading is the
     * same whichever is chosen; the name is there so a script says what it means.
     */
    get ANALOG_KIND_MENU () {
        return [
            {text: 'light / photoresistor', value: 'light'},
            {text: 'potentiometer', value: 'potentiometer'},
            {text: 'sound', value: 'sound'},
            {text: 'moisture', value: 'moisture'},
            {text: 'other', value: 'other'}
        ];
    }

    /** @return {Array} - what is plugged into a digital pin. */
    get DIGITAL_KIND_MENU () {
        return [
            {text: 'PIR', value: 'PIR'},
            {text: 'button', value: 'button'},
            {text: 'magnetic / reed', value: 'reed'},
            {text: 'IR obstacle', value: 'obstacle'},
            {text: 'other', value: 'other'}
        ];
    }

    /**
     * @return {Array} - column numbers, 1-7 left to right.
     */
    get LED_X_MENU () {
        return ['1', '2', '3', '4', '5', '6', '7'].map(n => ({text: n, value: n}));
    }

    /**
     * @return {Array} - row numbers, 1-5 top to bottom.
     */
    get LED_Y_MENU () {
        return ['1', '2', '3', '4', '5'].map(n => ({text: n, value: n}));
    }

    /**
     * @return {Array} - menu of scroll speeds for showtext.
     */
    get TEXT_SPEED_MENU () {
        return TEXT_SPEEDS.map(name => ({text: name, value: name}));
    }

    /**
     * @return {Array} - menu of light pattern names from display.py.
     */
    get PATTERN_MENU () {
        return PATTERNS.map(name => ({text: name, value: name}));
    }

    /** @return {Array} - menu of built-in sounds from sound.py. */
    get SOUND_MENU () {
        return SOUNDS.map(name => ({text: name, value: name}));
    }

    /** @return {Array} - menu of playable notes. */
    get NOTE_MENU () {
        return NOTES.map(name => ({text: name, value: name}));
    }

    /** @return {Array} - menu of note lengths. */
    get DURATION_MENU () {
        return NOTE_DURATIONS.map(name => ({text: name, value: name}));
    }

    /** @return {Array} - how the whole robot can drive. */
    get DRIVE_DIRECTION_MENU () {
        return DRIVE_DIRECTIONS.slice();
    }

    /** @return {Array} - how one wheel can turn. */
    get MOTOR_DIRECTION_MENU () {
        return MOTOR_DIRECTIONS.slice();
    }

    /** @return {Array} - which way up the board is mounted. */
    get ORIENTATION_MENU () {
        return ORIENTATIONS.slice();
    }

    /** @return {Array} - the two wheels. */
    get MOTOR_MENU () {
        return MOTORS.slice();
    }

    /** @return {Array} - the two servo headers. */
    get SERVO_MENU () {
        return SERVOS.slice();
    }

    /**
     * Get info of the peripheral.
     * @return {Array} - array of category objects with blocks.
     */
    getInfo () {
        return [
            {
                id: 'mieo',
                name: formatMessage({
                    id: 'esp32MicroPython.category.mieo',
                    default: 'Mieo',
                    description: 'The name of the Mieo event category'
                }),
                menuIconURI: mieoMenuIconURI,
                // Sunset orange. The category a project starts in.
                color1: '#EE5B21',
                color2: '#D94910',
                color3: '#BB3F0E',

                blocks: [
                    {
                        opcode: 'whenMieoStartsUp',
                        text: formatMessage({
                            id: 'esp32MicroPython.mieo.whenMieoStartsUp',
                            default: 'when mieo starts up',
                            description: 'esp32 MicroPython Mieo startup event hat block'
                        }),
                        blockType: BlockType.HAT,
                        arguments: {},
                        // The hat is what the generator hangs main.py off, so
                        // it means nothing in Arena mode -- but grey it out
                        // rather than hiding it, so it does not look like the
                        // block vanished when the mode is switched.
                        disabledInProgramMode: [ProgramModeType.REALTIME]
                    },
                    '---',
                    {
                        opcode: 'readDigitalPin',
                        text: formatMessage({
                            id: 'esp32MicroPython.mieo.readDigitalPin',
                            default: 'read state of digital pin [PIN]',
                            description: 'esp32 MicroPython read the state of a digital pin'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'digitalPin',
                                defaultValue: 'D1'
                            }
                        }
                    },
                    {
                        opcode: 'readAnalogPin',
                        text: formatMessage({
                            id: 'esp32MicroPython.mieo.readAnalogPin',
                            default: 'read analog pin [PIN]',
                            description: 'esp32 MicroPython read an analog pin'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'analogPin',
                                defaultValue: 'A1'
                            }
                        }
                    },
                    {
                        opcode: 'setDigitalPin',
                        text: formatMessage({
                            id: 'esp32MicroPython.mieo.setDigitalPin',
                            default: 'set digital pin [PIN] output as [LEVEL]',
                            description: 'esp32 MicroPython drive a digital pin high or low'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'digitalPin',
                                defaultValue: 'D1'
                            },
                            LEVEL: {
                                type: ArgumentType.STRING,
                                menu: 'digitalLevel',
                                defaultValue: '1'
                            }
                        }
                    },
                    {
                        opcode: 'setPwmPin',
                        text: formatMessage({
                            id: 'esp32MicroPython.mieo.setPwmPin',
                            default: 'set PWM pin [PIN] output as [OUT]',
                            description: 'esp32 MicroPython drive a pin with PWM'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'digitalPin',
                                defaultValue: 'D1'
                            },
                            // 0-255, the number anyone who has met an Arduino
                            // expects. mieo.setpwm scales it to the 0-1023 the
                            // board itself wants.
                            OUT: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 255
                            }
                        }
                    },
                    {
                        opcode: 'setBluetoothIndicator',
                        text: formatMessage({
                            id: 'esp32MicroPython.mieo.setBluetoothIndicator',
                            default: '[STATE] Bluetooth indicator',
                            description: 'esp32 MicroPython switch the Bluetooth lamp on the first pixel'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            STATE: {
                                type: ArgumentType.STRING,
                                menu: 'indicatorState',
                                defaultValue: 'enable'
                            }
                        }
                    }
                ],
                menus: {
                    digitalPin: {
                        items: this.DIGITAL_PIN_MENU
                    },
                    analogPin: {
                        items: this.ANALOG_PIN_MENU
                    },
                    digitalLevel: {
                        items: this.DIGITAL_LEVEL_MENU
                    },
                    indicatorState: {
                        items: this.INDICATOR_STATE_MENU
                    }
                }
            },
            {
                id: 'display',
                name: formatMessage({
                    id: 'esp32MicroPython.category.display',
                    default: 'Display',
                    description: 'The name of the ESP32 MicroPython display category'
                }),
                menuIconURI: displayMenuIconURI,
                // Deep grape. The light panel.
                color1: '#904DDD',
                color2: '#7A2AD6',
                color3: '#6923B9',

                blocks: [
                    {
                        opcode: 'displayFace',
                        text: formatMessage({
                            id: 'esp32MicroPython.display.displayFace',
                            default: 'show [EMOTION]',
                            description: 'esp32 MicroPython show a static face on the display'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            EMOTION: {
                                type: ArgumentType.STRING,
                                menu: 'emotion',
                                defaultValue: 'happy'
                            }
                        }
                    },
                    {
                        opcode: 'displayFaceAnimation',
                        text: formatMessage({
                            id: 'esp32MicroPython.display.displayFaceAnimation',
                            default: 'show [EMOTION] animation',
                            description: 'esp32 MicroPython play a face animation on the display'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            EMOTION: {
                                type: ArgumentType.STRING,
                                menu: 'emotion',
                                defaultValue: 'happy'
                            }
                        }
                    },
                    {
                        opcode: 'displayFaceAnimationUntilDone',
                        text: formatMessage({
                            id: 'esp32MicroPython.display.displayFaceAnimationUntilDone',
                            default: 'show [EMOTION] animation until done',
                            description: 'esp32 MicroPython play a face animation and wait for it'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            EMOTION: {
                                type: ArgumentType.STRING,
                                menu: 'emotion',
                                defaultValue: 'happy'
                            }
                        }
                    },
                    {
                        opcode: 'showPattern',
                        text: formatMessage({
                            id: 'esp32MicroPython.display.showPattern',
                            default: 'show [PATTERN] pattern',
                            description: 'esp32 MicroPython play a light pattern on the display'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PATTERN: {
                                type: ArgumentType.STRING,
                                menu: 'pattern',
                                defaultValue: 'rainbow'
                            }
                        }
                    },
                    {
                        opcode: 'showPatternUntilDone',
                        text: formatMessage({
                            id: 'esp32MicroPython.display.showPatternUntilDone',
                            default: 'show [PATTERN] pattern until done',
                            description: 'esp32 MicroPython play a light pattern and wait for it'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PATTERN: {
                                type: ArgumentType.STRING,
                                menu: 'pattern',
                                defaultValue: 'rainbow'
                            }
                        }
                    },
                    {
                        opcode: 'showText',
                        text: formatMessage({
                            id: 'esp32MicroPython.display.showText',
                            default: 'show [TEXT] with a [COLOR] at speed [SPEED]',
                            description: 'esp32 MicroPython scroll a message across the display'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            TEXT: {
                                type: ArgumentType.STRING,
                                defaultValue: 'robolab'
                            },
                            COLOR: {
                                type: ArgumentType.COLOR,
                                defaultValue: '#FFC800'
                            },
                            SPEED: {
                                type: ArgumentType.STRING,
                                menu: 'textSpeed',
                                defaultValue: 'normal'
                            }
                        }
                    },
                    {
                        opcode: 'showMatrix',
                        text: formatMessage({
                            id: 'esp32MicroPython.display.showMatrix',
                            default: 'show matrix as [MATRIX]',
                            description: 'esp32 MicroPython show a painted 7x5 pattern'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            // 7x5 painter matching the panel. 35 characters, row by
                            // row from the top left: '0' is off and '1'-'9' index the
                            // painter's palette, so every pixel carries its own colour
                            // and no separate colour picker is needed. The default
                            // belongs here rather than in the matrix7x5 block json --
                            // Blockly.Field's constructor calls setValue() before the
                            // matrix field has assigned width_/height_/zeros_, so a
                            // json default throws and takes the whole flyout with it.
                            MATRIX: {
                                type: ArgumentType.MATRIX7X5,
                                defaultValue: '01101100110110000000010000010111110'
                            }
                        }
                    },
                    {
                        opcode: 'setLed',
                        text: formatMessage({
                            id: 'esp32MicroPython.display.setLed',
                            default: 'set LED x [X] y [Y] to [COLOR] with brightness [BRIGHTNESS] %',
                            description: 'esp32 MicroPython light one pixel of the display'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            X: {
                                type: ArgumentType.STRING,
                                menu: 'ledX',
                                defaultValue: '1'
                            },
                            Y: {
                                type: ArgumentType.STRING,
                                menu: 'ledY',
                                defaultValue: '1'
                            },
                            COLOR: {
                                type: ArgumentType.COLOR,
                                defaultValue: '#00CCCC'
                            },
                            BRIGHTNESS: {
                                type: ArgumentType.NUMBER,
                                // 30, the same figure the panel starts at, so
                                // a new block is not a glaring pixel.
                                defaultValue: 30
                            }
                        }
                    },
                    {
                        opcode: 'turnOffLed',
                        text: formatMessage({
                            id: 'esp32MicroPython.display.turnOffLed',
                            default: 'turn off LED x [X] y [Y]',
                            description: 'esp32 MicroPython turn one pixel off'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            X: {
                                type: ArgumentType.STRING,
                                menu: 'ledX',
                                defaultValue: '1'
                            },
                            Y: {
                                type: ArgumentType.STRING,
                                menu: 'ledY',
                                defaultValue: '1'
                            }
                        }
                    },
                    {
                        opcode: 'clearScreen',
                        text: formatMessage({
                            id: 'esp32MicroPython.display.clearScreen',
                            default: 'clear screen',
                            description: 'esp32 MicroPython blank the display'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {}
                    },
                    {
                        opcode: 'setDisplayBrightness',
                        text: formatMessage({
                            id: 'esp32MicroPython.display.setDisplayBrightness',
                            default: 'set display brightness to [BRIGHTNESS]',
                            description: 'esp32 MicroPython set the panel brightness'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            BRIGHTNESS: {
                                type: ArgumentType.NUMBER,
                                // The same value the panel starts at, so the
                                // block shows what the board is already doing
                                // rather than a number that changes it.
                                defaultValue: 30
                            }
                        }
                    },
                    {
                        // A reporter, not a command: it produces a colour to drop
                        // into any of the colour slots above, so colours outside
                        // the picker's swatches are reachable.
                        opcode: 'rgb',
                        text: formatMessage({
                            id: 'esp32MicroPython.display.rgb',
                            default: 'set R [R] G [G] B [B]',
                            description: 'esp32 MicroPython build a colour from red, green and blue'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            R: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 170
                            },
                            G: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 80
                            },
                            B: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 244
                            }
                        }
                    }
                ],
                menus: {
                    emotion: {
                        items: this.EMOTION_MENU
                    },
                    pattern: {
                        items: this.PATTERN_MENU
                    },
                    textSpeed: {
                        items: this.TEXT_SPEED_MENU
                    },
                    ledX: {
                        items: this.LED_X_MENU
                    },
                    ledY: {
                        items: this.LED_Y_MENU
                    }
                }
            },
            {
                id: 'speaker',
                name: formatMessage({
                    id: 'esp32MicroPython.category.speaker',
                    default: 'Speaker',
                    description: 'The name of the Mieo speaker category'
                }),
                menuIconURI: speakerMenuIconURI,
                // Bubblegum pink. Sound.
                color1: '#EA529E',
                color2: '#E52A88',
                color3: '#D01A75',

                blocks: [
                    {
                        opcode: 'playSound',
                        text: formatMessage({
                            id: 'esp32MicroPython.speaker.playSound',
                            default: 'play sound [SOUND]',
                            description: 'start a built-in sound and carry on'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            SOUND: {
                                type: ArgumentType.STRING,
                                menu: 'sound',
                                defaultValue: 'happy'
                            }
                        }
                    },
                    {
                        opcode: 'playSoundUntilDone',
                        text: formatMessage({
                            id: 'esp32MicroPython.speaker.playSoundUntilDone',
                            default: 'play sound [SOUND] until done',
                            description: 'play a built-in sound and wait for it to end'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            SOUND: {
                                type: ArgumentType.STRING,
                                menu: 'sound',
                                defaultValue: 'happy'
                            }
                        }
                    },
                    {
                        opcode: 'playTone',
                        text: formatMessage({
                            id: 'esp32MicroPython.speaker.playTone',
                            default: 'play tone of note [NOTE] with duration [DURATION]',
                            description: 'play one note for one note-length'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            NOTE: {
                                type: ArgumentType.STRING,
                                menu: 'note',
                                defaultValue: 'C4'
                            },
                            DURATION: {
                                type: ArgumentType.STRING,
                                menu: 'duration',
                                defaultValue: 'Eighth'
                            }
                        }
                    },
                    {
                        opcode: 'playFreq',
                        text: formatMessage({
                            id: 'esp32MicroPython.speaker.playFreq',
                            default: 'play freq [FREQ] Hz for duration [MS] ms',
                            description: 'play a frequency for a number of milliseconds'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            FREQ: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 1000
                            },
                            MS: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 200
                            }
                        }
                    },
                    {
                        opcode: 'stopSound',
                        text: formatMessage({
                            id: 'esp32MicroPython.speaker.stopSound',
                            default: 'stop sound',
                            description: 'silence the speaker'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {}
                    }
                ],
                menus: {
                    sound: {
                        items: this.SOUND_MENU
                    },
                    note: {
                        items: this.NOTE_MENU
                    },
                    duration: {
                        items: this.DURATION_MENU
                    }
                }
            },
            {
                id: 'robot',
                name: formatMessage({
                    id: 'esp32MicroPython.category.robot',
                    default: 'Robot',
                    description: 'The name of the Mieo robot category'
                }),
                menuIconURI: robotMenuIconURI,
                // Grass green. Going somewhere.
                color1: '#119B4B',
                color2: '#0F8540',
                color3: '#0D7337',

                blocks: [
                    {
                        blockType: BlockType.LABEL,
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.headingRobot',
                            default: 'Robot',
                            description: 'heading above the whole-robot blocks'
                        })
                    },
                    {
                        opcode: 'goDirection',
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.goDirection',
                            default: 'go [DIRECTION] at [SPEED] % speed',
                            description: 'drive both wheels and keep going'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            DIRECTION: {
                                type: ArgumentType.STRING,
                                menu: 'driveDirection',
                                defaultValue: 'forward'
                            },
                            SPEED: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 100
                            }
                        }
                    },
                    {
                        opcode: 'goForSeconds',
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.goForSeconds',
                            default: 'go [DIRECTION] at [SPEED] % speed for [SECONDS] seconds',
                            description: 'drive for a while, then stop'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            DIRECTION: {
                                type: ArgumentType.STRING,
                                menu: 'driveDirection',
                                defaultValue: 'forward'
                            },
                            SPEED: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 100
                            },
                            SECONDS: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 1
                            }
                        }
                    },
                    {
                        opcode: 'stopRobot',
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.stopRobot',
                            default: 'stop robot',
                            description: 'stop both wheels'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {}
                    },
                    {
                        opcode: 'setRobotOrientation',
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.setRobotOrientation',
                            default: 'set robot orientation as [ORIENTATION]',
                            description: 'say which way up the board is mounted'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            ORIENTATION: {
                                type: ArgumentType.STRING,
                                menu: 'orientation',
                                defaultValue: 'horizontal'
                            }
                        }
                    },
                    {
                        blockType: BlockType.LABEL,
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.headingLineFollower',
                            default: 'Line Follower',
                            description: 'heading above the line following blocks'
                        })
                    },
                    {
                        opcode: 'setLineParameters',
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.setLineParameters',
                            default: 'set line follower speed [F] % left threshold [T1] right threshold [T2]',
                            description: 'set up the line follower'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            F: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 60
                            },
                            T1: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 1700
                            },
                            T2: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 2200
                            }
                        }
                    },
                    {
                        opcode: 'doLineFollowing',
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.doLineFollowing',
                            default: 'do line following',
                            description: 'steer along the line; run what is inside at a cross'
                        }),
                        // A conditional, not a loop: it steers once and hands
                        // back. What is inside runs only when both sensors go
                        // dark together -- a junction or a finish bar -- which
                        // is the moment following the line stops meaning
                        // anything. Put it inside a forever block to drive.
                        blockType: BlockType.CONDITIONAL,
                        arguments: {}
                    },
                    {
                        blockType: BlockType.LABEL,
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.headingMotor',
                            default: 'Motor',
                            description: 'heading above the single-motor blocks'
                        })
                    },
                    {
                        opcode: 'runMotor',
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.runMotor',
                            default: 'run [MOTOR] motor [DIRECTION] with [SPEED] % speed',
                            description: 'drive one wheel'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            MOTOR: {
                                type: ArgumentType.STRING,
                                menu: 'motor',
                                defaultValue: 'L'
                            },
                            DIRECTION: {
                                type: ArgumentType.STRING,
                                menu: 'motorDirection',
                                defaultValue: 'forward'
                            },
                            SPEED: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 100
                            }
                        }
                    },
                    {
                        opcode: 'stopMotor',
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.stopMotor',
                            default: 'stop [MOTOR] motor',
                            description: 'stop one wheel'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            MOTOR: {
                                type: ArgumentType.STRING,
                                menu: 'motor',
                                defaultValue: 'L'
                            }
                        }
                    },
                    {
                        opcode: 'runBothMotors',
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.runBothMotors',
                            default: 'run motor 1 [SPEED1] % motor 2 [SPEED2] %',
                            description: 'both wheels at once, each signed'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            SPEED1: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 50
                            },
                            SPEED2: {
                                type: ArgumentType.NUMBER,
                                defaultValue: -50
                            }
                        }
                    },
                    {
                        opcode: 'setServo',
                        text: formatMessage({
                            id: 'esp32MicroPython.robot.setServo',
                            default: 'set servo on [SERVO] to [ANGLE] angle',
                            description: 'point a servo at an angle'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            SERVO: {
                                type: ArgumentType.STRING,
                                menu: 'servo',
                                defaultValue: 'S1'
                            },
                            ANGLE: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 30
                            }
                        }
                    }
                ],
                menus: {
                    driveDirection: {
                        items: this.DRIVE_DIRECTION_MENU
                    },
                    motorDirection: {
                        items: this.MOTOR_DIRECTION_MENU
                    },
                    orientation: {
                        items: this.ORIENTATION_MENU
                    },
                    motor: {
                        items: this.MOTOR_MENU
                    },
                    servo: {
                        items: this.SERVO_MENU
                    }
                }
            },
            {
                id: 'sense',
                name: formatMessage({
                    id: 'esp32MicroPython.category.sense',
                    default: 'Sense',
                    description: 'The name of the Mieo sensing category'
                }),
                menuIconURI: senseMenuIconURI,
                // Ocean teal. Looking and listening.
                color1: '#098DA5',
                color2: '#077A8E',
                color3: '#06697A',

                blocks: [
                    {
                        blockType: BlockType.LABEL,
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.buttonHeading',
                            default: 'Button',
                            description: 'Heading above the button blocks'
                        })
                    },
                    {
                        opcode: 'whenButtonPressed',
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.whenButtonPressed',
                            default: 'when button [BUTTON] pressed',
                            description: 'Mieo button hat'
                        }),
                        blockType: BlockType.HAT,
                        arguments: {
                            BUTTON: {
                                type: ArgumentType.STRING,
                                menu: 'button',
                                defaultValue: 'L'
                            }
                        },
                        // Greyed out in upload mode rather than hidden, so it is
                        // clear the block exists and simply does not apply there.
                        disabledInProgramMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'isButtonPressed',
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.isButtonPressed',
                            default: 'is button [BUTTON] pressed?',
                            description: 'Mieo button state'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            BUTTON: {
                                type: ArgumentType.STRING,
                                menu: 'button',
                                defaultValue: 'L'
                            }
                        }
                    },
                    {
                        blockType: BlockType.LABEL,
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.irHeading',
                            default: 'Infrared Sensor',
                            description: 'Heading above the IR blocks'
                        })
                    },
                    {
                        opcode: 'isIrActive',
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.isIrActive',
                            default: 'is [IR] IR sensor active?',
                            description: 'Mieo IR state'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            IR: {
                                type: ArgumentType.STRING,
                                menu: 'ir',
                                defaultValue: 'IR-L'
                            }
                        }
                    },
                    {
                        opcode: 'getIrValue',
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.getIrValue',
                            default: 'get value of [IR]',
                            description: 'Mieo IR reading'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            IR: {
                                type: ArgumentType.STRING,
                                menu: 'ir',
                                defaultValue: 'IR-L'
                            }
                        }
                    },
                    {
                        opcode: 'setIrThreshold',
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.setIrThreshold',
                            default: 'set [IR] IR sensor threshold to [THRESHOLD]',
                            description: 'Mieo IR threshold'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            IR: {
                                type: ArgumentType.STRING,
                                menu: 'ir',
                                defaultValue: 'IR-L'
                            },
                            THRESHOLD: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 3000
                            }
                        }
                    },
                    {
                        blockType: BlockType.LABEL,
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.touchHeading',
                            default: 'Touch Sensor',
                            description: 'Heading above the touch blocks'
                        })
                    },
                    {
                        opcode: 'whenTouched',
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.whenTouched',
                            default: 'when [TOUCH] is touched',
                            description: 'Mieo touch hat'
                        }),
                        blockType: BlockType.HAT,
                        arguments: {
                            TOUCH: {
                                type: ArgumentType.STRING,
                                menu: 'touch',
                                defaultValue: 'T1'
                            }
                        }
                    },
                    {
                        opcode: 'isTouched',
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.isTouched',
                            default: 'is [TOUCH] touched?',
                            description: 'Mieo touch state'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            TOUCH: {
                                type: ArgumentType.STRING,
                                menu: 'touch',
                                defaultValue: 'T1'
                            }
                        }
                    },
                    {
                        blockType: BlockType.LABEL,
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.ultrasonicHeading',
                            default: 'Ultrasonic Sensor',
                            description: 'Heading above the ultrasonic blocks'
                        })
                    },
                    {
                        opcode: 'connectUltrasonic',
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.connectUltrasonic',
                            default: 'connect ultrasonic [SONAR] to echo [ECHO] , trig [TRIG]',
                            description: 'Mieo ultrasonic wiring'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            SONAR: {
                                type: ArgumentType.STRING,
                                menu: 'sonar',
                                defaultValue: '1'
                            },
                            ECHO: {
                                type: ArgumentType.STRING,
                                menu: 'sonarPin',
                                defaultValue: 'D1'
                            },
                            TRIG: {
                                type: ArgumentType.STRING,
                                menu: 'sonarPin',
                                defaultValue: 'D2'
                            }
                        }
                    },
                    {
                        opcode: 'getUltrasonicDistance',
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.getUltrasonicDistance',
                            default: 'get ultrasonic [SONAR] distance (cm)',
                            description: 'Mieo ultrasonic reading'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            SONAR: {
                                type: ArgumentType.STRING,
                                menu: 'sonar',
                                defaultValue: '1'
                            }
                        }
                    },
                    {
                        blockType: BlockType.LABEL,
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.otherHeading',
                            default: 'Other Sensors',
                            description: 'Heading above the general pin blocks'
                        })
                    },
                    {
                        opcode: 'readAnalogSensor',
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.readAnalogSensor',
                            default: 'read analog sensor [KIND] at [PIN]',
                            description: 'Mieo analog pin reading'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            KIND: {
                                type: ArgumentType.STRING,
                                menu: 'analogKind',
                                defaultValue: 'light'
                            },
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'analogPin',
                                defaultValue: 'A1'
                            }
                        }
                    },
                    {
                        opcode: 'readDigitalSensor',
                        text: formatMessage({
                            id: 'esp32MicroPython.sense.readDigitalSensor',
                            default: 'read digital sensor [KIND] at [PIN]',
                            description: 'Mieo digital pin reading'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            KIND: {
                                type: ArgumentType.STRING,
                                menu: 'digitalKind',
                                defaultValue: 'PIR'
                            },
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'digitalPin',
                                defaultValue: 'D1'
                            }
                        }
                    }
                ],
                menus: {
                    button: {
                        items: this.BUTTON_MENU
                    },
                    ir: {
                        items: this.IR_MENU
                    },
                    touch: {
                        items: this.TOUCH_MENU
                    },
                    digitalPin: {
                        items: this.DIGITAL_PIN_MENU
                    },
                    analogPin: {
                        items: this.ANALOG_PIN_MENU
                    },
                    sonar: {
                        items: this.SONAR_MENU
                    },
                    sonarPin: {
                        items: this.SONAR_PIN_MENU
                    },
                    analogKind: {
                        items: this.ANALOG_KIND_MENU
                    },
                    digitalKind: {
                        items: this.DIGITAL_KIND_MENU
                    }
                }
            }
        ];
    }

    /**
     * When Mieo starts up - HAT block for setup code.
     *
     * In upload mode the generator hangs main.py off this. In Arena mode the
     * block is greyed out and never fires on its own, but a stack under it
     * still runs when it is clicked, the same as any other stack.
     *
     * The answer has to be synchronous. This is an edge-activated hat, and the
     * engine only takes a thread out of promise-wait for non-hat blocks, so a
     * hat that returns a promise leaves a clicked stack parked for good with
     * nothing under it running. Always false, so the per-frame hat polling
     * never starts it by itself; a stack click skips the edge check and goes
     * straight on to the blocks below.
     * @returns {boolean} - false; the hat never triggers on its own.
     */
    whenMieoStartsUp () {
        return false;
    }


    /**
     * Run one library call on the board.
     *
     * In upload mode the block generators write this same call into main.py
     * and this is never reached. In live mode the VM calls it directly, and
     * the promise it returns is what makes a stack of blocks run in order:
     * the next block does not start until the board hands the prompt back.
     * @param {string} statement - the MicroPython call to run.
     * @returns {Promise} - resolves when the board has finished it.
     * @private
     */
    _live (statement) {
        return this._repl.exec(statement).catch(err => {
            // Surface it on the console the same way upload errors appear,
            // rather than failing silently or tearing the project down.
            this.runtime.emit(this.runtime.constructor.PERIPHERAL_RECIVE_DATA,
                Buffer.from(`\n${err.message}\n`));
        });
    }

    /**
     * Quote a menu value for embedding in a MicroPython call. The values come
     * from our own menus, but a hand-edited project could carry anything.
     * @param {string} value - the value to quote.
     * @returns {string} - a MicroPython string literal.
     * @private
     */
    _quote (value) {
        return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`;
    }

    // --------------------------------------------------------------- robot

    goDirection (args) {
        return this._live(`mieo.run(${this._quote(args.DIRECTION)}, ` +
            `${this._number(args.SPEED, 100)})`);
    }

    goForSeconds (args) {
        // The wait happens here, not on the board. A board sitting inside
        // mieo.sleep() answers nothing, and the REPL gives any one statement
        // fifteen seconds before it decides the board is lost -- so a longer
        // drive would be reported as a failure half way through and leave the
        // wheels turning. Driving, waiting and stopping as three steps keeps
        // the board answering throughout and puts no ceiling on the duration.
        const seconds = Math.max(0, Number(this._number(args.SECONDS, 1)));
        return this._live(
            `mieo.run(${this._quote(args.DIRECTION)}, ${this._number(args.SPEED, 100)})`)
            .then(() => new Promise(resolve => setTimeout(resolve, seconds * 1000)))
            .then(() => this._live('mieo.stoprobot()'));
    }

    stopRobot () {
        return this._live('mieo.stoprobot()');
    }

    setRobotOrientation (args) {
        return this._live(`mieo.setrobotorientation(${this._quote(args.ORIENTATION)})`);
    }

    runMotor (args) {
        return this._live(`mieo.runmotor(${this._quote(args.MOTOR)}, ` +
            `${this._quote(args.DIRECTION)}, ${this._number(args.SPEED, 100)})`);
    }

    stopMotor (args) {
        return this._live(`mieo.stopmotor(${this._quote(args.MOTOR)})`);
    }

    runBothMotors (args) {
        return this._live(`mieo.drive(${this._number(args.SPEED1, 0)}, ` +
            `${this._number(args.SPEED2, 0)})`);
    }

    setServo (args) {
        return this._live(`mieo.setservo(${this._quote(args.SERVO)}, ` +
            `${this._number(args.ANGLE, 90)})`);
    }

    setLineParameters (args) {
        // F is the speed, T1 and T2 the thresholds for the sensor on the left
        // and on the right of the robot, as raw 0-4095 readings (a value of
        // 100 or less is taken as a percentage). The library knows which
        // physical sensor is on which side.
        return this._live(
            `mieo.initializelinefollower(${this._number(args.T1, 1700)}, ` +
            `${this._number(args.T2, 2200)}, speed=${this._number(args.F, 60)})`);
    }

    /**
     * Steer along the line, or hand over to the blocks inside at a cross.
     *
     * The same shape as the code this generates for upload: while the two
     * sensors disagree there is a line to follow, so it steers and the branch
     * is skipped; once they agree on dark the robot is somewhere a line
     * follower has nothing useful to say about, and the branch runs.
     *
     * Only one steer is ever in flight. The editor loops far faster than the
     * board can answer, and queueing one per frame would build a backlog the
     * robot is still working through long after it left the line.
     * @param {object} args - the block arguments; there are none.
     * @param {object} util - the block utility, used to run the wrapped stack.
     */
    doLineFollowing (args, util) {
        // At a cross the board's follower has already stopped the wheels and
        // stopped itself; the blocks inside get the robot until they are done.
        if (this._sense('mieo.atlinecross()', this._asBoolean, false)) {
            util.startBranch(1, false);
            return;
        }
        // Otherwise the board follows the line from its own 10 ms timer, and
        // all this block does is keep that alive: one short statement every
        // quarter second. The board stops the wheels itself if these stop
        // arriving, so a closed editor or a dropped link cannot leave the
        // robot driving.
        const now = Date.now();
        if (!this._lineKickBusy && (now - this._lineKickAt) > OpenBlockEsp32MicroPythonDevice.LINE_KICK_MS) {
            this._lineKickBusy = true;
            this._lineKickAt = now;
            this._live('mieo.startlinefollower()').then(() => {
                this._lineKickBusy = false;
            });
        }
    }

    // ------------------------------------------------------------- speaker
    // The board sanitises every argument itself, so a reporter plugged into
    // the frequency block behaves the same here as it does in a program.

    playSound (args) {
        return this._live(`mieo.playsound(${this._quote(args.SOUND)})`);
    }

    playSoundUntilDone (args) {
        return this._live(`mieo.playsounduntildone(${this._quote(args.SOUND)})`);
    }

    playTone (args) {
        return this._live(`mieo.playtone(${this._quote(args.NOTE)}, ` +
            `${this._quote(args.DURATION)})`);
    }

    playFreq (args) {
        return this._live(`mieo.playfreq(${this._number(args.FREQ, 1000)}, ` +
            `${this._number(args.MS, 200)})`);
    }

    stopSound () {
        return this._live('mieo.stopsound()');
    }

    showPattern (args) {
        return this._live(`mieo.showpattern(${this._quote(args.PATTERN)})`);
    }

    showPatternUntilDone (args) {
        return this._live(`mieo.showpatternuntildone(${this._quote(args.PATTERN)})`);
    }

    showMatrix (args) {
        // A missing value would otherwise be quoted as the literal "undefined"
        // and blank the panel with no clue why.
        const pattern = typeof args.MATRIX === 'string' && args.MATRIX ?
            args.MATRIX : '0'.repeat(35);
        return this._live(`mieo.showmatrix(${this._quote(pattern)})`);
    }

    /**
     * Turn a block argument into a MicroPython number, so a hand-edited project
     * or a reporter returning something odd cannot inject code.
     * @param {*} value - the argument value.
     * @param {number} fallback - used when the value is not a number.
     * @returns {string} - a numeric literal.
     * @private
     */
    _number (value, fallback) {
        const n = Number(value);
        return String(isNaN(n) ? fallback : n);
    }

    setLed (args) {
        return this._live(`mieo.setled(${this._number(args.X, 1)}, ` +
            `${this._number(args.Y, 1)}, ${this._quote(args.COLOR)}, ` +
            `${this._number(args.BRIGHTNESS, 30)})`);
    }

    turnOffLed (args) {
        return this._live(`mieo.clearled(${this._number(args.X, 1)}, ` +
            `${this._number(args.Y, 1)})`);
    }

    clearScreen () {
        return this._live('mieo.clearscreen()');
    }

    setDisplayBrightness (args) {
        return this._live(`mieo.setbrightness(${this._number(args.BRIGHTNESS, 30)})`);
    }

    /**
     * A colour built from red, green and blue, for the colour slots above.
     * Reported as #RRGGBB because that is what the colour picker produces, so
     * a picked colour and a built one reach display.tocolor in the same shape.
     * @param {object} args - the block arguments.
     * @returns {string} - the colour as #RRGGBB.
     */
    rgb (args) {
        const channel = value => {
            const n = Math.round(Number(value));
            const clamped = isNaN(n) ? 0 : Math.max(0, Math.min(255, n));
            return clamped.toString(16).padStart(2, '0');
        };
        return `#${channel(args.R)}${channel(args.G)}${channel(args.B)}`.toUpperCase();
    }

    /**
     * A sensor reading, kept fresh in the background.
     *
     * Returns the last value straight away and asks the board for a new one at
     * most every SENSE_MAX_AGE_MS. Hats are polled every frame, so a blocking
     * read here would flood the serial link; a reading a tenth of a second old
     * is indistinguishable to anyone pressing a button.
     * @param {string} expression - the MicroPython expression to evaluate.
     * @param {Function} parse - turns the board's printed text into a value.
     * @param {*} fallback - value to report before the first reading arrives.
     * @returns {*} - the most recent reading.
     * @private
     */
    _sense (expression, parse, fallback) {
        let entry = this._sensed[expression];
        if (!entry) {
            entry = this._sensed[expression] = {value: fallback, at: 0, busy: false};
        }

        // The runtime polls hats in both program modes, connected or not. In
        // upload mode the port belongs to mpremote, so reading here would talk
        // over it -- the gate has to be here, because the engine has no notion
        // of a block being inactive.
        if (!this.runtime.isRealtimeMode() || !this._peripheral.isConnected()) {
            return entry.value;
        }

        const now = Date.now();
        if (!entry.busy && (now - entry.at) > OpenBlockEsp32MicroPythonDevice.SENSE_MAX_AGE_MS) {
            entry.busy = true;
            this._repl.evaluate(expression)
                .then(text => {
                    entry.value = parse(text);
                })
                .catch(err => {
                    // Surface it once rather than every frame.
                    if (entry.lastError !== err.message) {
                        entry.lastError = err.message;
                        this.runtime.emit(this.runtime.constructor.PERIPHERAL_RECIVE_DATA,
                            Buffer.from(`\n${err.message}\n`));
                    }
                })
                .then(() => {
                    entry.at = Date.now();
                    entry.busy = false;
                });
        }
        return entry.value;
    }

    /**
     * Drop every cached sensor reading. A read already in flight writes into
     * the old entry object and is discarded along with it.
     * @private
     */
    _forgetSensed () {
        this._sensed = {};
    }

    /**
     * @param {string} text - what the board printed for repr(value).
     * @returns {boolean} - the boolean it represents.
     * @private
     */
    _asBoolean (text) {
        return String(text).trim() === 'True';
    }

    /**
     * @param {string} text - what the board printed for repr(value).
     * @returns {number} - the number it represents, or 0.
     * @private
     */
    _asNumber (text) {
        const n = Number(String(text).trim());
        return isNaN(n) ? 0 : n;
    }

    whenButtonPressed (args) {
        return this._sense(`mieo.button(${this._quote(args.BUTTON)})`, this._asBoolean, false);
    }

    isButtonPressed (args) {
        return this._sense(`mieo.button(${this._quote(args.BUTTON)})`, this._asBoolean, false);
    }

    isIrActive (args) {
        return this._sense(`mieo.iractive(${this._quote(args.IR)})`, this._asBoolean, false);
    }

    getIrValue (args) {
        return this._sense(`mieo.irvalue(${this._quote(args.IR)})`, this._asNumber, 0);
    }

    setIrThreshold (args) {
        return this._live(`mieo.setirthreshold(${this._quote(args.IR)}, ` +
            `${this._number(args.THRESHOLD, 3000)})`);
    }

    whenTouched (args) {
        return this._sense(`mieo.touched(${this._quote(args.TOUCH)})`, this._asBoolean, false);
    }

    isTouched (args) {
        return this._sense(`mieo.touched(${this._quote(args.TOUCH)})`, this._asBoolean, false);
    }

    connectUltrasonic (args) {
        return this._live(`mieo.connectultrasonic(${this._number(args.SONAR, 1)}, ` +
            `${this._quote(args.ECHO)}, ${this._quote(args.TRIG)})`);
    }

    getUltrasonicDistance (args) {
        return this._sense(`mieo.ultrasonic(${this._number(args.SONAR, 1)})`, this._asNumber, 0);
    }

    readAnalogSensor (args) {
        // KIND only says what is plugged in; every analog sensor reads the same.
        return this._sense(`mieo.analogsensor(${this._quote(args.PIN)})`, this._asNumber, 0);
    }

    readDigitalSensor (args) {
        return this._sense(`mieo.digitalsensor(${this._quote(args.PIN)})`, this._asBoolean, false);
    }

    // --------------------------------------------------- general purpose pins

    readDigitalPin (args) {
        // A conditional block, so it asks for the state as a yes or a no.
        // digitalread itself answers 1 or 0, which the editor would read back
        // as false whichever way the pin sat.
        return this._sense(`mieo.digitalstate(${this._quote(args.PIN)})`, this._asBoolean, false);
    }

    readAnalogPin (args) {
        return this._sense(`mieo.analogread(${this._quote(args.PIN)})`, this._asNumber, 0);
    }

    setDigitalPin (args) {
        return this._live(`mieo.digitalwrite(${this._quote(args.PIN)}, ` +
            `${this._number(args.LEVEL, 0)})`);
    }

    setPwmPin (args) {
        // The block counts 0-255; mieo.setpwm scales and clamps it for the pin.
        return this._live(`mieo.setpwm(${this._quote(args.PIN)}, ` +
            `${this._number(args.OUT, 0)})`);
    }

    setBluetoothIndicator (args) {
        return this._live(`mieo.bluetoothindicator(${this._quote(args.STATE)})`);
    }

    showText (args) {
        return this._live(`mieo.showtext(${this._quote(args.TEXT)}, ` +
            `${this._quote(args.COLOR)}, ${this._quote(args.SPEED)})`);
    }

    displayFace (args) {
        return this._live(`mieo.showemotion(${this._quote(args.EMOTION)})`);
    }

    displayFaceAnimation (args) {
        return this._live(`mieo.showanimation(${this._quote(args.EMOTION)})`);
    }

    displayFaceAnimationUntilDone (args) {
        return this._live(`mieo.showanimationuntildone(${this._quote(args.EMOTION)})`);
    }

}

/**
 * How stale a sensor reading may be before the board is asked again, in ms.
 * Hats are polled every frame; this bounds the serial traffic that causes.
 * @type {number}
 */
OpenBlockEsp32MicroPythonDevice.SENSE_MAX_AGE_MS = 120;

/**
 * How often, in ms, the running "do line following" block tells the board it
 * is still wanted. The board gives up after a second without one, so this
 * has to be comfortably shorter than that even over a slow Bluetooth link.
 * @type {number}
 */
OpenBlockEsp32MicroPythonDevice.LINE_KICK_MS = 250;

module.exports = OpenBlockEsp32MicroPythonDevice;
