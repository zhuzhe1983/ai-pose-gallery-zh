// Reproduce pinned, same-origin browser inference assets.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url),
  destination = new URL("studio/vendor/mediapipe/", root);
await mkdir(new URL("wasm/", destination), { recursive: true });
for (const file of [
  "vision_bundle.js",
  "wasm/vision_wasm_internal.js",
  "wasm/vision_wasm_internal.wasm",
  "wasm/vision_wasm_nosimd_internal.js",
  "wasm/vision_wasm_nosimd_internal.wasm",
])
  await cp(
    new URL("node_modules/@mediapipe/tasks-vision/" + file, root),
    new URL(file, destination),
  );
const MODELS = [
  {
    name: "pose_landmarker_full.task",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    sha256: "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1",
  },
  {
    name: "selfie_multiclass_256x256.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
    sha256: "c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0",
  },
  {
    name: "face_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    sha256: "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
  },
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const model of MODELS) {
  const file = new URL(model.name, destination);
  let bytes = await readFile(file).catch(() => null);
  if (!bytes || hash(bytes) !== model.sha256) {
    const response = await fetch(model.url);
    if (!response.ok) throw Error(`Model download failed (${model.name}): ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== model.sha256) throw Error(`Model checksum mismatch: ${model.name}`);
    await writeFile(file, bytes);
  }
}
console.log(
  "Vendored MediaPipe Tasks Vision 1.2.0 + Pose Full + Selfie Multiclass + Face Landmarker; checksums verified.",
);
