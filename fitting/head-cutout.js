// Main-thread MediaPipe WASM Head Cutout + compact WebP/JPEG-Alpha URL encoder.
let worker = null;
let nextId = 1;
const pending = new Map();

function ensureWorker() {
  if (!worker) {
    worker = new Worker(new URL('./head-worker.js', import.meta.url));
    worker.onmessage = ({ data }) => {
      if (data.phase) {
        for (const entry of pending.values()) entry.onProgress?.(data.phase);
        return;
      }
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.ok) entry.resolve(data.result);
      else entry.reject(Error(data.error || 'Worker failed'));
    };
    worker.onerror = (err) => {
      for (const entry of pending.values()) entry.reject(Error(err.message || 'Worker error'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

async function runWorkerTask(task, source, onProgress) {
  let bitmap;
  if (source instanceof ImageBitmap) {
    bitmap = source;
  } else if (source instanceof Blob || source instanceof HTMLCanvasElement || source instanceof HTMLImageElement || source instanceof HTMLVideoElement) {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  } else if (typeof source === 'string') {
    const res = await fetch(source);
    if (!res.ok) throw Error('Failed to load source image');
    bitmap = await createImageBitmap(await res.blob(), { imageOrientation: 'from-image' });
  } else {
    throw Error('Unsupported image source');
  }

  // Bound input dimension to <= 960px for fast WASM execution
  const maxDim = Math.max(bitmap.width, bitmap.height);
  if (maxDim > 960) {
    const scale = 960 / maxDim;
    const resized = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    resized.getContext('2d').drawImage(bitmap, 0, 0, resized.width, resized.height);
    bitmap.close();
    bitmap = await createImageBitmap(resized);
  }

  const w = ensureWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ id, task, bitmap }, [bitmap]);
  });
}

function supportsWebpEncode() {
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  return c.toDataURL('image/webp').startsWith('data:image/webp');
}

function rgbaToCanvas(rgbaBuffer, width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgbaBuffer), width, height), 0, 0);
  return c;
}

function encodeCanvasToCompactHead(canvas, maxBytes = 15500) {
  if (supportsWebpEncode()) {
    for (const scale of [1, 0.85, 0.72]) {
      const w = Math.max(48, Math.round(canvas.width * scale));
      const h = Math.max(48, Math.round(canvas.height * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(canvas, 0, 0, w, h);
      for (const q of [0.78, 0.66, 0.52]) {
        const url = c.toDataURL('image/webp', q);
        const b64 = url.split(',')[1];
        if (b64.length <= maxBytes || (scale === 0.72 && q === 0.52)) {
          return { mime: 'image/webp', w, h, data: b64 };
        }
      }
    }
  }
  // Safari / WebKit fallback: separate compact JPEG RGB + small PNG alpha mask
  const w = Math.min(160, canvas.width);
  const h = Math.round((canvas.height / canvas.width) * w);
  const rgbC = document.createElement('canvas');
  rgbC.width = w;
  rgbC.height = h;
  const rCtx = rgbC.getContext('2d');
  rCtx.fillStyle = '#e8ddd5';
  rCtx.fillRect(0, 0, w, h);
  rCtx.drawImage(canvas, 0, 0, w, h);
  const jpgB64 = rgbC.toDataURL('image/jpeg', 0.74).split(',')[1];

  const aw = Math.max(48, Math.round(w * 0.5));
  const ah = Math.max(48, Math.round(h * 0.5));
  const alphaC = document.createElement('canvas');
  alphaC.width = aw;
  alphaC.height = ah;
  const aCtx = alphaC.getContext('2d');
  aCtx.drawImage(canvas, 0, 0, aw, ah);
  const img = aCtx.getImageData(0, 0, aw, ah);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    img.data[i] = img.data[i + 1] = img.data[i + 2] = a;
    img.data[i + 3] = 255;
  }
  aCtx.putImageData(img, 0, 0);
  const alphaB64 = alphaC.toDataURL('image/png').split(',')[1];
  return { mime: 'image/jpeg', w, h, data: jpgB64, mask: alphaB64 };
}

export async function cutoutHeadFromSource(source, { onProgress } = {}) {
  const raw = await runWorkerTask('cutoutHead', source, onProgress);
  const canvas = rgbaToCanvas(raw.rgba, raw.width, raw.height);
  const compact = encodeCanvasToCompactHead(canvas);
  return {
    canvas,
    compact,
    skinHex: raw.skinHex,
    rollRad: raw.rollRad,
    chinAnchor: raw.chinAnchor,
  };
}

export async function detectPose2DAnchors(source, { onProgress } = {}) {
  const res = await runWorkerTask('detectPose2D', source, onProgress);
  return res.anchors;
}

export async function decodeHeadPayload(headPayload) {
  const loadImg = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(Error('Failed to decode head image'));
      img.src = src;
    });

  const rgbImg = await loadImg(`data:${headPayload.mime};base64,${headPayload.data}`);
  const canvas = document.createElement('canvas');
  canvas.width = headPayload.w || rgbImg.naturalWidth;
  canvas.height = headPayload.h || rgbImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(rgbImg, 0, 0, canvas.width, canvas.height);

  if (headPayload.mask) {
    const maskImg = await loadImg(`data:image/png;base64,${headPayload.mask}`);
    const mCanvas = document.createElement('canvas');
    mCanvas.width = canvas.width;
    mCanvas.height = canvas.height;
    const mCtx = mCanvas.getContext('2d');
    mCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
    const rgbData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const maskData = mCtx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < rgbData.data.length; i += 4) {
      rgbData.data[i + 3] = maskData.data[i];
    }
    ctx.putImageData(rgbData, 0, 0);
  }
  return canvas;
}
