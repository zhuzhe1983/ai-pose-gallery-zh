"""Original, model-independent interchange and validation for offline 2D poses."""
from math import isfinite

SCHEMA = "pose-keypoints/1"
CONFIDENCE_KIND = "heatmap_peak_uncalibrated"
COORDINATE_SYSTEM = "original_image_pixels_x_right_y_down"
NAMES = (
    "head", "neck", "right_shoulder", "right_elbow", "right_wrist",
    "left_shoulder", "left_elbow", "left_wrist", "spine", "pelvis",
    "right_hip", "right_knee", "right_ankle", "left_hip", "left_knee",
    "left_ankle", "left_toe", "right_toe",
)
EDGES = (
    (0, 1), (1, 8), (8, 9), (9, 10), (9, 13), (10, 11), (11, 12),
    (13, 14), (14, 15), (1, 2), (2, 3), (3, 4), (1, 5), (5, 6),
    (6, 7), (15, 16), (12, 17),
)


def validate_pose(value, actual_size=None):
    """Return a canonical record. Reject invalid data; never fix/clamp predictions."""
    if not isinstance(value, dict):
        raise ValueError("pose must be an object")
    if value.get("confidence_kind") != CONFIDENCE_KIND:
        raise ValueError("confidence_kind must explicitly describe uncalibrated heatmap peaks")
    if value.get("coordinate_system") != COORDINATE_SYSTEM:
        raise ValueError("coordinate_system must use original-image pixels, x right, y down")
    width, height = value.get("width"), value.get("height")
    if any(type(n) is not int or n <= 0 for n in (width, height)):
        raise ValueError("width and height must be positive integers")
    if actual_size is not None and (width, height) != tuple(actual_size):
        raise ValueError("prediction dimensions do not match the decoded source image")
    points = value.get("points")
    if not isinstance(points, list) or len(points) != len(NAMES):
        raise ValueError("exactly 18 named points are required")
    by_name = {}
    for point in points:
        if not isinstance(point, dict):
            raise ValueError("each point must be an object")
        name = point.get("name")
        if name not in NAMES or name in by_name:
            raise ValueError("unknown or duplicate point name")
        index = NAMES.index(name)
        if "id" in point and (type(point["id"]) is not int or point["id"] != index):
            raise ValueError("point id disagrees with its canonical name")
        out = {"id": index, "name": name}
        for key in ("x", "y", "confidence"):
            number = point.get(key)
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not isfinite(number):
                raise ValueError(f"{name}.{key} must be a finite number")
            out[key] = float(number)
        by_name[name] = out
    ordered = [by_name[name] for name in NAMES]
    outside = [p["name"] for p in ordered if not (0 <= p["x"] < width and 0 <= p["y"] < height)]
    coincident = []
    for i, p in enumerate(ordered):
        for q in ordered[i + 1:]:
            if p["x"] == q["x"] and p["y"] == q["y"]:
                coincident.append([p["name"], q["name"]])
    return {
        "schema": SCHEMA, "width": width, "height": height,
        "confidence_kind": CONFIDENCE_KIND, "coordinate_system": COORDINATE_SYSTEM,
        "points": ordered, "review_status": "unreviewed",
        "diagnostics": {
            "out_of_image_points": outside, "coincident_points": coincident,
            "minimum_heatmap_peak": min(p["confidence"] for p in ordered),
            "maximum_heatmap_peak": max(p["confidence"] for p in ordered),
        },
    }
