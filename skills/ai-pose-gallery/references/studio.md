# Pose Studio: characters, joints and PNG captures

Studio: `https://zhuzhe1983.github.io/ai-pose-gallery-zh/studio/`. Add `?lang=zh`, `en` or `ja`. To open a gallery pose, append e.g. `?pose=sexy_sit_w-sit-hands-fw_hi&lang=en`.

The studio uses adult MakeHuman/MPFB meshes and authored skin weights (CC0), mapped to Mannequin.js's angle controls. These are realistic-proportion display mannequins, not scans of people. Male and female GLBs total about 6 MiB, loaded once per page and shared by figure instances. The original procedural figures remain a clearly labeled fallback if loading fails. It supports one to six adult male/female figures. It renders with Three.js WebGPU, with WebGL 2 fallback displayed accurately in the toolbar. No authentication, server, API key or AIGC service is needed to render white-model PNGs. Source and GPL-3.0 license: `studio/THIRD_PARTY.md`, `studio/LICENSE`.

## Interactive operation

1. Select figure A–F; add male or female figures (maximum six). Each figure card has a visible Delete button. Keep at least one figure.
2. Choose a body part from the inspector or click it on the figure. Use labeled sliders, numeric angles, or the rotation rings. Sliders, rings, presets and scene imports all obey the same limits. Knees and elbows have one bend axis. Hands have a finger-curl slider.
3. The canvas toolbar switches **Rotate joint (E)** and **Move figure (W)**. Drag the translation arrows or plane handles directly; a vertical drag releases floor locking. The continuous skin follows the rig without cloth simulation. Select **White mannequin** or **Ivory mannequin** (default) for the material. Extreme bends can still compress the skin; there is no collision solver or corrective blendshape system. Use body type, overall scale (80–120%), position and facing controls for composition. Turn off automatic grounding to raise a figure off the floor. Drag the empty canvas to orbit; use the wheel to zoom. Camera buttons select front, three-quarter, side, above or below.
4. Gallery tiles marked **3D** load editable hand-authored approximations. Other tiles only display a reference and leave the figure's pose unchanged. Image references are not reconstructed 3D data, and contact points/collisions are not automatically solved.
5. **Capture PNG** exports a 1600 × 1600 image without rings, grid, selection tint, labels or reference card. **Share scene link** copies the full scene into a compressed URL fragment. Edits also update the address bar; the shared scene takes priority over browser autosave. **Save scene** / **Load scene** preserve editable joints, figures and camera. The browser also autosaves locally. Check the PNG visually before using it for AIGC.

## Automation interface

With any browser automation tool that can evaluate JavaScript in the page:

```js
await window.poseStudio.ready;
const p = window.poseStudio;
p.reset({sex: 'female'}); // deterministic start; replaces the browser's current scene
p.addFigure({sex: 'male', height: 1.8, scale: 1.1}); // returns 'B'; up to A–F
await p.loadPreset('solo_sit_lean-bk-kn-up', {actorId: 'A'});
p.setJoint('A', 'head', {nod: 10, turn: 20});
p.setJoint('B', 'l_arm', {raise: 60, straddle: 20, turn: 0});
p.setJoint('B', 'l_elbow', {bend: 90});
p.setHand('B', 'l', 35);
p.setFigure('A', {position: [-0.45, 0, 0], ground: true});
p.setFigure('B', {position: [0.45, 0, 0], yaw: -20, ground: true});
p.setCamera('d');
const image = await p.capture({width: 1600, height: 1600});
// image = {mimeType:'image/png', width, height, dataUrl:'data:image/png;base64,...'}
const scene = p.exportScene();
const url = await p.getShareURL(); // self-contained share link; no upload
// await p.loadShareURL(url); // restore a shared scene
```

Save the returned base64 bytes to a `.png` file using the automation environment's file-writing API. Do not print the full data URL into the conversation. Alternatively, `capture({download:true, filename:'pose.png'})` triggers a browser download. Capture serially, and await each call. Sizes: integer 256–4096 per axis. Captures use the current camera position with the requested aspect ratio; inspect the framing when changing aspect ratio. The UI export uses 1600 × 1600; the API allows portrait or landscape captures.

Figure state includes `mesh: "makehuman-v2"` (or `"procedural-v1"` fallback). Await `ready` before all operations. Legacy shared scenes still load; floor-locked scenes without a matching mesh revision are grounded to the new surface. Saved joint angles are preserved, but old model silhouettes/contact points are not identical.

API version: **3**. Methods (all synchronous except `ready`, `loadPreset`, `showReference`, `capture`, `getShareURL`, `loadShareURL` and the photo methods below):

| Method | Behavior |
| --- | --- |
| `reset({sex})` | Replace scene with one neutral adult figure A; sex defaults to `female`. |
| `addFigure({sex,height,scale,outfit})` | Add a free ID from A–F without moving existing figures; returns ID. Maximum six; scale 0.8–1.2 (default 1). |
| `removeFigure(id)` | Remove a figure, retaining at least one. IDs of remaining figures stay stable. |
| `selectFigure(id)` | Select A–F in the UI. |
| `setFigure(id,{sex,height,scale,outfit,position,yaw,ground})` | Optional properties: `outfit` is `ivory` (ivory human mannequin) or `white` (white finish); sex `female`/`male`; base height 1.2–2.2 metres (legacy API; defaults 1.65 female / 1.8 male); uniform `scale` 0.8–1.2; rendered height = base height × scale; absolute XYZ position in metres (each −10…10); yaw −180…180 degrees. `ground:true` overrides Y to touch the floor. |
| `setJoint(id,part,angles)` | Set the named angles below, in degrees. Other angles are preserved. |
| `getJoint(id,part)` | Read named angles. |
| `setHand(id,'l'\|'r',curl)` | Curl all fingers on one hand, 0–100 degrees. |
| `neutral(id)` | Reset that figure's pose and hands; retains its body type and height. |
| `listPresets()` | Small array of available `{id,figures,view}`. No gallery index needed. |
| `loadPreset(stem,{actorId,view})` | Load an existing 3D preset. A solo preset affects the selected/explicit figure. A duo preset affects the first two figures, adding a second if needed; additional figures are preserved. Includes the matching reference; sets camera. Unknown preset throws. All 24 current presets are unverified drafts (`status: draft-needs-review`), not accurate reconstructions. |
| `showReference(stem,view?)` | Show a gallery reference without changing the 3D pose. Returns `hasPreset`; unknown image/view throws. |
| `setCamera('f'\|'d'\|'s'\|'hi'\|'lo')` / `frame()` | Fit all figures from a standard view / current direction. |
| `exportScene()` / `getState()` | Return the versioned serializable scene. |
| `importScene(scene)` | Validate then restore a scene, including camera, figures, floor/grid preferences. |
| `getShareURL()` / `loadShareURL(url)` | Create / restore a self-contained URL with all figures, scale, joints and camera. The `#s=2.…` fragment is compressed, validated and kept client-side. |
| `getJointLimits(part)` | Return the authoritative angle names and allowed min/max values. API out-of-range writes throw; gizmo/import/preset rotations are constrained. |
| `undo()` / `redo()` | Restore previous edits. |
| `capture(options)` | Return a clean PNG data URL; optional browser download. |

Valid part and angle names:

| Parts | Angles and limits (degrees) |
| --- | --- |
| `body` | `bend`, `tilt`, `turn`: −180…180. Neutral `turn` is **−90** in the rig; use figure `yaw` for overall facing. |
| `torso` | `bend` −35…65; `tilt` −30…30; `turn` −60…60 |
| `head` | `nod` −45…55; `tilt` −35…35; `turn` −80…80 |
| `l_arm`, `r_arm` | `raise` −60…180; `straddle` −15…90; `turn` −90…90 |
| `l_leg`, `r_leg` | `raise` −30…145; `straddle` −15…70; `turn` −80…80 |
| `l_elbow`, `r_elbow`, `l_knee`, `r_knee` | `bend` 0…150 |
| `l_wrist`, `r_wrist` | `bend` −80…80; `tilt` −30…30; `turn` −90…90 |
| `l_ankle`, `r_ankle` | `bend` −45…60; `tilt` −25…25; `turn` −35…35 |

Left/right are the figure's anatomical sides. Positive raise moves a limb forward; positive straddle spreads it outward. Joint angles are fixed-order editor controls, not raw upstream Euler getter sequences. Use this API instead of manipulating Mannequin.js internals. The editor enforces artistic ranges, not a collision/biomechanics solver.

The scene schema is `pose-atlas/studio@2`; v1 imports migrate with `scale:1`. Scenes without an `outfit` use `ivory`; the optional outfit field is included in new scene exports and URLs. Imported rotations are constrained to the supported ranges. Treat the per-joint quaternion data as opaque: obtain it from `exportScene()` and edit named angles via `setJoint`. For a precise camera, copy the exported scene, set `camera:{position:[x,y,z],target:[x,y,z]}`, then call `importScene`. To disable grounding or the grid programmatically, change the exported `floorLock` / `grid` booleans and import it.

## Photo to pose (on device)

The UI **Choose photo · detect & sync** accepts JPEG, PNG, WebP, AVIF, GIF and BMP, at most 25 MB. GIF uses a still frame. EXIF orientation is handled and the image is resized to at most 1600 pixels on its longest side. The browser downloads the pinned MediaPipe model/WASM on first use (about 24 MB), then runs inference in a Worker. Photo bytes, filenames, landmarks and previews are not written into autosave or share URLs. Only the resulting scene is saved/shared.

The detector scans the full image and overlapping crops, merges duplicate hip locations and retains at most six people. People sort left to right and map to existing figure IDs A–F; missing IDs are created using the specified `sex`. The model does **not** infer body type. Existing figure sex, size and outfit are preserved; extra existing figures remain unchanged. Multi-person placement approximates image X/Y positions with a common floor offset, not calibrated inter-person depth; automatic grounding is disabled for these layouts. Adjust placement/contact manually.

The preview overlays colored landmarks, dashed uncertain limbs, selection checkboxes and draggable keypoints. After editing points, **Sync to figures** applies the corrections. Low-confidence limbs keep a neutral pose; incomplete people are skipped. No usable person means no scene mutation. **Cancel**, errors or concurrent scene edits leave the existing scene unchanged. A completed batch can be undone in one step. Head/foot orientation is approximate; fingers, depth, collisions and contact are not solved.

```js
const p = window.poseStudio;
await p.ready;
// Same-origin gallery image URL, or a File/Blob from a local file chooser.
const detection = await p.detectImage('../img/solo_stand_contrapposto-hip_f.png');
// A drawing may return zero people: do not invent a successful detection.
if (detection.people.length) {
  const report = await p.applyDetectedPose(detection, {sex:'female'});
  // report: {applied, added, ignored, reports:[{id, skipped, errors}]}
}
// Local file chooser: #posePhotoFile. Combined API:
// const result = await p.poseFromImage(file, {sex:'male', signal:controller.signal});
// result = {detection, ...report}; use AbortController to cancel.
```

`detectImage(source,{signal,onProgress})` returns `{model,width,height,elapsed,people:[{landmarks,worldLandmarks}]}` with 33 points per person. `onProgress` receives a translation key; fitting additionally passes the current figure and total count. `applyDetectedPose(result, options)` validates the whole input before staging hidden figures and commits atomically. `poseFromImage(source, options)` composes both operations. Keep scene edits serial while fitting. The diagnostic direction errors describe the fit to the model's estimated landmarks, **not accuracy against the real photographed person**.

For corrected keypoints, retain a copy in `person.originalLandmarks`, then edit normalized X/Y in `person.landmarks`; those changes offset the corresponding estimated world points. Preview coordinates use the decoded image orientation, not mirrored camera coordinates. Do not alter MediaPipe point indices or replace anatomical left/right with screen left/right.

## Reusable headless renderer

Download `skills/ai-pose-gallery/scripts/render_studio.mjs` relative to the gallery base, or resolve it inside the installed skill. It requires Node.js and Playwright with Chromium. Prefer an existing Playwright installation. If absent, install in an isolated tools directory:

```bash
npm install --prefix /tmp/pose-studio-tools playwright
/tmp/pose-studio-tools/node_modules/.bin/playwright install chromium
export POSE_PLAYWRIGHT_MODULE=/tmp/pose-studio-tools/node_modules/playwright/index.mjs
```

Example `job.json`:

```json
{
  "figures": [
    {"sex":"female", "height":1.65, "preset":"solo_sit_lean-bk-kn-up",
     "joints":{"head":{"nod":8,"turn":15}},
     "hands":{"l":15,"r":0}, "position":[0,0,0], "ground":true}
  ],
  "camera":"d", "width":1200, "height":1600
}
```

```bash
node scripts/render_studio.mjs --job job.json --output pose.png --scene-out scene.json --preview studio.png
```

For a local photo, add `--image /absolute/path/photo.jpg`; `--detection-out landmarks.json` optionally saves the local detection/report. A job may instead specify same-origin `imageUrl`. Detection happens before the job’s manual pose/figure overrides. Start with one figure in the job to allow automatic population; no photo upload endpoint is involved.

`figures` contains one to six configurations; IDs are A through F. Each accepts the figure properties, `joints`, `hands`, and optional solo `preset` shown above. A top-level `preset` can set a duo pose before per-figure adjustments. `cameraPosition` optionally overrides the camera with `{position,target}`. `--url` permits a local preview or alternate deployed studio. `--share-out scene.url.txt` saves a reusable share link. `--preview` is an optional screenshot of the whole editor; **`--output` is the clean reference image**. The script closes its own browser in `finally`.

Inspect the output PNG, adjust if needed, then attach its actual image bytes/path to the available image-generation tool. Rendering the mannequin is not itself an AIGC illustration: follow the main skill's reference-to-artwork workflow for that additional step.

## Reconstruction status

All 288 gallery groups are tracked in `data/pose-3d-status.json`; 24 have unverified drafts and none have passed accurate reconstruction review. Read `TODO.md` at the site root for the plan: image landmark detection, manual correction, skeleton/camera fitting, constrained IK, multi-view optimization and visual acceptance. Browser photo detection, keypoint correction and constrained initial pose fitting are implemented. Accurate conversion of all gallery drawings, calibrated cameras, multi-view optimization and contact/collision solving remain unfinished. Five sampled gallery line drawings returned no usable detection in the initial smoke check; do not claim this model reconstructs the gallery reliably.

## Line-art recognition status

The display mesh and image detector are independent. Changing the mannequin does not improve image detection. MediaPipe still powers photo detection; the five sampled gallery line drawings produced no usable people. Sketch2Pose’s 2D ONNX front end has been tested offline on 10 gallery images; it is not a browser backend or full 3D reconstruction. Fixed gallery drawings are intended for offline preparation and review, while user photos stay in the browser. The current-reference recognition UI has been removed. As checked on 2026-10-29, Sketch2PoseNet's public repository still says “Coming Soon” and provides no runnable implementation or weights. Do not promise automatic line-art reconstruction. See the repository’s [research note](https://github.com/zhuzhe1983/ai-pose-gallery-zh/blob/main/docs/line-art-pose-research.md).

## Render an existing scene JSON

The headless helper also accepts a saved or offline-fitted scene. Use exactly one of `--job` or `--scene`; `--scene` preserves its camera and figure transforms and cannot be combined with photo detection options.

```sh
node scripts/render_studio.mjs --scene pose.scene.json --output pose.png --width 900 --height 1200
```

Compare the clean render with the actual reference from the same view, including hands, contact points, silhouette and framing. Check other available views before claiming a match. The corrected overhead-heart and raised-arms presets are still drafts; other old presets can have substantial hand/foot/contact errors. The model now uses dual-quaternion skinning with shoulder helpers to reduce large-angle collapse. Picking and grounding use the same deformation; collisions and corrective shapes are still absent.

Maintainers preparing fixed line art can use the repository's [offline pipeline](https://github.com/zhuzhe1983/ai-pose-gallery-zh/tree/main/scripts/offline-pose). Downloaded model weights and upstream inference code stay local; reviewed lightweight scene data can be published separately. Do not present unreviewed fits as accurate reconstructions.
