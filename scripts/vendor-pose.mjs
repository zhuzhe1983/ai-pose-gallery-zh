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
const modelURL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const expected =
  "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1";
const file = new URL("pose_landmarker_full.task", destination);
let bytes = await readFile(file).catch(() => null);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (!bytes || hash(bytes) !== expected) {
  const response = await fetch(modelURL);
  if (!response.ok) throw Error("Model download failed: " + response.status);
  bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== expected) throw Error("Model checksum mismatch");
  await writeFile(file, bytes);
}
console.log(
  "Vendored MediaPipe Tasks Vision 1.2.0 + Pose Full float16 v1; checksum verified.",
);
