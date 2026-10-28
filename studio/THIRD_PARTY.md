# Studio source and licenses

The standalone posing studio in this directory is provided under GPL-3.0-only
(see `LICENSE`). Its editable JavaScript and CSS source is shipped alongside the
page. This notice does not change the image collection's original rights.

- [Mannequin.js](https://github.com/boytchev/mannequin.js), Pavel Boytchev,
  npm `mannequin-js@5.2.3`, GPL-3.0. Source and license: `vendor/mannequin/`.
  Modification on 2026-10-28: replace its automatic scene initialization with a
  scene-only shim so POSE Atlas can own the WebGPU renderer. All other vendored
  mannequin files are unchanged. The embedded font retains its original notice.
- [Three.js](https://github.com/mrdoob/three.js), `three@0.186.1`, MIT.
  Source and license: `vendor/three/`. Vendored files are unchanged.
- [MediaPipe](https://github.com/google-ai-edge/mediapipe), Google,
  `@mediapipe/tasks-vision@1.2.0`, Apache-2.0. Unmodified browser bundle and
  SIMD/non-SIMD WASM files: `vendor/mediapipe/`; license: `vendor/mediapipe/LICENSE`.
  Loaded only when image pose detection is requested, in a classic Web Worker.
- Pose Landmarker Full, float16, model version **1**, Apache-2.0 per the
  [BlazePose GHUM model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf).
  [Pinned upstream model](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task).
  Local file: `vendor/mediapipe/pose_landmarker_full.task`.
  SHA-256: `5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1`.

Reproduce these dependencies from the pinned npm packages using
`npm ci --ignore-scripts && npm run vendor:studio`. The public page loads the
checked-in files from this site; it does not depend on an external CDN.
Run `npm run vendor:pose` to reproduce the inference assets and verify the model
checksum. It reuses the checked-in Apache license. User photos and landmarks are
processed on the device; no inference server or external upload endpoint is used.

POSE Atlas adds original articulated surfaces (`figure.js`), a continuous skinned
stretch suit (`suit.js`, using Three.js MarchingCubes), fixed-order angle controls,
a multilingual UI, local image pose detection and constrained fitting,
hand-authored presets and a PNG/scene API. The suit is built once per body type
with separated arms/legs in its bind pose and follows the existing rig; it does
not use a cloth physics solver. Low-confidence or undetected body parts are not
treated as validated reconstructions.
No stock editor interface or SHF-branded model is included. Generated captures
are output images; this source-code license does not automatically license the
gallery collection or apply to independent artwork made using the references.

- [MakeHuman/MPFB](https://github.com/makehumancommunity/mpfb2), core mesh, morph targets, rig and weights: **CC0-1.0**, pinned commit `6ff1eb358f6c1959ced77e79e6dd2406d9a71f49`. Generated adult female/male GLBs, changes, build instructions and checksums: [`assets/humans/README.md`](assets/humans/README.md), [`assets/humans/manifest.json`](assets/humans/manifest.json). The MPFB Python program is a build dependency, not shipped in the page. Its source is GPL-3.0-or-later; the exported graphical assets retain the separately documented CC0 terms. `human.js` maps the mesh weights to the existing editor controls; the original procedural geometry is used only if model loading fails. The default appearance is now a continuous display mannequin; no cloth simulation, real-person scan, or Dummy 13 model is included.
