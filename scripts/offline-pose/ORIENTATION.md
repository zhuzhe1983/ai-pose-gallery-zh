# Endpoint orientation hints for offline fitting

Sketch2Pose’s tested 18-point output supplies head/neck and elbow/wrist locations,
plus an approximate ankle/toe direction when the toe point is usable. It contains no face, palm, fingertip or
sole-normal observations. Consequently **a location match does not determine the
3D orientation of the head, hands or feet**. A low pixel reprojection error is
not evidence of correct rotation or contact.

The default single-view fitter holds the root body, neck, head and both wrists at their
preset/neutral starting angles. It separately fits the pelvis and uses only ankle
`bend` with the approximate toe marker. Head and hand orientation and ankle
`tilt`/`turn` stay marked `unresolved`; ankle `bend` is `fitted_approx` only when its toe observation is usable, and otherwise is held at the prior and marked `unresolved`. These
labels remain true even if a starting preset happens to look plausible. Torso
and camera can also change the apparent world orientation. Always compare the
full model against all available views and check contact and facing manually.

A reviewer can provide explicitly sourced **local editor-angle hints** for
selected axes using this format (illustrative angles; not a reviewed sample):

```json
{
  "schema": "pose-atlas/orientations@1",
  "pose": "solo_stand_arms-up-stretch",
  "joints": {
    "head": {"nod": 8, "turn": 12},
    "l_wrist": {"bend": -15},
    "r_ankle": {"tilt": 8, "bend": 20}
  },
  "evidence": {
    "head": [{"image": "img/solo_stand_arms-up-stretch_f.png", "note": "Manual visual estimate; requires review."}],
    "l_wrist": [{"image": "img/solo_stand_arms-up-stretch_f.png", "note": "Hand orientation estimate; inspect additional views."}],
    "r_ankle": [{"image": "img/solo_stand_arms-up-stretch_f.png", "note": "Foot orientation estimate; inspect additional views."}]
  }
}
```

Use `--orientations path/to/hints.json` with `fit_pose.py`. The six supported
joints are `neck`, `head`, `l_wrist`, `r_wrist`, `l_ankle`, `r_ankle`; neck and head accept
`nod`, `tilt`, `turn`, all others accept `bend`, `tilt`, `turn`. Values are
editor-local degrees, not a world-space rotation or a detection probability.
Every provided joint requires at least one existing gallery image for the same
pose and a descriptive nonempty note. Limits come from the exported rig. Unknown
fields, paths/views, missing evidence, missing rig controls, out-of-range or
nonfinite angles are rejected; export a new rig if an old one lacks wrist axes.
Only supplied axes are marked `recorded_manual` and fixed to that value. Other
axes remain unresolved or, for ankle bend, approximated. A recorded manual hint
is still an input assumption and does not mark a pose verified.

A new rig must be exported against the current studio. With the segmented spine
it contains **46 controls**, including three independent neck controls and the six wrist controls, and 18 approximate
landmarks. Export a new rig for independent neck/head edits (`jointControlVersion: 5`). Previous 43-control rigs couple head and neck; to reproduce their numeric head hints with the new rig, split each old angle equally between `neck` and `head` and supply evidence for both. Already fitted scene quaternions remain compatible. An old 37-control rig cannot express wrist hints. Run validation:

```sh
POSE_FITTING_RIG=output/model-research/rig-v3-endpoints.json \
  output/offline-pose/venv/bin/python -m unittest discover -s scripts/offline-pose -p test_orientation_hints.py
```

A real exported rig is used when `POSE_FITTING_RIG` is set; without it, schema
and validation checks run and the integration case is skipped. All resulting
scenes are drafts requiring multi-view comparison and human correction.
