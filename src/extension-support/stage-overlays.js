/**
 * The marks extensions draw over the stage, and pictures of the stage taken
 * without them.
 *
 * Several extensions draw on the stage -- boxes round objects, stick figures,
 * face outlines, code outlines, labels, a data credit -- and several look at a
 * picture of the stage. Each used to take that picture with the other
 * extensions' marks in it, and Face, Object and Body Sense with their own marks
 * in it too. Measured 2026-09-13 on a photo of a man with two dogs: with every
 * extension's marks switched on, looking again at the same stage found one
 * object instead of two, and a face that had not been found before.
 *
 * So every extension that draws a layer registers it here, and every stage
 * picture is taken through captureStage, which hides all registered layers for
 * the moment of the capture and puts back the ones that were showing. What the
 * user draws with the pen stays in the picture; only these marks are left out.
 * An extension that shows or hides its layer does it through setOverlayVisible,
 * so that a capture never brings back a layer its owner had hidden.
 */

/** Per runtime: drawable id to whether its owner wants it showing. */
const registries = new WeakMap();

const registryOf = runtime => {
    let registry = registries.get(runtime);
    if (!registry) {
        registry = new Map();
        registries.set(runtime, registry);
    }
    return registry;
};

/**
 * Note a drawable as an overlay: shown to the user, left out of stage pictures.
 * @param {Runtime} runtime - the runtime whose stage it is on.
 * @param {number} drawableId - the renderer's id for the drawable.
 */
const registerOverlay = (runtime, drawableId) => {
    if (typeof drawableId === 'number') registryOf(runtime).set(drawableId, true);
};

/**
 * Forget an overlay, before its drawable is destroyed.
 * @param {Runtime} runtime - the runtime whose stage it was on.
 * @param {number} drawableId - the renderer's id for the drawable.
 */
const unregisterOverlay = (runtime, drawableId) => {
    registryOf(runtime).delete(drawableId);
};

/**
 * Show or hide an overlay, remembering which, so that a capture puts back
 * exactly what was showing.
 * @param {Runtime} runtime - the runtime whose stage it is on.
 * @param {number} drawableId - the renderer's id for the drawable.
 * @param {boolean} visible - whether it should show.
 */
const setOverlayVisible = (runtime, drawableId, visible) => {
    const registry = registryOf(runtime);
    if (registry.has(drawableId)) registry.set(drawableId, visible);
    if (runtime.renderer) runtime.renderer.updateDrawableVisible(drawableId, visible);
};

/**
 * Draw the stage into a canvas with every overlay left out.
 * @param {Runtime} runtime - the runtime whose stage to draw.
 * @param {HTMLCanvasElement} canvas - where to draw; its size is used as it is.
 * @param {?string} background - a colour to fill first, for see-through stages, or null.
 * @returns {?HTMLCanvasElement} - the canvas, or null if there is no stage to draw.
 */
const captureStage = (runtime, canvas, background) => {
    const renderer = runtime.renderer;
    if (!renderer || !renderer.canvas) return null;
    const hidden = [];
    registryOf(runtime).forEach((visible, id) => {
        if (!visible) return;
        renderer.updateDrawableVisible(id, false);
        hidden.push(id);
    });
    try {
        // Drawn and copied in one go: the renderer's canvas is WebGL, and
        // reading it after a frame has been presented gives back nothing.
        renderer.draw();
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (background) {
            context.fillStyle = background;
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.drawImage(renderer.canvas, 0, 0, canvas.width, canvas.height);
        return canvas;
    } finally {
        hidden.forEach(id => renderer.updateDrawableVisible(id, true));
        // Drawn again at once, or the stage on screen would show the frame
        // without the marks until the next step draws it.
        if (hidden.length) renderer.draw();
    }
};

module.exports = {registerOverlay, unregisterOverlay, setOverlayVisible, captureStage};
