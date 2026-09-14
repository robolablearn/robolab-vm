/**
 * Getting a picture from a web address, for the Vision Sense extension.
 *
 * A web page may only read the pixels of a picture whose server says so, and
 * most picture servers do not say so: drawn onto a canvas, their pictures
 * "taint" it and every attempt to read it fails. The editor runs with Node
 * available, so pictures are downloaded with Node's own http and https,
 * which have no such rule, and decoded in the page from the downloaded
 * bytes, which count as the page's own. Where Node is not available -- a
 * build of the editor for an ordinary browser -- it falls back to fetch,
 * which works for the servers that allow it.
 *
 * The picture is fitted, whole, into a 4:3 canvas the shape of the stage,
 * so every position the blocks report lines up with the stage.
 */

/** The picture handed to the recognisers: the stage's shape at twice its size. */
const PICTURE_WIDTH = 960;
const PICTURE_HEIGHT = 720;

/** Pictures larger than this are refused rather than decoded. */
const MAX_BYTES = 15 * 1024 * 1024;

const REQUEST_TIMEOUT_MS = 15 * 1000;
const MAX_REDIRECTS = 5;

/** What the "vision status" reporter says about pictures that could not be got. */
const STATUS = {
    BAD_ADDRESS: 'bad web address',
    NOT_A_PICTURE: 'not a picture',
    TOO_BIG: 'picture too big',
    NOT_FOUND: 'picture not found',
    OFFLINE: 'no internet'
};

class PictureError extends Error {
    /**
     * @param {string} status - one of STATUS.
     * @param {string} message - a plain sentence for the console.
     */
    constructor (status, message) {
        super(message);
        this.status = status;
    }
}

const nodeRequire = () => {
    if (typeof window !== 'undefined' && typeof window.require === 'function') return window.require;
    return null;
};

/**
 * A web address from a block, as a URL: "example.com/cat.jpg" is taken to
 * mean https, and anything but http, https or a data: picture is refused.
 * @param {*} text - what the block holds.
 * @returns {URL} - the address.
 */
const parseAddress = text => {
    let address = String(text || '').trim();
    if (!address) throw new PictureError(STATUS.BAD_ADDRESS, 'type the web address of a picture');
    if (!/^[a-z][a-z0-9+.-]*:/i.test(address)) address = `https://${address}`;
    let url;
    try {
        url = new URL(address);
    } catch (err) {
        throw new PictureError(STATUS.BAD_ADDRESS, `"${text}" is not a web address`);
    }
    if (['http:', 'https:', 'data:'].indexOf(url.protocol) < 0) {
        throw new PictureError(STATUS.BAD_ADDRESS, 'only http and https addresses can be used');
    }
    return url;
};

/**
 * Download with Node, following redirects, refusing what is not a picture
 * or is too big, before it has all arrived.
 * @param {object} req - Node's require.
 * @param {URL} url - where.
 * @param {number} redirectsLeft - how many more redirects to follow.
 * @returns {Promise<{bytes: Uint8Array, type: string}>} - the picture's bytes.
 */
const downloadWithNode = (req, url, redirectsLeft) => new Promise((resolve, reject) => {
    const client = req(url.protocol === 'http:' ? 'http' : 'https');
    const request = client.get(url.toString(), {
        headers: {'User-Agent': 'Robolab Vision Sense', 'Accept': 'image/*'},
        timeout: REQUEST_TIMEOUT_MS
    }, response => {
        const status = response.statusCode;
        if (status >= 300 && status < 400 && response.headers.location) {
            response.resume();
            if (redirectsLeft <= 0) {
                reject(new PictureError(STATUS.NOT_FOUND, 'the picture address redirects too many times'));
                return;
            }
            let next;
            try {
                next = new URL(response.headers.location, url);
            } catch (err) {
                reject(new PictureError(STATUS.NOT_FOUND, 'the picture address redirects somewhere invalid'));
                return;
            }
            resolve(downloadWithNode(req, next, redirectsLeft - 1));
            return;
        }
        if (status !== 200) {
            response.resume();
            reject(new PictureError(STATUS.NOT_FOUND, `the picture could not be downloaded (HTTP ${status})`));
            return;
        }
        const type = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (type && !type.startsWith('image/') && type !== 'application/octet-stream') {
            response.resume();
            reject(new PictureError(STATUS.NOT_A_PICTURE, `that address is a ${type} page, not a picture`));
            return;
        }
        const declared = Number(response.headers['content-length']);
        if (declared > MAX_BYTES) {
            response.resume();
            reject(new PictureError(STATUS.TOO_BIG, 'that picture is bigger than 15 MB'));
            return;
        }
        const chunks = [];
        let size = 0;
        response.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BYTES) {
                request.destroy();
                reject(new PictureError(STATUS.TOO_BIG, 'that picture is bigger than 15 MB'));
                return;
            }
            chunks.push(chunk);
        });
        response.on('end', () => {
            const joined = new Uint8Array(size);
            let offset = 0;
            chunks.forEach(chunk => {
                joined.set(chunk, offset);
                offset += chunk.length;
            });
            resolve({bytes: joined, type});
        });
        response.on('error', () => reject(new PictureError(STATUS.OFFLINE, 'the picture download was cut off')));
    });
    request.on('timeout', () => request.destroy(new Error('timed out')));
    request.on('error', err => {
        if (err instanceof PictureError) return;
        reject(new PictureError(STATUS.OFFLINE, `could not reach that address (${err.message})`));
    });
});

/**
 * Download with fetch, for pages without Node, and for data: addresses.
 * @param {URL} url - where.
 * @returns {Promise<{bytes: Blob, type: string}>} - the picture.
 */
const downloadWithFetch = async url => {
    let response;
    try {
        response = await fetch(url.toString());
    } catch (err) {
        throw new PictureError(STATUS.OFFLINE,
            'could not get that picture: check the internet connection, or the site may not allow it');
    }
    if (!response.ok) {
        throw new PictureError(STATUS.NOT_FOUND, `the picture could not be downloaded (HTTP ${response.status})`);
    }
    const blob = await response.blob();
    if (blob.size > MAX_BYTES) throw new PictureError(STATUS.TOO_BIG, 'that picture is bigger than 15 MB');
    return {bytes: blob, type: blob.type};
};

/**
 * Decode picture bytes. createImageBitmap first; an <img> for what it will
 * not take, such as SVG.
 * @param {Blob} blob - the picture.
 * @returns {Promise<CanvasImageSource>} - something drawable, with its size.
 */
const decode = async blob => {
    try {
        return await createImageBitmap(blob);
    } catch (err) {
        const objectUrl = URL.createObjectURL(blob);
        try {
            return await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('undecodable'));
                img.src = objectUrl;
            });
        } catch (imgErr) {
            throw new PictureError(STATUS.NOT_A_PICTURE, 'that address did not give a picture that can be opened');
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }
};

class PictureLoader {
    /**
     * Get the picture at a web address, fitted into a stage-shaped canvas.
     * @param {*} address - the web address, from a block.
     * @returns {Promise<HTMLCanvasElement>} - a new 960x720 canvas.
     */
    async load (address) {
        const url = parseAddress(address);
        const req = url.protocol === 'data:' ? null : nodeRequire();
        const {bytes, type} = req ?
            await downloadWithNode(req, url, MAX_REDIRECTS) :
            await downloadWithFetch(url);
        const blob = bytes instanceof Blob ? bytes : new Blob([bytes], {type: type || ''});
        const picture = await decode(blob);
        const width = picture.width || picture.naturalWidth;
        const height = picture.height || picture.naturalHeight;
        if (!width || !height) {
            throw new PictureError(STATUS.NOT_A_PICTURE, 'that picture has no size');
        }

        const canvas = document.createElement('canvas');
        canvas.width = PICTURE_WIDTH;
        canvas.height = PICTURE_HEIGHT;
        const context = canvas.getContext('2d');
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, PICTURE_WIDTH, PICTURE_HEIGHT);
        const scale = Math.min(PICTURE_WIDTH / width, PICTURE_HEIGHT / height);
        const drawWidth = width * scale;
        const drawHeight = height * scale;
        context.drawImage(picture,
            (PICTURE_WIDTH - drawWidth) / 2, (PICTURE_HEIGHT - drawHeight) / 2, drawWidth, drawHeight);
        if (typeof picture.close === 'function') picture.close();
        return canvas;
    }
}

PictureLoader.STATUS = STATUS;
PictureLoader.PICTURE_WIDTH = PICTURE_WIDTH;
PictureLoader.PICTURE_HEIGHT = PICTURE_HEIGHT;
PictureLoader.MAX_BYTES = MAX_BYTES;
PictureLoader.parseAddress = parseAddress;

module.exports = PictureLoader;
