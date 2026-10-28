# Multi-view offline draft fitting

`fit_multiview.py` fits **one shared editor skeleton** to two to five 18-point
records from the same pose group, with a separate bounded perspective camera for
each view. It reuses `Rig`, `project` and `observations` from `fit_pose.py`; it does
not implement full Sketch2Pose, SPIN, SMPL-X or endpoint recognition.

Run an experiment outside the live preview's scanned directories:

```sh
output/offline-pose/venv/bin/python scripts/offline-pose/fit_multiview.py \
  --rig output/offline-pose/rig-v3.json \
  --inputs output/sketch-pose-offline/solo_kneel_hands-thighs_f.json \
           output/sketch-pose-offline/solo_kneel_hands-thighs_s.json \
  --exclude s:right_shoulder,right_elbow,right_wrist,right_knee,right_ankle,right_toe \
  --output-dir output/model-research/multiview-experiment/my-run \
  --starts 2 --max-evaluations 1200
```

The example excludes the occluded/overlapping right-side profile chain. The
remaining side-view landmarks are still machine estimates, not approved human
annotations. Do not silently restore excluded points merely to get a lower error.
The inherited observation validator requires at least eight usable points and
three shoulder/hip anchors per view; too little evidence is rejected explicitly.

Outputs:

- `POSE_f.scene.json`, `POSE_s.scene.json`, etc.: identical joint quaternions,
  different cameras. Scenes inherit `pose-atlas/studio@3` from the actual v3 rig.
- `draft.scene.json`: the first supplied view, for convenience.
- `POSE.multiview.json`: all angles, fixed controls, camera candidates and bounds,
  per-view reprojections, excluded points, solver status and endpoint uncertainty.

An old mesh/scene rig, old/normalized point protocol, unknown view suffix, duplicate
views, mixed pose groups, invalid exclusions and out-of-range manual angles are
rejected. Numerical tests support both the previous 37-control v3 export and the
43-control export with wrists. Non-neutral wrist priors or explicit wrist hints
require the newer export.

## Fixed and unresolved degrees of freedom

All three `body` root angles are fixed to the manual prior. Pelvis angles remain
available for anatomical adjustment, so the body/pelvis same-pivot duplicate
rotation is removed. The baseline is the exported manual preset, or an explicit
flat named-angle JSON supplied via `--prior`. A pose with no manual preset needs
an explicit prior; an unverified preset is still only a prior.

All head and wrist axes are held at their prior values. A head-center point or
wrist-center point does not observe orientation. Ankle `bend` is active only if
that ankle and toe are usable in at least two supplied views; otherwise it also
stays at the prior. Ankle `tilt`/`turn` stay fixed unless manually supplied. The
approximate ankle-to-toe axis does not establish foot roll or palm/head facing.

`--orientations FILE` uses the shared `orientation_hints.py` loader and its
`pose-atlas/orientations@1` evidence protocol. Supplied axes are fixed, not optimized.
The Python function also accepts a flat `manual_hints` mapping and validated
`orientation_evidence`; callers using that lower-level interface own evidence
validation. Unspecified axes remain unresolved in the report even when a prior
provides a convenient numerical value. A manual hint is not a verified fit.

## Cameras and ambiguity

The camera model has fixed 35° vertical field of view, azimuth, elevation, distance
and two target offsets. Initial framing is estimated from the actual posed rig
extent, then only distance/target are adjusted before shared optimization.

| View | Azimuth center | Elevation center | Hard angle half-widths |
| --- | --- | --- | --- |
| f | 0° | 5° | ±12° azimuth, ±12° elevation |
| d | +38° or −38° | 5° | ±14°, ±12° |
| s | +90° or −90° | 3° | ±12°, ±12° |
| hi | 6° | 55° | ±20°, ±20° |
| lo | 0° | −25° | ±18°, ±15° |

Side-view filenames do not identify which side of the person is visible. The
solver explicitly tries both bounded `s` branches; `d` likewise has two signs.
Use `--side-camera positive|negative` or `--diagonal-camera positive|negative`
when independent visual evidence resolves the sign. Default `auto` records the
candidate costs. Similar-cost direction alternatives are marked ambiguous.
These alternatives do not permit a front camera to orbit to the back to hide a
bad fit. Unusual source cameras may be incompatible with the defaults; rejection
is preferable to silently reinterpreting the view tag.

## Review gates and limitations

Every output remains a draft with `verified: false`. The numerical review gate
rejects per-view RMS above 2.5% of the larger image dimension, a point error above
8%, camera-angle boundary saturation, optimized spine-angle limit saturation,
opposing spine rotations beyond ±15° on the same axis,
invalid camera depth, strong opposing spine rotations, a nonconverged solve or unresolved camera-sign alternatives.
These are explicit diagnostic thresholds, not a calibrated accuracy measure.

High cross-view residuals can arise from inconsistent drawings, mistaken landmark
labels, fixed body proportions or incorrect camera assumptions. The report does
not pretend to distinguish those causes automatically. Opposing pelvis/waist/chest
rotations and joint-limit hits are listed explicitly and rejected by the gate. The opposing-rotation gate
requires manual review even if the projections agree; it is a conservative review
rule, not a claim that every counter-rotation is anatomically impossible. There is no collision,
ground-contact or hand-to-thigh constraint. A low projection error does not prove
that a side view, palm orientation or contact is correct.

Render **every supplied view** with the existing `render_studio.mjs` helper and
inspect it alongside the original before putting a scene into a visible `ready`
directory. The helper reads a local scene directly; research outputs do not need
to be exposed by the preview server.

```sh
POSE_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
node skills/ai-pose-gallery/scripts/render_studio.mjs \
  --url http://127.0.0.1:8767/studio/ \
  --scene output/model-research/multiview-experiment/my-run/POSE_s.scene.json \
  --output output/model-research/multiview-experiment/my-run/POSE_s.png \
  --width 900 --height 1200
```

## Numerical checks

```sh
output/offline-pose/venv/bin/python -m unittest discover \
  -s scripts/offline-pose -p 'test_multiview.py'
```

Tests use the actual local `output/offline-pose/rig-v3.json` by default; set
`POSE_MULTIVIEW_TEST_RIG` to check another exported v3 rig. They project a known
synthetic pose into two cameras and verify low 2D/3D landmark error, the negative
side-camera branch, identical shared joints, fixed root/endpoints, missing-toe
behavior, manual-axis preservation, invalid-input rejection, high-residual
rejection and opposing-spine rejection despite matching projections.
Synthetic tests validate implementation only; they are never counted
as gallery recognition or reconstruction evidence.
