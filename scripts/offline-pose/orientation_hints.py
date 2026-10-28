"""Validate *manual* endpoint-angle hints against the rig and reference images.

These hints are observations made by a human, not inferred orientations and
not approval of a fit.  An absent axis remains unobserved even if a preset
supplies a convenient starting angle.
"""
import math
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]
AXES = {
    'head': ('nod', 'tilt', 'turn'),
    'l_wrist': ('bend', 'tilt', 'turn'),
    'r_wrist': ('bend', 'tilt', 'turn'),
    'l_ankle': ('bend', 'tilt', 'turn'),
    'r_ankle': ('bend', 'tilt', 'turn'),
}


def orientation_assessment(angles=None, evidence=None, toe_observed=None):
    """Per-axis evidence status; ankle bend has an approximate 2D toe marker."""
    angles = angles or {}
    toe_observed = toe_observed or {}
    return {
        'joints': {
            joint: {
                axis: ('recorded_manual' if f'{joint}.{axis}' in angles else
                       'fitted_approx' if joint.endswith('_ankle') and axis == 'bend' and
                       toe_observed.get(joint[0], False) else
                       'unresolved')
                for axis in axes
            }
            for joint, axes in AXES.items()
        },
        'evidence': evidence or {},
        'interpretation': (
            'Manual angles are fixed as supplied, not estimated or verified. '
            'Unspecified head/hand orientation and ankle tilt/turn remain prior-only; '
            'ankle bend uses an approximate toe marker and is not ground truth.'
        ),
    }


def load_orientation_hints(data, rig, pose_id):
    """Return (flat angles, per-axis assessment); reject ambiguous evidence.

    `rig` is a Rig instance exposing its control list. Image paths are exact
    gallery-relative references; checking existence does not imply that visual
    evidence is accurate or that distinct views represent identical poses.
    """
    if data is None:
        return {}, orientation_assessment()
    if not isinstance(data, dict) or set(data) != {'schema', 'pose', 'joints', 'evidence'}:
        raise ValueError('Orientation hints require exactly schema, pose, joints and evidence')
    if data['schema'] != 'pose-atlas/orientations@1' or data['pose'] != pose_id:
        raise ValueError('Orientation hints schema or pose mismatch')
    if not isinstance(pose_id, str) or not re.fullmatch(r'[a-z0-9-]+_[a-z0-9-]+_[a-z0-9-]+', pose_id):
        raise ValueError('Invalid gallery pose identifier')
    joints, evidence = data['joints'], data['evidence']
    if not isinstance(joints, dict) or not joints or set(joints) - set(AXES):
        raise ValueError('Orientation hints require known, nonempty joints')
    if not isinstance(evidence, dict) or set(evidence) != set(joints):
        raise ValueError('Each hinted joint must have its own reference evidence')
    controls = {f"{c['key']}.{c['property']}": c for c in rig.controls}
    flat, validated_evidence = {}, {}
    for joint, values in joints.items():
        if not isinstance(values, dict) or not values or set(values) - set(AXES[joint]):
            raise ValueError(f'Invalid orientation axes for {joint}')
        entries = evidence[joint]
        if not isinstance(entries, list) or not 1 <= len(entries) <= 10:
            raise ValueError(f'At least one reference image is required for {joint}')
        validated_evidence[joint] = []
        for entry in entries:
            if not isinstance(entry, dict) or set(entry) != {'image', 'note'}:
                raise ValueError(f'Invalid reference evidence for {joint}')
            image, note = entry['image'], entry['note']
            if (not isinstance(image, str) or not re.fullmatch(
                    rf'img/{re.escape(pose_id)}_(?:f|d|s|hi|lo)\.png', image)
                    or not (ROOT / image).is_file()):
                raise ValueError(f'Evidence image is not an existing view of {pose_id}')
            if not isinstance(note, str) or not note.strip() or len(note) > 500:
                raise ValueError(f'Evidence note is missing or too long for {joint}')
            validated_evidence[joint].append({'image': image, 'note': note.strip()})
        for axis, value in values.items():
            key = f'{joint}.{axis}'
            control = controls.get(key)
            if control is None:
                raise ValueError(f'Rig has no {key}; re-export the current rig before using this hint')
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f'Nonfinite or nonnumeric orientation angle {key}')
            if not control['min'] <= value <= control['max']:
                raise ValueError(f'Orientation angle outside the rig limit: {key}')
            flat[key] = float(value)
    return flat, orientation_assessment(flat, validated_evidence)
