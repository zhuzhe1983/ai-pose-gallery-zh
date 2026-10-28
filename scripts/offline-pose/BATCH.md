# Local full-gallery conversion queue

`run_batch.py` schedules every pose group once. All usable views share one figure
pose; each has a separate camera and render. Outputs stay under ignored `output/`.
It never publishes, replaces the website's preset library, or marks a pose verified.

Install the batch dependencies in the local venv, supply the existing local adapter
and weight file, export the current rig, and leave the loopback preview server running:

```sh
output/offline-pose/venv/bin/python -m pip install -r scripts/offline-pose/requirements-batch.txt
node scripts/offline-pose/export-rig.mjs --output output/offline-pose/rig-contact.json
output/offline-pose/venv/bin/python scripts/offline-pose/run_batch.py \
  --adapter output/sketch-pose-offline/local_adapter.py \
  --model output/sketch-pose-wasm/hrn_w48_384x288.onnx \
  --rig output/offline-pose/rig-contact.json --run gallery-YYYYMMDD
```

The adapter and weights are local prerequisites, not included in this repository.
Use `POSE_PLAYWRIGHT_MODULE` if Playwright is installed outside this checkout.
`--only POSE_ID ...` runs a subset; `--max-evaluations` sets the per-branch budget.
The worker needs the running studio at `--url` (default localhost port 8767).

Open **http://127.0.0.1:8767/preview/**. The progress file has actual per-image
states and 15-second heartbeats; the page counts completed/queued/running groups.
Each rendered group links a source-versus-render comparison, shared scenes and a
multi-view report. A job completing does not mean its numerical or visual review
passed. Reports retain the reasons for rejection, unusable views, observation
provenance, camera branch, joint limits and actual skinned floor measurements.

A filesystem lock prevents two workers from writing the queue. Reusing an unchanged
`--run` resumes from group receipts; changing rig/model/adapter/pipeline or selected
poses requires a new run ID. Existing canonical drafts and scenes are backed up
under that run's `before/` before replacement. Interrupting the worker preserves
completed receipts and artifacts. SIGTERM/SIGINT closes its current rendering
browser. Stop only the PID in `output/offline-pose/runs/RUN/worker.pid` after checking
its command; preserve the separate preview server. Do not launch duplicate queues.

## Evidence and boundaries

- **153 full-body solo groups:** shared multi-view constrained fitting. Existing
  presets seed known poses; others use clearly labeled neutral/category priors.
  Poor points, ambiguous cameras, inconsistent drawings and incompatible body
  proportions can still produce a rejected draft. Raw heatmap peaks are not confidence
  probabilities. No completed draft is silently promoted into the public gallery.
- **80 upper-body groups:** only visible head/neck/arms participate. Hips, legs and
  ankles remain fixed and are explicitly labeled *not reconstructed*. Cropped-away
  anatomy is never inferred from the model's spurious lower-body keypoints.
- **55 duo groups:** explicitly fail with the reason that the local 18-point network
  cannot separate people. They remain in the full manifest and progress counts;
  no single skeleton is presented as a reconstructed two-person scene.
- Existing landmark exclusions remain enforced. Two usable views are required.
  Reviewed visual annotations in `annotations/` can replace a bad observation for
  fitting only; the original machine record and overlay remain unchanged.
- Manual annotations use `manual_binary_visibility`, meaning supplied/hidden, and
  `manual_visual_estimate_not_ground_truth`. They are approximate visual estimates,
  not detector outputs or accuracy ground truth. Hidden side-view limbs stay excluded.

## Surface contacts and front/side correction

`studio/contact-markers.js` exports real neutral-skin toe endpoints, palm guides,
front-thigh patches and foot/knee/shin surface regions. The fitting rig contains
vertex positions, weights and inverse bind matrices. `Rig.skin_points` reproduces
the studio's dual-quaternion skinning; browser comparisons have checked neutral
and bent poses. Merely using a rigid joint offset or a few surface extremes missed
knee deformation and falsely reported a grounded foot, so support regions retain
all qualifying vertices and rendering rechecks the entire actual mesh.

`contacts.py` applies the explicitly reviewed relationship for
`solo_kneel_hands-thighs`: palms toward the front of each thigh, fingers toward the
knees, both knees/shins/feet at one support plane. Front/side observations and the
visible side-camera direction are recorded. The corrected pose stays shared and
fixed while cameras are framed; noisy 2D detections cannot pull it back into a
floating or twisted pose. The camera fit is still a draft, not calibrated truth.
The production renderer additionally rejects this contact profile if the actual
foot or calf region floats more than 15 mm above the floor. The studio intentionally
keeps a 3 mm floor clearance to prevent rendering artifacts.

Other poses **do not inherit** this kneeling contact relationship. Their contact
report stays unresolved unless a reviewed profile exists. Automatic grounding
only translates the whole figure by its true mesh minimum; it does not establish
weight distribution, toes/sole orientation, hand/finger contact, self-collision or
multi-person contact. Separate toe bones, per-finger surface fitting and full
collision/contact inference remain future work.

Run numeric checks with the actual rig:

```sh
POSE_CONTACT_RIG=output/offline-pose/rig-contact.json \
POSE_MULTIVIEW_TEST_RIG=output/offline-pose/rig-contact.json \
POSE_FITTING_RIG=output/offline-pose/rig-contact.json \
output/offline-pose/venv/bin/python -m unittest discover -s scripts/offline-pose -p 'test_*.py'
```

Synthetic projections validate the implementation, not recognition accuracy.
