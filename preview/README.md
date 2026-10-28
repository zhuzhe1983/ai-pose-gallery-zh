# Local conversion preview

Run from the repository root:

```sh
python3 scripts/offline-pose/preview_server.py
```

Open **http://127.0.0.1:8767/preview/**. The same service serves the gallery at `/` and the workbench at
`/studio/`. Same-origin embedding is allowed for the gallery’s shared preview renderer. Use `--port 18767` for an isolated test. The bind address is always
`127.0.0.1`; there is no public bind or upload endpoint. Stop with Ctrl+C. Do not
stop an existing service on the port without checking who owns it.

The page polls `GET /api/preview-state` every three seconds. It reads actual files
under `output/sketch-pose-offline/` and `output/offline-pose/`, with no inference,
fitting, publishing, approval or filesystem mutation. A static GitHub Pages host
cannot provide this local API; the page explains how to start the local server.

## Tasks and views

The preview groups gallery images by pose ID: each pose is one task card and its
front, side and other views remain separate comparison rows. The same card also
shows each view's actual per-image status, progress, artifacts and messages.
Views with output are expanded; untouched views are collapsed but remain listed.
Searching for an image ID finds the group; the view filter can narrow its rows.
The blank negative control is a separate card and excluded from gallery image
and group counts. Active/failure/stale task counts are deduplicated by pose;
image counts and fit counts continue to count images and groups separately.

A group's 3D consistency is determined from files, not inferred from filenames.
When two or more valid scenes are present, compare figure IDs and number, mesh,
sex, height, scale, outfit, position, root quaternion and every joint quaternion
with an absolute tolerance of `1e-5`; opposite-sign quaternions represent the
same rotation. Camera and reference are intentionally independent per view.
One scene is `single`; no scene is `none`. Missing/malformed geometry data or
different scene schemas are `unknown`; nonmatching fields are `conflict`, which
prominently requests review. No scene is silently migrated during comparison.
`shared` only means the serialized figure poses match; it does not establish
calibrated cameras, surface contacts, reconstruction quality or formal approval.
The original `items` API remains available; `groups` is the grouped task view.

## Counts and evidence

- Gallery inventory and formal group status come from `data/pose-3d-status.json`
  and existing source images. Images and pose groups have separate counts.
- Valid 18-point inference records are deduplicated by source image. The blank
  negative control is counted separately. Existing experiment fixtures under
  `cli-failure*` are excluded from task-progress scans.
- `*.fit.json` records are 3D drafts. `ready/*.scene.json` only means that a draft
  has passed the local preparation stage; **ready does not mean verified**.
- Formal verified counts only come from coverage records marked `verified`.
  Raw inference, a low reprojection error, a rendered PNG, and a scene file never
  approve a pose. All existing manually authored presets are shown separately.
- Scenes `pose-atlas/studio@1`, `@2` and `@3` are supported. Per-scene mesh revisions
  are shown; a scene using a different revision than the current studio is labeled
  an older draft. Import/migration in the studio does not approve it.
- Canonical render locations are `drafts/IMAGE.png`, `ready/IMAGE.png`, or
  `renders/IMAGE.png`, where `IMAGE` includes the view suffix. Explicit progress
  artifacts can name other permitted local output paths. Historical `kneel.png`
  and `grounded-arms-up.png` are shown separately as old renders not tied to the
  latest scene; they do not increase the linked-render count.
- The algorithm remains the Sketch2Pose ONNX **2D front end** plus the original
  constrained editor fitter, not the complete Sketch2Pose method.

Scene buttons use `/studio/?previewScene=ENCODED_LOCAL_SCENE_PATH&lang=zh`. The
studio accepts only same-origin, safe `.scene.json` files under
`/output/offline-pose/ready/` or `/output/offline-pose/drafts/`, and applies its usual
scene validation and migration. Unsupported scene locations should be downloaded
and reviewed manually, not loaded from an arbitrary remote URL.

## Optional atomic progress file

Workers may write `output/offline-pose/status.json`. The server never creates or
updates it. Without an explicit status, existing artifacts alone do not imply that
a task is currently running. Supported format:

```json
{
  "schema": "pose-atlas/offline-progress@1",
  "jobs": [
    {
      "image": "img/solo_stand_arms-up-stretch_f.png",
      "stage": "fit",
      "status": "running",
      "updatedAt": "2026-10-29T01:00:00+00:00",
      "message": "Running constrained fit",
      "progress": {"completed": 2, "total": 4, "unit": "steps"},
      "artifacts": {
        "scene": "/output/offline-pose/drafts/solo_stand_arms-up-stretch_f.scene.json",
        "render": "/output/offline-pose/renders/solo_stand_arms-up-stretch_f.png"
      }
    }
  ]
}
```

This is a protocol example, not a claim that this task is running. Valid statuses:
`not_started`, `queued`, `running`, `failed`, `draft`, `needs_review`, `done`.
`done` is displayed as needing review, never as verified. A running job requires
a timezone-aware heartbeat; after 180 seconds without one it is shown as stale,
not running or failed. Future timestamps more than 60 seconds ahead also count as
stale. `progress` is optional and displayed only when its actual completed/total
numbers are valid; there is no invented overall conversion percentage.

Use a temporary file and atomic rename on the same filesystem:

```python
import json, os
from pathlib import Path
path = Path("output/offline-pose/status.json")
temporary = path.with_suffix(".json.tmp")
temporary.write_text(json.dumps(actual_status, ensure_ascii=False) + "\n")
os.replace(temporary, path)
```

Only existing artifacts with allowed paths are linked. A declared completed task
without output files does not increase inference/fit/grounded counts. Do not put
private uploaded-photo paths in this gallery conversion status file: only known
gallery images and the explicit blank control are associated with cards.

## Read-only boundary and checks

The service has an explicit static-file allowlist, rejects traversal (including
encoded traversal), hidden paths, symlinks, directory listings, unknown output
extensions, and non-loopback Host headers. Research `.onnx`/`.pt`/`.zip`/`.npz`
assets and executable scratch files are not served. The studio's already-vendored
MediaPipe model/WASM and CC0 display GLBs remain available for normal local studio
operation. No POST/PUT/PATCH/DELETE actions are accepted.

```sh
python3 -m unittest discover -s scripts/offline-pose -p 'test_preview.py'
python3 -m py_compile scripts/offline-pose/preview_server.py
node --check preview/preview.js
```
