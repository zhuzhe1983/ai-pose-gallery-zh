# Offline line-art pose experiment

This directory contains an original, model-independent batch runner, a strict 2D
interchange format, and a local review report. It does **not** contain Sketch2Pose
source code, pretrained weights, SMPL-X, SPIN, or a 3D pose solver. It does not
change the browser's MediaPipe photo workflow.

The intended workflow is: local line drawing → locally supplied inference adapter
→ unreviewed 18-point JSON → visual review / excluded points → a separate 3D fitter
→ reviewed lightweight scene data. A completed inference is not a successful
recognition or an approved pose. No output is automatically copied into `data/` or
published.

## Run locally

Use Python 3.10+ and install `requirements.txt` in your own virtual environment.
The adapter has its own dependencies, installed separately. Model weights must be
obtained and used under their applicable terms. This runner never downloads them.

```sh
python -m pip install -r experiments/sketch-pose-offline/requirements.txt
python experiments/sketch-pose-offline/batch.py \
  --manifest experiments/sketch-pose-offline/sample-manifest.json \
  --adapter /absolute/path/to/local_adapter.py \
  --model /absolute/path/to/local_model.onnx \
  --output output/offline-pose-run-001
```

The manifest's image paths are relative to the manifest file. The output directory
must be new or empty so earlier experiments are preserved. The output includes
`results.json`, individual JSON records, numbered SVG overlays with embedded source
pixels, and `report.html`. Open the report locally; it makes no network requests.
Inference exceptions are recorded per image and processing continues. Exit status
is 0 for complete processing, 1 if any image failed, and 2 for invalid setup. An
interrupted run preserves its completed records. Output files still need review.

The supplied Python adapter is trusted executable code and must be an explicitly
chosen local file. Its interface is:

```python
DESCRIPTION = "Backend, preprocessing, model provenance, limitations"

def load_model(model_path, threads):
    # Return a reusable model handle. model_path is a pathlib.Path.
    ...

def predict(model, image_path):
    # Return the record described below. Do not transpose EXIF orientation:
    # coordinates correspond to the source image's encoded pixel grid.
    ...

def close(model):  # optional; always called after successful model loading
    ...
```

Keep adapters that import unlicensed upstream code outside the published source
tree. A local adapter can import a separately obtained upstream checkout; this
repository provides neither that checkout nor its implementation. The runner adds
source/model/adapter/manifest SHA-256 hashes and records model-load time and three
predict-call timings per image by default. Timings exclude report generation and
are specific to the machine and adapter.

## `pose-keypoints/1`

Each prediction requires `width`, `height`, `coordinate_system`,
`confidence_kind`, and `points`. The runner adds `schema`, `image`, provenance,
timings, diagnostics and `review_status: "unreviewed"`.

```json
{
  "width": 900,
  "height": 1200,
  "coordinate_system": "original_image_pixels_x_right_y_down",
  "confidence_kind": "heatmap_peak_uncalibrated",
  "points": [
    {"id": 0, "name": "head", "x": 420.5, "y": 143.2, "confidence": 0.93}
  ]
}
```

The abbreviated example shows the data shape only; real records require all 18
points. The origin is the image's upper-left corner, x increases rightward, and y
increases downward. Coordinates remain floating-point original-image pixels,
including predictions outside the image. No normalization or clipping is applied.
The optional input `id` must match the name. Output points always use this order:

| ID | Name | Meaning |
| --- | --- | --- |
| 0 | `head` | Head center, not nose |
| 1 | `neck` | Neck |
| 2 | `right_shoulder` | Anatomical right shoulder |
| 3 | `right_elbow` | Right elbow |
| 4 | `right_wrist` | Right wrist, not fingertips |
| 5 | `left_shoulder` | Anatomical left shoulder |
| 6 | `left_elbow` | Left elbow |
| 7 | `left_wrist` | Left wrist |
| 8 | `spine` | Mid-torso landmark; rig pivot may differ |
| 9 | `pelvis` | Central hips landmark; rig pivot may differ |
| 10 | `right_hip` | Right upper-leg/hip joint |
| 11 | `right_knee` | Right knee |
| 12 | `right_ankle` | Right foot root / ankle |
| 13 | `left_hip` | Left upper-leg/hip joint |
| 14 | `left_knee` | Left knee |
| 15 | `left_ankle` | Left foot root / ankle |
| 16 | `left_toe` | Left toe endpoint |
| 17 | `right_toe` | Right toe endpoint |

Names represent the model's anatomical labels, not verified left/right identity.
Back views and overlapping limbs can be mislabeled. Heatmap peaks are raw model
responses, **not calibrated probabilities or visibility scores**; values above 1
are valid and preserved. A fixed peak threshold cannot by itself distinguish
occlusion from failure. The single-person model can return all 18 points on a blank
image and cannot identify multiple people. Diagnostics only flag malformed data,
out-of-image points, coincident points, and peak ranges; they do not approve poses.

## Initial local experiment

The private baseline used upstream Sketch2Pose commit
`c027b65219b1eaba3c3f979a7e86ad19502d8f73`, specifically its `pose_estimation.py`
preprocessing/decoder and `hrn_w48_384x288.onnx` front end. This is **not the complete
Sketch2Pose method**: no contact network, SPIN optimization, SMPL-X assets, depth
recovery, or 3D fitting ran. Upstream code and the downloaded archive did not expose
a redistribution license, so neither is included here. See the
[upstream repository](https://github.com/kbrodt/sketch2pose) for provenance.

Preprocessing in that private baseline used OpenCV BGR input, an aspect-preserving
centered affine crop with 1.25 padding, ImageNet normalization, heatmap maxima with
quarter-pixel refinement, and the inverse affine map back to original pixels. The
upstream RGB conversion is commented out; this needs attention for colored images.
The ONNX header declares input `[1,3,288,384]`, while the upstream OpenCV path runs
`[1,3,384,288]` and returns `[1,18,96,72]`. OpenCV accepted this; ONNX Runtime's fixed
input-shape check does not. Do not silently interchange the dimensions when
switching backends.

Ten gallery images cover standing, raised arms, a true back view, sitting, side
sitting, kneeling, side kneeling, supine, prone and squatting. A separate all-white
negative control was also run. On the local Apple M5 Max, OpenCV DNN CPU with four
threads took approximately 98–104 ms per gallery image (median of three calls,
including preprocessing/decoding), plus about 107 ms model loading. These are
small-sample local timings, not a general performance claim.

Visual inspection found useful correspondences for many visible landmarks in
standing, raised-arms, front kneeling and supine examples. Overlapping side-view
limbs, occluded prone arms, and squatting pelvis/hip/knee assignments require
review. The white control still yielded 18 points with peaks around 0.034–0.282;
gallery peaks reached 1.066. No precise human landmark annotations or accuracy
metric exist for this experiment. Private overlays, raw heatmaps, timings and
preliminary exclusion notes live under ignored `output/sketch-pose-offline/` and
are not bundled or automatically published.

## Checks

```sh
python -m unittest discover -s experiments/sketch-pose-offline -p 'test_*.py'
python -m py_compile experiments/sketch-pose-offline/*.py
```

Unit tests use artificial protocol fixtures solely to test validation, never as
recognition evidence. Model evaluation must use actual input images and retain
negative controls, failures, and manual review separately from predictions.
