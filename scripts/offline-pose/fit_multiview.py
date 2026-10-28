#!/usr/bin/env python3
"""Shared editor skeleton + bounded per-view cameras; draft geometry, never approval.

Original local tooling. Reuses the exported editor FK and 18-point protocol;
does not implement full Sketch2Pose, SPIN, SMPL-X, or endpoint recognition.
"""
import argparse
import copy
import itertools
import json
import math
from pathlib import Path
import re
import time

import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

from fit_pose import Rig, camera_vectors, observations, project
from orientation_hints import load_orientation_hints, orientation_assessment
from contacts import Contacts


# (absolute azimuth, elevation, hard azimuth half-width, hard elevation half-width)
# Signs for s/d are discrete alternatives, not a free orbit around the figure.
VIEW_PRIORS = {
    "f": (0, 5, 12, 12),
    "d": (38, 5, 14, 12),
    "s": (90, 3, 12, 12),
    "hi": (6, 55, 20, 20),
    "lo": (0, -25, 18, 15),
}


def identity(record):
    if not isinstance(record, dict) or not isinstance(record.get("image"), str):
        raise ValueError("Each view needs an image filename")
    match = re.fullmatch(r"([a-z0-9][a-z0-9_-]*)_(f|d|s|hi|lo)", Path(record["image"]).stem)
    if not match:
        raise ValueError("Image filename must end in a supported f/d/s/hi/lo view")
    pose, view = match.groups()
    if "view" in record and record["view"] != view:
        raise ValueError("Explicit view disagrees with the image filename")
    return pose, view


def require_current_rig(rig):
    keys = {c["key"] for c in rig.controls}
    if rig.data.get("mesh") != "makehuman-v3" or rig.data.get("template", {}).get("schema") != "pose-atlas/studio@3":
        raise ValueError("Re-export the makehuman-v3 / studio@3 rig; old rig inputs are unsupported")
    if not {"body", "pelvis", "waist", "chest"} <= keys:
        raise ValueError("The rig must expose separate body, pelvis, waist and chest controls")
    if len(rig.data["template"]["figures"]) != 1:
        raise ValueError("Multi-view fitting currently supports exactly one figure")


def resolve_prior(rig, pose_id, prior=None, manual_hints=None):
    names = [f"{c['key']}.{c['property']}" for c in rig.controls]
    preset = rig.data.get("presets", {}).get(pose_id)
    if preset is None and prior is None:
        raise ValueError("A manual prior is required for this pose; provide prior angles explicitly")
    source = dict(preset or {})
    source.update(prior or {})
    hints = manual_hints or {}
    if not isinstance(hints, dict) or not isinstance(source, dict):
        raise ValueError("Prior/manual_hints must be flat named-angle mappings")
    for key in hints:
        if key not in names:
            raise ValueError(f"Rig has no {key}; re-export the rig before applying this hint")
    for key, value in source.items():
        if key not in names and not re.fullmatch(r"[lr]_wrist\.(bend|tilt|turn)", key):
            raise ValueError(f"Unknown prior angle: {key}")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"Invalid prior angle: {key}")
        if key not in names and abs(value) > 1e-9:
            raise ValueError("A non-neutral wrist prior requires a new rig with wrist controls")
    source.update(hints)
    values = rig.defaults.copy()
    for i, control in enumerate(rig.controls):
        value = source.get(names[i], values[i])
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not control["min"] <= value <= control["max"]:
            raise ValueError(f"Prior/manual angle outside limits: {names[i]}")
        values[i] = value
    return values, names


def camera_start(world, observed, weights, width, height, azimuth, elevation):
    """Initialize framing from this view's actual prior extent, then fit framing only."""
    used = weights > 0
    _, _, right, up, _ = camera_vectors([azimuth, elevation, 3, 0, 0])
    focal = height / (2 * math.tan(math.radians(35) / 2))
    extent = max(float(np.ptp(world[used] @ up)), .12)
    observed_extent = max(float(np.ptp(observed[used, 1])), 80)
    distance = float(np.clip(focal * extent / observed_extent, .8, 10))
    middle = np.average(world[used], axis=0, weights=weights[used])
    pixel_middle = np.average(observed[used], axis=0, weights=weights[used])
    tx = float(middle @ right - (pixel_middle[0] - width / 2) * distance / focal)
    ty = float(middle @ up - np.array([0, .15, 0]) @ up + (pixel_middle[1] - height / 2) * distance / focal)
    initial = np.clip([distance, tx, ty], [.6, -2, -2], [12, 2, 2])

    def residual(framing):
        xy, _ = project(world, [azimuth, elevation, *framing], width, height)
        return (((xy - observed) / max(width, height)) * weights[:, None]).ravel()

    result = least_squares(residual, initial, bounds=([.6, -2, -2], [12, 2, 2]), max_nfev=100)
    return np.r_[azimuth, elevation, result.x]


def camera_branches(views, camera_sides=None):
    requested = camera_sides or {}
    if set(requested) - {"s", "d"} or any(v not in (-1, 1) for v in requested.values()):
        raise ValueError("camera_sides only accepts s/d mapped to +1 or -1")
    if set(requested) - set(views):
        raise ValueError("Camera-side hint names a view that was not supplied")
    options = [[requested[v]] if v in requested else [1, -1] if v in {"s", "d"} else [1] for v in views]
    return [dict(zip(views, signs)) for signs in itertools.product(*options)]


def fit_multiview(records, rig, excludes=None, prior=None, manual_hints=None,
                  orientation_evidence=None, camera_sides=None, starts=2,
                  max_evaluations=350, pose_weight=.004, camera_weight=.025, contact_profile=None, fixed_pose=False):
    require_current_rig(rig)
    if not isinstance(records, (list, tuple)) or not 2 <= len(records) <= 5:
        raise ValueError("Supply two to five distinct views of one pose")
    if not 1 <= starts <= 5 or not 1 <= max_evaluations <= 3000:
        raise ValueError("Invalid solver settings")
    if not 0 <= pose_weight <= 1 or not 0 < camera_weight <= 1:
        raise ValueError("Invalid regularization weights")
    identities = [identity(r) for r in records]
    pose_id = identities[0][0]
    if any(p != pose_id for p, _ in identities):
        raise ValueError("All input images must belong to the same pose group")
    views = [v for _, v in identities]
    if len(set(views)) != len(views):
        raise ValueError("Duplicate views are not independent camera evidence")
    exclusions = excludes or {}
    if not isinstance(exclusions, dict) or set(exclusions) - set(views):
        raise ValueError("Exclusions must be mapped to supplied view names")
    samples = []
    upper_only = all(r.get("body_region") == "upper" for r in records)
    for record, view in zip(records, views):
        excluded = exclusions.get(view, [])
        if not isinstance(excluded, (list, tuple)):
            raise ValueError("Each view's exclusions must be a point-name list")
        xy, weights, width, height = observations(record, rig, excluded)
        samples.append({"record": record, "view": view, "observed": xy, "weights": weights,
                        "width": width, "height": height, "excluded": list(excluded)})
    values_prior, names = resolve_prior(rig, pose_id, prior, manual_hints)
    contacts = Contacts(rig, contact_profile)
    hints = manual_hints or {}
    point_names = [p["name"] for p in rig.data["points"]]
    toe_observed = {}
    for side, full in (("l", "left"), ("r", "right")):
        ankle, toe = (point_names.index(full + suffix) for suffix in ("_ankle", "_toe"))
        # One weak view is insufficient endpoint evidence in this multi-view solver.
        toe_observed[side] = sum(s["weights"][ankle] > 0 and s["weights"][toe] > 0 for s in samples) >= 2
    active, fixed = [], {}
    for i, control in enumerate(rig.controls):
        key, axis = control["key"], control["property"]
        reason = None
        if key == "body":
            reason = "manual_root_prior_removes_body_pelvis_duplicate_dof"
        elif key == "head" or (key.endswith("_wrist") and not contact_profile):
            reason = "endpoint_orientation_unobserved_preserve_prior"
        elif key.endswith("_ankle") and not contact_profile and (axis != "bend" or not toe_observed[key[0]]):
            reason = "ankle_roll_yaw_or_missing_multiview_toe_evidence"
        if names[i] in hints:
            reason = "recorded_manual_angle_not_automatically_inferred"
        if fixed_pose:
            reason = "explicit_shared_contact_refined_pose_camera_fit_only"
        if upper_only and (key == "pelvis" or key.endswith(("_leg", "_knee", "_ankle"))):
            reason = "upper_body_crop_lower_body_unobserved_preserve_prior"
        if reason:
            fixed[names[i]] = {"value": float(values_prior[i]), "reason": reason}
        else:
            active.append(i)
    prior_world = rig.forward(values_prior)
    fixed_contact_residual = contacts.residual(values_prior) if fixed_pose else None
    joint_low = np.array([rig.controls[i]["min"] for i in active])
    joint_high = np.array([rig.controls[i]["max"] for i in active])
    sigma = np.array([45 if rig.controls[i]["key"].endswith(("_arm", "_leg")) else 30 for i in active])
    solutions = []
    started = time.perf_counter()
    for branch in camera_branches(views, camera_sides):
        cameras, camera_low, camera_high = [], [], []
        for sample in samples:
            view = sample["view"]
            azimuth, elevation, az_range, el_range = VIEW_PRIORS[view]
            azimuth *= branch[view]
            camera = camera_start(prior_world, sample["observed"], sample["weights"], sample["width"], sample["height"], azimuth, elevation)
            cameras.append(camera)
            camera_low.append([azimuth - az_range, max(-80, elevation - el_range), max(.6, camera[2] * .5), -2, -2])
            camera_high.append([azimuth + az_range, min(80, elevation + el_range), min(12, camera[2] * 2), 2, 2])
        cameras, camera_low, camera_high = map(np.asarray, (cameras, camera_low, camera_high))
        low = np.r_[joint_low, camera_low.ravel()]
        high = np.r_[joint_high, camera_high.ravel()]

        def unpack(x):
            values = values_prior.copy()
            values[active] = x[:len(active)]
            return values, x[len(active):].reshape(len(samples), 5)

        def residual(x):
            values, current_cameras = unpack(x)
            world = rig.forward(values)
            rows = []
            for sample, camera in zip(samples, current_cameras):
                xy, depth = project(world, camera, sample["width"], sample["height"])
                scale = math.sqrt(18 / np.count_nonzero(sample["weights"]))
                rows.append(((xy - sample["observed"]) / max(sample["width"], sample["height"]) * sample["weights"][:, None] * scale).ravel())
                rows.append(.2 * np.maximum(.2 - depth, 0))
            rows.append(pose_weight * (values[active] - values_prior[active]) / sigma)
            rows.append((camera_weight * (current_cameras[:, :2] - cameras[:, :2]) / [8, 6]).ravel())
            rows.append(fixed_contact_residual if fixed_pose else contacts.residual(values))
            return np.concatenate(rows)

        branch_best = None
        for start in range(starts):
            initial = np.r_[values_prior[active], cameras.ravel()]
            if start:
                sign = 1 if start % 2 else -1
                for j, i in enumerate(active):
                    if rig.controls[i]["property"] in {"raise", "bend"}:
                        initial[j] += sign * (6 if start < 3 else 12)
            initial = np.clip(initial, low + 1e-7, high - 1e-7)
            solved = least_squares(residual, initial, bounds=(low, high), loss="soft_l1", f_scale=.02,
                                   max_nfev=max_evaluations, x_scale="jac", ftol=1e-8, xtol=1e-8, gtol=1e-8)
            cost = float(np.sum(residual(solved.x) ** 2))
            if branch_best is None or cost < branch_best["cost"]:
                values, fitted_cameras = unpack(solved.x)
                branch_best = {"cost": cost, "values": values, "cameras": fitted_cameras, "low": camera_low,
                               "high": camera_high, "start_cameras": cameras, "branch": branch, "solver": solved}
        solutions.append(branch_best)
    solutions.sort(key=lambda result: result["cost"])
    best = solutions[0]
    world = rig.forward(best["values"])
    _, rotations = rig.transforms(best["values"])
    orientation = orientation_assessment(hints, orientation_evidence or {}, toe_observed)
    contact_report = contacts.assess(best["values"])
    scenes, reports, rejection_reasons = {}, [], []
    for index, (sample, camera) in enumerate(zip(samples, best["cameras"])):
        xy, depth = project(world, camera, sample["width"], sample["height"])
        used = sample["weights"] > 0
        errors = np.linalg.norm(xy - sample["observed"], axis=1)
        rms = float(np.sqrt(np.mean(errors[used] ** 2)))
        normalized = rms / max(sample["width"], sample["height"])
        at_camera_boundary = bool(np.any(np.minimum(camera[:2] - best["low"][index, :2], best["high"][index, :2] - camera[:2]) < .25))
        if normalized > .025 or float(errors[used].max()) / max(sample["width"], sample["height"]) > .08:
            rejection_reasons.append(sample["view"] + ":high_reprojection_residual")
        if at_camera_boundary:
            rejection_reasons.append(sample["view"] + ":camera_prior_boundary")
        if np.any(depth[used] < .2):
            rejection_reasons.append(sample["view"] + ":invalid_camera_depth")
        scene = copy.deepcopy(rig.data["template"])
        figure = scene["figures"][0]
        for node_index, node in enumerate(rig.nodes):
            if node["name"] in figure["joints"]:
                figure["joints"][node["name"]] = Rotation.from_matrix(rotations[node_index]).as_quat().tolist()
        figure["position"] = [0, 0, 0]
        position, target, *_ = camera_vectors(camera)
        scene["camera"] = {"position": position.tolist(), "target": target.tolist()}
        scene["floorLock"] = False
        scene["reference"] = {"stem": pose_id, "view": sample["view"]}
        scenes[sample["view"]] = scene
        initial_xy, _ = project(prior_world, best["start_cameras"][index], sample["width"], sample["height"])
        reports.append({"view": sample["view"], "image": sample["record"]["image"], "width": sample["width"], "height": sample["height"],
                        "used_points": int(used.sum()), "excluded_points": sample["excluded"],
                        "reprojection_rms_px": rms, "normalized_rms": normalized,
                        "weighted_rms_px": float(np.sqrt(np.average(errors[used] ** 2, weights=sample["weights"][used] ** 2))),
                        "max_error_px": float(errors[used].max()),
                        "initial_rms_px": float(np.sqrt(np.mean(np.sum((initial_xy[used] - sample["observed"][used]) ** 2, axis=1)))),
                        "camera_parameters": camera.tolist(), "camera_start": best["start_cameras"][index].tolist(),
                        "camera_bounds": {"min": best["low"][index].tolist(), "max": best["high"][index].tolist()},
                        "camera_prior_boundary": at_camera_boundary,
                        "points": [{"name": name, "observed": sample["observed"][i].tolist(), "projected": xy[i].tolist(), "world": world[i].tolist(), "weight": float(sample["weights"][i]), "error_px": float(errors[i])} for i, name in enumerate(point_names)]})
    direction_ambiguous = len(solutions) > 1 and solutions[1]["cost"] - best["cost"] <= max(1e-6, .03 * best["cost"])
    if direction_ambiguous:
        rejection_reasons.append("similar_cost_camera_direction_alternatives")
    if not best["solver"].success:
        rejection_reasons.append("optimizer_did_not_converge")
    limit_hits = [{"angle": names[i], "value": float(best["values"][i]),
                   "min": rig.controls[i]["min"], "max": rig.controls[i]["max"]}
                  for i in active if min(best["values"][i] - rig.controls[i]["min"],
                                         rig.controls[i]["max"] - best["values"][i]) < .25]
    spine_hits = [entry for entry in limit_hits if entry["angle"].split(".")[0] in {"pelvis", "waist", "chest"}]
    if spine_hits:
        rejection_reasons.append("optimized_spine_angles_at_joint_limits")
    counterrotations = []
    named_angles = rig.angles(best["values"])
    for axis in ("bend", "tilt", "turn"):
        axial = {joint: named_angles[f"{joint}.{axis}"] for joint in ("pelvis", "waist", "chest")}
        if min(axial.values()) < -15 and max(axial.values()) > 15:
            counterrotations.append({"axis": axis, "angles": axial,
                                     "interpretation": "opposing spine rotations need visual review; not evidence of correct anatomy"})
    if counterrotations:
        rejection_reasons.append("opposing_spine_rotations_need_manual_review")
    if contact_profile and not contact_report["passed"]:
        rejection_reasons.append("surface_contact_constraints_not_satisfied")
    report = {
        "schema": "pose-atlas/multiview-fit@1", "pose": pose_id, "mesh": rig.data["mesh"],
        "status": "draft-rejected-needs-correction" if rejection_reasons else "draft-needs-review",
        "verified": False, "method": "original shared editor FK + bounded independent perspective cameras; not full Sketch2Pose",
        "pose_mode": "fixed_shared_prior_camera_fit" if fixed_pose else "shared_joint_fit",
        "body_region": "upper_only_lower_body_not_reconstructed" if upper_only else "full",
        "elapsed_ms": round((time.perf_counter() - started) * 1000), "angles": named_angles,
        "fixed_angles": fixed, "manual_hints": hints, "endpoint_orientation": orientation,
        "joint_limit_hits": limit_hits, "spine_counterrotations": counterrotations,
        "contact_validation": contact_report,
        "camera_branch": best["branch"], "camera_direction_ambiguous": direction_ambiguous,
        "camera_candidates": [{"branch": s["branch"], "cost": s["cost"], "converged": bool(s["solver"].success)} for s in solutions],
        "views": reports, "quality_gate": {"passed": not rejection_reasons, "reasons": rejection_reasons,
                                             "meaning": "numerical review gate only; never formal approval",
                                             "normalized_rms_limit": .025, "normalized_max_point_error_limit": .08},
        "optimizer": {"converged": bool(best["solver"].success), "message": best["solver"].message,
                      "evaluations": int(best["solver"].nfev), "starts_per_branch": starts, "camera_branches": len(solutions)},
        "warnings": ["Residuals compare inferred 2D points, not human ground truth or 3D accuracy.",
                     "High cross-view residual can indicate inconsistent drawings, detector errors, incorrect view hints, or incompatible body proportions.",
                     "Head/wrist orientation is unresolved without manual evidence; prior angles are not observations.",
                     "Ankle bend uses approximate toe markers only when observed in at least two views; ankle roll/yaw remain prior-only unless manually supplied.",
                     "Surface contact constraints are applied only with an explicit profile; no full surface collision solver. Render and inspect every view.",
                     "Fixed bone lengths and incomplete torso landmarks can leave multiple spine/limb solutions."]}
    return scenes, report


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rig", required=True)
    parser.add_argument("--inputs", nargs="+", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--exclude", action="append", default=[], help="Per-view exclusions: s:right_wrist,right_elbow")
    parser.add_argument("--prior", help="Optional flat named-angle JSON manual prior")
    parser.add_argument("--orientations", help="Evidence-backed manual orientation hints")
    parser.add_argument("--side-camera", choices=["auto", "positive", "negative"], default="auto")
    parser.add_argument("--diagonal-camera", choices=["auto", "positive", "negative"], default="auto")
    parser.add_argument("--starts", type=int, default=2)
    parser.add_argument("--max-evaluations", type=int, default=350)
    args = parser.parse_args()
    try:
        rig = Rig(json.loads(Path(args.rig).read_text()))
        records = [json.loads(Path(p).read_text()) for p in args.inputs]
        pose_id = identity(records[0])[0]
        hints_data = json.loads(Path(args.orientations).read_text()) if args.orientations else None
        hints, orientation_report = load_orientation_hints(hints_data, rig, pose_id)
        excludes = {}
        for spec in args.exclude:
            view, separator, names = spec.partition(":")
            if not separator or view in excludes:
                raise ValueError("Use each --exclude view only once: s:right_wrist,right_elbow")
            excludes[view] = [name for name in names.split(",") if name]
        signs = {view: 1 if value == "positive" else -1 for view, value in [("s", args.side_camera), ("d", args.diagonal_camera)] if value != "auto"}
        prior = json.loads(Path(args.prior).read_text()) if args.prior else None
        scenes, report = fit_multiview(records, rig, excludes, prior, hints, orientation_report["evidence"], signs, args.starts, args.max_evaluations)
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(2, f"error: {error}\n")
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    for view, scene in scenes.items():
        write_json(out / f"{pose_id}_{view}.scene.json", scene)
    write_json(out / "draft.scene.json", next(iter(scenes.values())))
    write_json(out / f"{pose_id}.multiview.json", report)
    print(json.dumps({"pose": pose_id, "status": report["status"], "elapsed_ms": report["elapsed_ms"], "camera_branch": report["camera_branch"], "views": [{"view": v["view"], "rms_px": v["reprojection_rms_px"]} for v in report["views"]], "quality_gate": report["quality_gate"]}))


if __name__ == "__main__":
    main()
