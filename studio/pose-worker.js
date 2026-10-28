// SPDX-License-Identifier: GPL-3.0-only
// Classic Worker: MediaPipe's WASM loader uses importScripts on older browsers.
importScripts("./vendor/mediapipe/vision_bundle.js");
let detector;
function confidence(p) {
  return Math.min(p.visibility ?? 0, p.presence ?? 1);
}
function mergePerson(people, landmarks, worldLandmarks) {
  const torso = [11, 12, 23, 24];
  if (torso.filter((i) => confidence(landmarks[i]) > 0.4).length < 3) return;
  const center = {
    x: (landmarks[23].x + landmarks[24].x) / 2,
    y: (landmarks[23].y + landmarks[24].y) / 2,
  };
  if (center.x < 0 || center.x > 1 || center.y < 0 || center.y > 1) return;
  const score =
    torso
      .concat([13, 14, 25, 26])
      .reduce((sum, i) => sum + confidence(landmarks[i]), 0) / 8;
  const size = Math.hypot(
    (landmarks[11].x + landmarks[12].x) / 2 - center.x,
    (landmarks[11].y + landmarks[12].y) / 2 - center.y,
  );
  const duplicate = people.findIndex(
    (p) =>
      Math.hypot(p.center.x - center.x, p.center.y - center.y) <
      Math.max(0.025, Math.min(size, p.size) * 0.65),
  );
  const person = { landmarks, worldLandmarks, center, score, size };
  if (duplicate < 0) people.push(person);
  else if (score > people[duplicate].score) people[duplicate] = person;
}
self.onmessage = async ({ data: { bitmap } }) => {
  try {
    if (!detector) {
      self.postMessage({ phase: "modelLoading" });
      const base = new URL("./vendor/mediapipe/", self.location.href).href;
      const files = await Vision.FilesetResolver.forVisionTasks(base + "wasm");
      detector = await Vision.PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: base + "pose_landmarker_full.task",
          // WASM CPU works independently of the studio's WebGPU/WebGL context.
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        numPoses: 6,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        outputSegmentationMasks: false,
      });
    }
    self.postMessage({ phase: "detectingPose" });
    const start = performance.now();
    const people = [];
    const scan = (input, rect) => {
      const result = detector.detect(input);
      result.landmarks.forEach((landmarks, i) =>
        mergePerson(
          people,
          landmarks.map((p) => ({
            ...p,
            x: (rect.x + p.x * rect.width) / bitmap.width,
            y: (rect.y + p.y * rect.height) / bitmap.height,
            z: (p.z * rect.width) / bitmap.width,
          })),
          result.worldLandmarks[i],
        ),
      );
    };
    scan(bitmap, { x: 0, y: 0, width: bitmap.width, height: bitmap.height });
    // BlazePose's detector misses small subjects in a wide group. Overlapping
    // crops recover them; map landmarks back to the original and deduplicate hips.
    for (const [columns, rows] of [
      [2, 1],
      [2, 2],
      [3, 2],
    ]) {
      if (people.length >= 6) break;
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < columns; col++) {
          const width = Math.min(
            bitmap.width,
            Math.ceil((bitmap.width / columns) * 1.2),
          );
          const height = Math.min(
            bitmap.height,
            Math.ceil((bitmap.height / rows) * 1.2),
          );
          const x = Math.max(
            0,
            Math.min(
              bitmap.width - width,
              ((col + 0.5) * bitmap.width) / columns - width / 2,
            ),
          );
          const y = Math.max(
            0,
            Math.min(
              bitmap.height - height,
              ((row + 0.5) * bitmap.height) / rows - height / 2,
            ),
          );
          const crop = new OffscreenCanvas(width, height);
          crop
            .getContext("2d")
            .drawImage(bitmap, x, y, width, height, 0, 0, width, height);
          scan(crop, { x, y, width, height });
        }
    }
    const retained = people.sort((a, b) => b.score - a.score).slice(0, 6);
    self.postMessage({
      result: {
        landmarks: retained.map((p) => p.landmarks),
        worldLandmarks: retained.map((p) => p.worldLandmarks),
      },
      elapsed: Math.round(performance.now() - start),
    });
  } catch (error) {
    self.postMessage({ error: String(error.message || error) });
  } finally {
    bitmap?.close();
  }
};
