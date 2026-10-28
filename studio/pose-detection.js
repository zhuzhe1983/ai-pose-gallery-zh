// SPDX-License-Identifier: GPL-3.0-only
// Image pixels stay in this browser; only static same-origin model files are fetched.
export const POSE_MODEL = "mediapipe-pose-full-f16-v1/tasks-vision-1.2.0";
export const POSE_CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 19],
  [15, 17],
  [12, 14],
  [14, 16],
  [16, 20],
  [16, 18],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
  [28, 32],
  [0, 7],
  [0, 8],
];
export const EDITABLE_POINTS = [
  0, 7, 8, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  32,
];
let worker, pending;
function abortError() {
  return new DOMException("Cancelled", "AbortError");
}
export function cancelDetection() {
  worker?.terminate();
  worker = null;
  pending?.reject(abortError());
  pending = null;
}

export async function readPoseImage(source, { signal } = {}) {
  let blob = source;
  if (typeof source === "string") {
    const url = new URL(source, location.href);
    // Agent API may load gallery references; arbitrary cross-origin downloads are not needed.
    if (url.origin !== location.origin) throw Error("poseImageOrigin");
    const response = await fetch(url, { signal });
    if (!response.ok) throw Error("poseImageFailed");
    blob = await response.blob();
  }
  if (
    !(blob instanceof Blob) ||
    !/^image\/(jpeg|png|webp|avif|gif|bmp)$/.test(blob.type)
  )
    throw Error("poseImageType");
  if (blob.size > 25 * 1024 * 1024) throw Error("poseImageSize");
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw Error("poseImageFailed");
  }
  if (signal?.aborted) {
    bitmap.close();
    throw abortError();
  }
  if (!bitmap.width || !bitmap.height) {
    bitmap.close();
    throw Error("poseImageFailed");
  }
  // Bound inference/preview memory. Preserve aspect and EXIF orientation.
  const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export async function detectPoseImage(
  canvas,
  { signal, onProgress = () => {} } = {},
) {
  if (
    !globalThis.Worker ||
    !globalThis.createImageBitmap ||
    !globalThis.OffscreenCanvas
  )
    throw Error("poseUnsupported");
  if (pending) throw Error("poseBusy");
  if (signal?.aborted) throw abortError();
  const bitmap = await createImageBitmap(canvas);
  if (signal?.aborted) {
    bitmap.close();
    throw abortError();
  }
  return new Promise((resolve, reject) => {
    const finish = (fn, value) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      pending = null;
      fn(value);
    };
    const abort = () => cancelDetection();
    const timer = setTimeout(() => {
      worker?.terminate();
      worker = null;
      finish(reject, Error("poseTimeout"));
    }, 180000);
    pending = { reject: (e) => finish(reject, e) };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      worker ||= new Worker(new URL("./pose-worker.js", import.meta.url));
      worker.onmessage = ({ data }) => {
        if (data.phase) return onProgress(data.phase);
        if (data.error) {
          console.warn("Pose inference:", data.error);
          worker.terminate();
          worker = null;
          return finish(reject, Error("poseDetectFailed"));
        }
        finish(resolve, {
          model: POSE_MODEL,
          width: canvas.width,
          height: canvas.height,
          elapsed: data.elapsed,
          people: data.result.landmarks
            .map((landmarks, i) => ({
              landmarks,
              worldLandmarks: data.result.worldLandmarks[i],
            }))
            .sort((a, b) => centerX(a) - centerX(b)),
        });
      };
      worker.onerror = (e) => {
        e.preventDefault();
        worker.terminate();
        worker = null;
        finish(reject, Error("poseDetectFailed"));
      };
      worker.postMessage({ bitmap }, [bitmap]);
    } catch (e) {
      bitmap.close();
      cancelDetection();
      reject(e);
    }
  });
}
export function centerX(person) {
  return (person.landmarks[23].x + person.landmarks[24].x) / 2;
}
export function pointConfidence(point) {
  return Math.min(point?.visibility ?? 0, point?.presence ?? 1);
}
