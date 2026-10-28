---
name: ai-pose-gallery
description: Find pose references or pose one to six male/female figures in the gallery’s Mannequin.js WebGPU studio, export PNG references, then use them for AIGC artwork. Use for compact image URLs, local photo-to-pose detection, character/joint limits, URL scene sharing, camera angles, and pose-guided generation.
---

# AI Pose Gallery

Base URL: `https://zhuzhe1983.github.io/ai-pose-gallery-zh/` (keep the repository path and trailing slash). Public static files; no login or API key. Website languages: `?lang=zh`, `?lang=en`, `?lang=ja`. Image names never change with language.

## Choose a reference workflow

- **Existing gallery pose:** use the compact URLs below; no browser rendering is needed.
- **Custom or multi-person pose:** open `studio/` and read [references/studio.md](references/studio.md). It covers adding/deleting up to six male/female figures, 80–120% scale, bounded joint controls, URL sharing, draft presets, cameras and clean PNG captures through `window.poseStudio`. A reusable headless helper is [scripts/render_studio.mjs](scripts/render_studio.mjs). Both files are available under `skills/ai-pose-gallery/` on the same site. This avoids loading the full image index or rediscovering the UI.
- **Photo to editable pose:** open `studio/`, choose a local photo, and let the browser detect and sync up to six people (adding missing figures). Read [references/studio.md](references/studio.md#photo-to-pose-on-device) for the API, confidence handling, cancellation and headless `--image` helper. Photos stay on the device; inspect and refine the approximate result before generating artwork. The “detect current reference” UI is removed. Fixed gallery line art uses a separate offline preparation workflow; it is not reliably recognized by the browser photo model.
- **AIGC artwork:** first obtain and visually inspect a gallery PNG or studio capture, then attach it to the image tool as described below.

## Direct image access

Original: `img/{type}_{category}_{pose}_{view}.png` (900 × 1200).
Thumbnail: `thumbs/{type}_{category}_{pose}_{view}.jpg` (300 × 400).

Use lowercase ASCII, `_` between fields, `-` within pose tokens; filenames are limited to 64 characters including the extension. Canonical names are fixed, not arbitrary English translations.

- Types: `solo` = standard solo full body; `sexy` = sensual solo full body; `upper` = upper body; `duo` = two people.
- Views: `f` = front, `d` = diagonal / three-quarter, `s` = side, `hi` = high angle, `lo` = low angle.
- Common categories: `sit`, `stand`, `kneel`, `side-sit`, `lie`, `squat`, `bend` (forward lean), `arch` (backbend), `twist`, `floor` (kneeling / all fours), `spec` (special), `cute`, `chest`, `bold`.
- Pose abbreviations: `bk` back, `fw` forward, `kn` knee, `kns` knees, `hd` head, `sh` shoulder, `elb` elbow, `elbs` elbows, `ank` ankle, `sup` support. `up/down/in/out` describe direction. `v/m/s` can describe a shape; `supine/prone` mean face up / face down. `seiza`, `w-sit`, `contrapposto` are conventional pose terms.
- Additional duo categories: `face`, `miss` (missionary), `rear`, `bk-sit`, `strad` (straddling), `side-lie`, `face-sit`, `stand-close`, `sit-close`, `close`.

Known direct reference: `img/solo_sit_lean-bk-kn-up_f.png` — leaning back with one knee raised. Replace `_f` with `_d` for its three-quarter view. Another example: `img/upper_cute_heart-chest_f.png`.

If the exact canonical pose token is already known, fetch the image directly. Otherwise read only `data/catalog/{type}/{category}.json`, e.g. `data/catalog/solo/sit.json`. Each row contains `pose`, `name` in zh/en/ja, and available `views`; combine these with the filename template. If the category is unknown, first read `data/catalog.json`. A pose may lack some views. On 404, consult its category once; do not keep guessing names. Do not load the full 1439-image index for routine selection.

Gallery 3D previews share one renderer. **Add to 3D Studio** appends available poses without replacing saved figures. Use separate `pelvis`, `waist`, `chest` controls and optional `setFootLock`, `setChestLock`, `setMirrorSync`, and `moveJointTarget` through the [studio API](references/studio.md); old scenes migrate automatically. Missing 3D conversions remain pending. For local conversion progress, run the checkout's `scripts/offline-pose/preview_server.py` and open `http://127.0.0.1:8767/preview/`.

## Optional helper (Python 3, standard library)

Resolve `scripts/pose_ref.py` relative to this skill directory. If you fetched only this SKILL.md, either use the URLs directly or also download `skills/ai-pose-gallery/scripts/pose_ref.py` from the base URL. No full-repository clone is needed.

```bash
python3 scripts/pose_ref.py list --system solo --category sit --query 'knee'
python3 scripts/pose_ref.py url --system solo --category sit --pose lean-bk-kn-up --view d
python3 scripts/pose_ref.py download --system solo --category sit --pose lean-bk-kn-up --view d --output-dir ./pose-refs
```

`catalog` lists collections and categories. `list --query` supports Chinese, English and Japanese. `download` prints the absolute local path and source URL; `--thumb` fetches a preview. `url` only constructs a URL and does not verify availability.

## Use the reference for AIGC

1. Match the requested body framing, number of people, action and camera angle. Preview the candidate; inspect the original before using it. Prefer a single matching view unless the generation task needs more.
2. Download the original PNG and pass its actual bytes, attachment or local path to the current image tool's reference-image input. A URL written only in the prompt is not an attached reference. Use the environment's supported tool or image-generation skill; do not invent an endpoint or claim to have generated an image without calling it.
3. Specify what the reference controls: joint positions, weight distribution, silhouette, crop and camera angle. Separately describe the requested subject, clothing, setting, lighting and style. Do not copy the gray mannequin appearance unless requested. For an OpenPose workflow, first extract and inspect the skeleton with a compatible preprocessor; these PNGs are mannequin drawings, not OpenPose maps.
4. Example prompt: “Use the attached image for body pose and camera angle. Keep the seated backward lean, raised knee and supporting arm. Create an adult traveler wearing a jacket and trousers in a sunlit station, soft painted illustration. Preserve the intended pose and natural anatomy; replace the mannequin appearance.” Adapt the subject and style to the user.
5. Inspect the generated image for limb placement, hands, contact points and view consistency; revise if needed. Deliver the result with the reference filename and source link. If image generation is unavailable, provide the downloaded reference and prompt, and say that generation was not performed.

The gallery and 3D studio provide pose references, not an AIGC generation service. The studio uses Mannequin.js under GPL-3.0 with a redesigned UI and CC0 adult MakeHuman/MPFB skinned meshes; its license and source notices are retained in `studio/`. Images and original data belong to ギア; the repository's MIT license covers code, not the image collection. Follow the source creator's terms and the chosen tool's content rules.
