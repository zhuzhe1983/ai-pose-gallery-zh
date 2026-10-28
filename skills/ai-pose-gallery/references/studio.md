# Pose Studio: characters, joints and PNG captures

Studio: `https://zhuzhe1983.github.io/ai-pose-gallery-zh/studio/`. Add `?lang=zh`, `en` or `ja`. To open a gallery pose, append e.g. `?pose=sexy_sit_w-sit-hands-fw_hi&lang=en`.

The studio uses Mannequin.js's skeleton with custom white articulated figure surfaces and a new UI. It supports one or two adult male/female figures. It renders with Three.js WebGPU, with WebGL 2 fallback displayed accurately in the toolbar. No authentication, server, API key or AIGC service is needed to render white-model PNGs. Source and GPL-3.0 license: `studio/THIRD_PARTY.md`, `studio/LICENSE`.

## Interactive operation

1. Select figure A or B; add a male or female figure (maximum two).
2. Choose a body part from the inspector or click it on the figure. Use labeled sliders, numeric angles, or the rotation rings. Knees and elbows have one bend axis. Hands have a finger-curl slider.
3. Use body type, height, position and facing controls for composition. Turn off automatic grounding to raise a figure off the floor. Drag the empty canvas to orbit; use the wheel to zoom. Camera buttons select front, three-quarter, side, above or below.
4. Gallery tiles marked **3D** load editable hand-authored approximations. Other tiles only display a reference and leave the figure's pose unchanged. Image references are not reconstructed 3D data, and contact points/collisions are not automatically solved.
5. **Capture PNG** exports a 1600 × 1600 image without rings, grid, selection tint, labels or reference card. **Save scene** / **Load scene** preserve editable joints, figures and camera. The browser also autosaves locally. Check the PNG visually before using it for AIGC.

## Automation interface

With any browser automation tool that can evaluate JavaScript in the page:

```js
await window.poseStudio.ready;
const p = window.poseStudio;
p.reset({sex: 'female'}); // deterministic start; replaces the browser's current scene
p.addFigure({sex: 'male', height: 1.8}); // returns 'B'; maximum two
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
```

Save the returned base64 bytes to a `.png` file using the automation environment's file-writing API. Do not print the full data URL into the conversation. Alternatively, `capture({download:true, filename:'pose.png'})` triggers a browser download. Capture serially, and await each call. Sizes: integer 256–4096 per axis. Captures use the current camera position with the requested aspect ratio; inspect the framing when changing aspect ratio. The UI export uses 1600 × 1600; the API allows portrait or landscape captures.

Methods (all synchronous except `ready`, `loadPreset`, `showReference`, `capture`):

| Method | Behavior |
| --- | --- |
| `reset({sex})` | Replace scene with one neutral adult figure A; sex defaults to `female`. |
| `addFigure({sex,height})` | Add figure A/B, automatically space the two figures; returns ID. |
| `removeFigure(id)` | Remove a figure, retaining at least one. IDs of remaining figures stay stable. |
| `selectFigure(id)` | Select A or B in the UI. |
| `setFigure(id,{sex,height,position,yaw,ground})` | Optional properties: sex `female`/`male`; height 1.2–2.2 metres; absolute XYZ position in metres (each −10…10); yaw −180…180 degrees. `ground:true` overrides Y to touch the floor. |
| `setJoint(id,part,angles)` | Set the named angles below, in degrees. Other angles are preserved. |
| `getJoint(id,part)` | Read named angles. |
| `setHand(id,'l'\|'r',curl)` | Curl all fingers on one hand, 0–100 degrees. |
| `neutral(id)` | Reset that figure's pose and hands; retains its body type and height. |
| `listPresets()` | Small array of available `{id,figures,view}`. No gallery index needed. |
| `loadPreset(stem,{actorId,view})` | Load an existing 3D preset. A solo preset affects the selected/explicit figure. A duo preset affects both, adding a second figure if needed. Includes the matching reference; sets camera. Unknown preset throws. |
| `showReference(stem,view?)` | Show a gallery reference without changing the 3D pose. Returns `hasPreset`; unknown image/view throws. |
| `setCamera('f'\|'d'\|'s'\|'hi'\|'lo')` / `frame()` | Fit all figures from a standard view / current direction. |
| `exportScene()` / `getState()` | Return the versioned serializable scene. |
| `importScene(scene)` | Validate then restore a scene, including camera, figures, floor/grid preferences. |
| `undo()` / `redo()` | Restore previous edits. |
| `capture(options)` | Return a clean PNG data URL; optional browser download. |

Valid part and angle names:

| Parts | Angles and limits (degrees) |
| --- | --- |
| `body` | `bend`, `tilt`, `turn`: −180…180. Neutral `turn` is **−90** in the rig; use figure `yaw` for overall facing. |
| `torso` | `bend` −55…70; `tilt` −40…40; `turn` −80…80 |
| `head` | `nod` −65…65; `tilt` −50…50; `turn` −90…90 |
| `l_arm`, `r_arm` | `raise` −70…180; `straddle` −30…160; `turn` −110…110 |
| `l_leg`, `r_leg` | `raise` −70…160; `straddle` −30…100; `turn` −80…80 |
| `l_elbow`, `r_elbow`, `l_knee`, `r_knee` | `bend` 0…155 |
| `l_wrist`, `r_wrist`, `l_ankle`, `r_ankle` | `bend` −90…90; `tilt` −60…60; `turn` −90…90 |

Left/right are the figure's anatomical sides. Positive raise moves a limb forward; positive straddle spreads it outward. Joint angles are fixed-order editor controls, not raw upstream Euler getter sequences. Use this API instead of manipulating Mannequin.js internals. The editor applies soft artistic ranges, not a collision/biomechanics solver.

The scene schema is `pose-atlas/studio@1`. Treat the per-joint quaternion data as opaque: obtain it from `exportScene()` and edit named angles via `setJoint`. For a precise camera, copy the exported scene, set `camera:{position:[x,y,z],target:[x,y,z]}`, then call `importScene`. To disable grounding or the grid programmatically, change the exported `floorLock` / `grid` booleans and import it.

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

`figures` contains one or two configurations; second figure becomes B. Each accepts the figure properties, `joints`, `hands`, and optional solo `preset` shown above. A top-level `preset` can set a duo pose before per-figure adjustments. `cameraPosition` optionally overrides the camera with `{position,target}`. `--url` permits a local preview or alternate deployed studio. `--preview` is an optional screenshot of the whole editor; **`--output` is the clean reference image**. The script closes its own browser in `finally`.

Inspect the output PNG, adjust if needed, then attach its actual image bytes/path to the available image-generation tool. Rendering the mannequin is not itself an AIGC illustration: follow the main skill's reference-to-artwork workflow for that additional step.
