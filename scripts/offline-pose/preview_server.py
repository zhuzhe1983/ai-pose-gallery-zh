#!/usr/bin/env python3
"""Read-only loopback preview of actual local pose artifacts; no inference or uploads."""
import argparse
from datetime import datetime, timezone
import functools
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import mimetypes
from pathlib import Path
import re
import shutil
import time
from urllib.parse import quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
OUTPUTS = ("output/sketch-pose-offline", "output/offline-pose")
SKIP_DIRS = {"venv", ".venv", "__pycache__", "node_modules", "preset-review"}
VIEWS = {"f", "d", "s", "hi", "lo"}
POINT_NAMES = {"head", "neck", "right_shoulder", "right_elbow", "right_wrist", "left_shoulder", "left_elbow", "left_wrist", "spine", "pelvis", "right_hip", "right_knee", "right_ankle", "left_hip", "left_knee", "left_ankle", "left_toe", "right_toe"}
MAX_JSON_BYTES = 12 * 1024 * 1024


def safe_path(root, url_path):
    """Resolve an explicit static-resource allowlist; directories are never listed."""
    raw = urlsplit(url_path).path
    decoded = unquote(raw)
    if unquote(decoded) != decoded or "\\" in decoded or "\x00" in decoded:
        return None
    parts = decoded.lstrip("/").split("/")
    if any(p in {".", ".."} or p.startswith(".") for p in parts if p):
        return None
    relative = "/".join(parts)
    if relative.endswith("/"):
        relative += "index.html"
    path = root / relative
    suffix = path.suffix.lower()
    allowed = False
    if relative.startswith("preview/"):
        allowed = suffix in {".html", ".js", ".css", ".svg", ".json", ".md"}
    elif relative.startswith("studio/"):
        allowed = suffix in {".html", ".js", ".mjs", ".css", ".json", ".glb", ".wasm", ".task", ".png", ".jpg", ".svg", ".woff2", ".md", ".txt"} or path.name == "LICENSE"
    elif relative.startswith(("img/", "thumbs/")):
        allowed = suffix in {".png", ".jpg", ".webp"}
    elif relative.startswith("data/"):
        allowed = suffix == ".json"
    elif relative.startswith(("docs/pose-review/", "docs/pose-review-v3/")):
        allowed = suffix in {".png", ".jpg", ".json", ".md"}
    elif relative.startswith("output/sketch-pose-offline/"):
        allowed = suffix in {".json", ".png", ".jpg", ".svg", ".md"}
    elif relative.startswith("output/offline-pose/"):
        allowed = suffix in {".png", ".jpg", ".svg", ".md"} or path.name.endswith((".scene.json", ".fit.json", ".multiview.json")) or path.name in {"status.json", "preset-visual-audit.json"}
    elif relative in {"index.html", "app.js", "gallery-preview.js"}:
        allowed = True
    if not allowed or any(p in {"venv", ".venv", "__pycache__", "node_modules"} for p in parts):
        return None
    try:
        resolved = path.resolve()
        resolved.relative_to(root.resolve())
        cursor = root
        for part in path.relative_to(root).parts:
            cursor /= part
            if cursor.is_symlink():
                return None
        return resolved if resolved.is_file() else None
    except (OSError, ValueError):
        return None


def read_json(path, warnings):
    try:
        if not path.is_file() or path.is_symlink():
            return None
        if path.stat().st_size > MAX_JSON_BYTES:
            warnings.append({"file": path.name, "reason": "json_too_large"})
            return None
        def reject_nonfinite(token):
            raise ValueError("Nonfinite JSON number: " + token)
        return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_nonfinite)
    except (OSError, UnicodeError, ValueError):
        warnings.append({"file": path.name, "reason": "unreadable_or_partial_json"})
        return None


def walk_files(directory, depth=4):
    if depth < 0 or not directory.is_dir() or directory.is_symlink():
        return
    try:
        children = sorted(directory.iterdir())
    except OSError:
        return
    for path in children:
        if path.is_symlink() or path.name.startswith("."):
            continue
        if path.is_dir():
            if path.name not in SKIP_DIRS and not path.name.startswith("cli-failure"):
                yield from walk_files(path, depth - 1)
        elif path.is_file():
            yield path


def asset_url(root, path):
    try:
        rel = path.relative_to(root).as_posix()
    except ValueError:
        return None
    return "/" + quote(rel, safe="/") if safe_path(root, "/" + rel) else None


def finite_number(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def stamp(path):
    try:
        return path.stat().st_mtime
    except OSError:
        return 0


def parse_time(value):
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result.timestamp() if result.tzinfo else None
    except (AttributeError, ValueError):
        return None


def scan_state(root=ROOT, now=None):
    """Artifact counts are derived from validated files, never from planned work."""
    now = time.time() if now is None else now
    warnings = []
    coverage = read_json(root / "data/pose-3d-status.json", warnings) or {}
    if not isinstance(coverage, dict):
        coverage = {}
    model_revision = None
    try:
        match = re.search(r'model\.userData\.mesh\s*=\s*["\']([^"\']+)["\']', (root / "studio/human.js").read_text())
        model_revision = match.group(1) if match else None
    except OSError:
        pass
    titles = {}
    for path in (root / "data/catalog").glob("*/*.json"):
        catalog = read_json(path, warnings)
        if isinstance(catalog, list):
            for entry in catalog:
                if isinstance(entry, dict) and isinstance(entry.get("pose"), str):
                    titles[f"{path.parent.name}_{path.stem}_{entry['pose']}"] = entry.get("name", {})
    items = {}
    groups = coverage.get("poses", [])
    if not isinstance(groups, list):
        groups = []
    for group in groups:
        if not isinstance(group, dict) or not isinstance(group.get("id"), str):
            continue
        for view in group.get("views", []):
            if view not in VIEWS:
                continue
            key = f"{group['id']}_{view}"
            source = asset_url(root, root / "img" / f"{key}.png")
            if not source:
                continue
            items[key] = {"id": key, "pose": group["id"], "view": view, "title": titles.get(group["id"], {}), "source": source, "status": "not_started", "stage": "not_started", "control": False, "artifacts": {}, "updated": 0}
    control_path = root / "output/sketch-pose-offline/blank-control.png"
    if asset_url(root, control_path):
        items["blank-control"] = {"id": "blank-control", "pose": None, "view": None, "title": {}, "source": asset_url(root, control_path), "status": "not_started", "stage": "not_started", "control": True, "artifacts": {}, "updated": 0}

    def item_for(image):
        if not isinstance(image, str):
            return None
        return items.get(Path(image).stem)

    landmark_candidates = {}
    for path in walk_files(root / OUTPUTS[0]):
        if path.suffix != ".json":
            continue
        value = read_json(path, warnings)
        records = value.get("results", []) if isinstance(value, dict) else []
        if isinstance(value, dict) and "points" in value:
            records = [value]
        for record in records if isinstance(records, list) else []:
            if not isinstance(record, dict):
                continue
            item = item_for(record.get("image"))
            points = record.get("points", [])
            if not item or record.get("confidence_kind") != "heatmap_peak_uncalibrated" or not isinstance(points, list) or len(points) != 18:
                continue
            if not all(isinstance(p, dict) and all(finite_number(p.get(k)) for k in ("x", "y", "confidence")) for p in points):
                continue
            if not all(isinstance(p.get("name"), str) for p in points) or {p["name"] for p in points} != POINT_NAMES or not all(finite_number(record.get(k)) and record[k] > 0 for k in ("width", "height")):
                continue
            # Prefer a canonical per-image record to aggregate JSON, regardless of reruns.
            priority = (path.stem == item["id"], stamp(path))
            previous = landmark_candidates.get(item["id"])
            if previous and previous[0] >= priority:
                continue
            landmark_candidates[item["id"]] = (priority, path, record)
    for key, (_, path, record) in landmark_candidates.items():
        item = items[key]
        item.update(status="needs_review", stage="landmarks", updated=stamp(path))
        item["artifacts"]["landmarks"] = asset_url(root, path)
        overlay = root / OUTPUTS[0] / f"{key}.overlay.png"
        if not overlay.is_file() and isinstance(record.get("overlay"), str):
            overlay = path.parent / record["overlay"]
        item["artifacts"]["overlay"] = asset_url(root, overlay)
        item["landmarks"] = {"count": 18, "confidenceKind": "heatmap_peak_uncalibrated", "minPeak": min(p["confidence"] for p in record["points"]), "maxPeak": max(p["confidence"] for p in record["points"])}

    review = read_json(root / OUTPUTS[0] / "review.json", warnings) or {}
    for record in review.get("results", []) if isinstance(review, dict) else []:
        item = item_for(record.get("image")) if isinstance(record, dict) else None
        if item:
            item["review"] = {"status": record.get("status"), "excludePoints": record.get("exclude_points", []), "reason": record.get("reason", "")}
            if record.get("status") == "reject":
                item["status"] = "rejected"

    for path in walk_files(root / OUTPUTS[1]):
        if not path.name.endswith(".fit.json"):
            continue
        record = read_json(path, warnings)
        item = item_for(record.get("image")) if isinstance(record, dict) else None
        if not item or record.get("schema") != "pose-atlas/offline-fit@1":
            continue
        if stamp(path) < item.get("fitUpdated", 0):
            continue
        item.update(status="draft", stage="fit", fitUpdated=stamp(path), updated=max(item["updated"], stamp(path)))
        item["artifacts"]["fit"] = asset_url(root, path)
        item["fit"] = {"mesh": record.get("mesh"), "elapsedMs": record.get("elapsed_ms"), "rmsPixels": record.get("reprojection_rms_px"), "usedPoints": record.get("used_points")}
        scene = path.with_name(path.name.replace(".fit.json", ".scene.json"))
        scene_value = valid_scene(scene, warnings) if asset_url(root, scene) else None
        if scene_value:
            item["artifacts"]["scene"] = asset_url(root, scene)
            item["sceneMeshes"] = [f.get("mesh") for f in scene_value["figures"] if isinstance(f, dict)]
        for candidate in (path.with_name(item["id"] + ".png"), root / OUTPUTS[1] / "renders" / (item["id"] + ".png")):
            if asset_url(root, candidate):
                item["artifacts"]["render"] = asset_url(root, candidate)
                item["renderUpdated"] = stamp(candidate)
                break
    for path in (root / OUTPUTS[1] / "ready").glob("*.scene.json"):
        item = items.get(path.name.removesuffix(".scene.json"))
        scene_value = valid_scene(path, warnings) if asset_url(root, path) else None
        if item and scene_value:
            item.update(status="needs_review", stage="grounded", updated=max(item["updated"], stamp(path)))
            item["artifacts"]["scene"] = asset_url(root, path)
            item["sceneMeshes"] = [f.get("mesh") for f in scene_value["figures"] if isinstance(f, dict)]
            item["grounded"] = True
            image = path.with_name(item["id"] + ".png")
            if asset_url(root, image):
                item["artifacts"]["render"] = asset_url(root, image)
                item["renderUpdated"] = stamp(image)

    # Explicitly identified old filenames: shown as historical, never as latest-fit evidence.
    for key, name in {"solo_stand_arms-up-stretch_f": "grounded-arms-up.png", "solo_kneel_hands-thighs_f": "kneel.png"}.items():
        item = items.get(key)
        url = asset_url(root, root / OUTPUTS[1] / name)
        if item and url and "fit" in item and not item["artifacts"].get("render"):
            item["artifacts"]["historicalRender"] = url

    status_path = root / OUTPUTS[1] / "status.json"
    progress = read_json(status_path, warnings)
    jobs = []
    if isinstance(progress, dict) and progress.get("schema") == "pose-atlas/offline-progress@1":
        progress_jobs = progress.get("jobs", [])
        for record in progress_jobs if isinstance(progress_jobs, list) else []:
            if not isinstance(record, dict):
                continue
            item = item_for(record.get("image"))
            state = record.get("status")
            if not item or state not in {"not_started", "queued", "running", "failed", "draft", "needs_review", "done"}:
                continue
            updated = parse_time(record.get("updatedAt"))
            stale = state == "running" and (updated is None or now - updated > 180 or updated > now + 60)
            task = {"image": item["id"], "stage": str(record.get("stage", ""))[:80], "status": "stale" if stale else "needs_review" if state == "done" else state, "updatedAt": record.get("updatedAt"), "message": str(record.get("message", ""))[:1200]}
            declared = record.get("progress")
            if isinstance(declared, dict) and all(finite_number(declared.get(k)) for k in ("completed", "total")) and 0 <= declared["completed"] <= declared["total"] and declared["total"] > 0:
                task["progress"] = {"completed": declared["completed"], "total": declared["total"], "unit": str(declared.get("unit", "steps"))[:40]}
            item["task"] = task
            item["status"] = task["status"]
            item["updated"] = max(item["updated"], updated or 0)
            declared_artifacts = record.get("artifacts", {})
            for kind, location in declared_artifacts.items() if isinstance(declared_artifacts, dict) else []:
                if kind not in {"render", "scene", "overlay", "comparison", "multiReport"} or not isinstance(location, str):
                    continue
                decoded = unquote(location.lstrip("/"))
                if not any(decoded.startswith(base + "/") for base in OUTPUTS):
                    continue
                path = safe_path(root, "/" + decoded)
                if kind == "comparison" and (not path or path.suffix.lower() not in {".png", ".jpg"}):
                    continue
                if kind == "multiReport":
                    multi = read_json(path, warnings) if path and path.name.endswith(".multiview.json") else None
                    if not isinstance(multi, dict) or multi.get("schema") != "pose-atlas/multiview-fit@1" or multi.get("pose") != item["pose"]:
                        continue
                scene_value = valid_scene(path, warnings) if path and kind == "scene" else None
                if path and (kind != "scene" or scene_value):
                    item["artifacts"][kind] = asset_url(root, path)
                    if kind == "scene":
                        item["sceneMeshes"] = [f.get("mesh") for f in scene_value["figures"] if isinstance(f, dict)]
                    if kind == "render":
                        item["renderUpdated"] = stamp(path)
            jobs.append(task)
    elif progress is not None:
        warnings.append({"file": "status.json", "reason": "unsupported_progress_schema"})

    audit = read_json(root / "data/preset-visual-review.json", warnings) or read_json(root / OUTPUTS[1] / "preset-review/preset-visual-audit.json", warnings) or {}
    presets = []
    for record in audit.get("presets", []) if isinstance(audit, dict) else []:
        if not isinstance(record, dict):
            continue
        key = f"{record.get('preset')}_{record.get('view')}"
        item = items.get(key)
        if not item:
            continue
        base = root / OUTPUTS[1] / "preset-review/all"
        entry = {"id": key, "pose": record.get("preset"), "view": record.get("view"), "severity": record.get("severity"), "issues": record.get("issues_zh", []), "source": item["source"], "render": asset_url(root, base / f"{key}.png"), "scene": asset_url(root, base / f"{key}.scene.json")}
        presets.append(entry)
        item["manualPreset"] = entry
    values = list(items.values())
    gallery = [i for i in values if not i["control"]]
    count = lambda predicate: sum(bool(predicate(i)) for i in gallery)
    group_count = lambda predicate: len({i["pose"] for i in gallery if predicate(i)})
    verified = sum(g.get("status") == "verified" for g in groups if isinstance(g, dict))
    # Coverage's declared verified count remains visible, but is not manufactured from files.
    if isinstance(coverage.get("verified"), int) and coverage["verified"] != verified:
        warnings.append({"file": "pose-3d-status.json", "reason": "verified_count_mismatch"})
    counts = {"images": len(gallery), "groups": len(groups), "verifiedGroups": verified, "detectedImages": count(lambda i: "landmarks" in i), "detectedGroups": group_count(lambda i: "landmarks" in i), "fitImages": count(lambda i: "fit" in i), "fitGroups": group_count(lambda i: "fit" in i), "groundedImages": count(lambda i: i.get("grounded")), "renderedFits": count(lambda i: i["artifacts"].get("render")), "controls": sum(i["control"] and "landmarks" in i for i in values), "running": sum(j["status"] == "running" for j in jobs), "failed": sum(j["status"] == "failed" for j in jobs), "stale": sum(j["status"] == "stale" for j in jobs), "manualPresets": len(presets)}
    for state in ("running", "failed", "stale"):
        counts[state + "Groups"] = len({items[j["image"]]["pose"] or j["image"] for j in jobs if j["status"] == state and j["image"] in items})
    values.sort(key=lambda i: (i["status"] == "not_started", not bool(i.get("grounded")), "fit" not in i, -i["updated"], i["id"]))
    for item in values:
        item["active"] = bool(item.get("landmarks") or item.get("fit") or item.get("grounded") or item.get("task"))
        if item["artifacts"].get("scene", "").startswith(("/output/offline-pose/ready/", "/output/offline-pose/drafts/")):
            item["studioURL"] = "/studio/?previewScene=" + quote(item["artifacts"]["scene"], safe="")
        item["legacyMesh"] = bool(model_revision and any(m != model_revision for m in item.get("sceneMeshes", [])))
    pose_groups = []
    grouped = {}
    for item in values:
        key = item["pose"] if not item["control"] else item["id"]
        if key not in grouped:
            grouped[key] = {"id": key, "title": item["title"], "control": item["control"], "views": []}
            pose_groups.append(grouped[key])
        grouped[key]["views"].append(item)
    for group in pose_groups:
        group["active"] = any(item["active"] for item in group["views"])
        group["sceneCount"] = sum(bool(item["artifacts"].get("scene")) for item in group["views"])
        group["sceneConsistency"] = compare_view_scenes(root, group["views"], warnings)
    return {"schema": "pose-atlas/local-preview@1", "scannedAt": datetime.fromtimestamp(now, timezone.utc).isoformat(), "mode": "read-only-loopback", "modelRevision": model_revision, "algorithm": "Sketch2Pose ONNX 2D front end + original constrained editor fitting; not full Sketch2Pose", "counts": counts, "progressFilePresent": status_path.is_file(), "jobs": jobs, "items": values, "groups": pose_groups, "presetAudit": presets, "warnings": warnings}


def valid_scene(path, warnings):
    value = read_json(path, warnings)
    valid = isinstance(value, dict) and value.get("schema") in {"pose-atlas/studio@1", "pose-atlas/studio@2", "pose-atlas/studio@3"} and isinstance(value.get("figures"), list) and 1 <= len(value["figures"]) <= 6
    return value if valid else None


def scene_signature(scene):
    """Validate only the geometry-driving fields needed to compare two views.

    Do not interpret or mutate legacy scenes. Missing or malformed data yields
    unknown, not a claim that poses match. Camera and reference are per view.
    """
    schema = scene.get("schema")
    figures = scene.get("figures")
    if schema not in {"pose-atlas/studio@1", "pose-atlas/studio@2", "pose-atlas/studio@3"} or not isinstance(figures, list) or not 1 <= len(figures) <= 6:
        return None
    def number(x):
        return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)
    def vector(v, length):
        return isinstance(v, list) and len(v) == length and all(number(x) for x in v)
    def quat(q):
        return vector(q, 4) and abs(math.sqrt(sum(x*x for x in q)) - 1) <= .01
    result = []
    seen = set()
    for f in figures:
        if not isinstance(f, dict): return None
        fid = f.get("id")
        if not isinstance(fid, str) or fid in seen: return None
        seen.add(fid)
        if f.get("sex") not in {"female", "male"} or not number(f.get("height")) or not number(f.get("scale", 1)):
            return None
        if not isinstance(f.get("mesh"), str) or not vector(f.get("position"), 3) or not quat(f.get("rotation")):
            return None
        joints = f.get("joints")
        if not isinstance(joints, dict) or not joints or len(joints) > 100 or not all(isinstance(k, str) and quat(q) for k, q in joints.items()):
            return None
        result.append({"id": fid, "sex": f["sex"], "height": f["height"], "scale": f.get("scale", 1), "outfit": f.get("outfit", "ivory"), "mesh": f["mesh"], "position": f["position"], "rotation": f["rotation"], "joints": joints})
    return {"schema": schema, "figures": sorted(result, key=lambda f: f["id"])}


def compare_view_scenes(root, items, warnings):
    scenes = []
    for item in items:
        url = item["artifacts"].get("scene")
        if not url: continue
        path = safe_path(root, url)
        value = valid_scene(path, warnings) if path else None
        scenes.append(scene_signature(value) if value else None)
    if not scenes: return "none"
    if any(scene is None for scene in scenes): return "unknown"
    if len(scenes) == 1: return "single"
    # Different rig schemas have different semantics; do not guess equivalence.
    if len({scene["schema"] for scene in scenes}) != 1: return "unknown"
    def close(a, b): return abs(a - b) <= 1e-5
    def vec(a, b): return len(a) == len(b) and all(close(x, y) for x, y in zip(a, b))
    def quat(a, b): return vec(a, b) or vec(a, [-x for x in b])
    def same(a, b):
        if len(a["figures"]) != len(b["figures"]): return False
        for x, y in zip(a["figures"], b["figures"]):
            if any(x[k] != y[k] for k in ("id", "sex", "outfit", "mesh")): return False
            if not close(x["height"], y["height"]) or not close(x["scale"], y["scale"]): return False
            if not vec(x["position"], y["position"]) or not quat(x["rotation"], y["rotation"]): return False
            if x["joints"].keys() != y["joints"].keys(): return False
            if not all(quat(x["joints"][key], y["joints"][key]) for key in x["joints"]): return False
        return True
    return "shared" if all(same(scenes[0], other) for other in scenes[1:]) else "conflict"


class PreviewHandler(BaseHTTPRequestHandler):
    server_version = "PoseLocalPreview/1"

    def __init__(self, *args, root=ROOT, **kwargs):
        self.root = root.resolve()
        super().__init__(*args, **kwargs)

    def send_headers(self, code, content_type, length=None):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "same-origin")
        if length is not None:
            self.send_header("Content-Length", str(length))
        self.end_headers()

    def host_allowed(self):
        host = self.headers.get("Host", "").split(":", 1)[0].lower()
        return host in {"127.0.0.1", "localhost"}

    def do_GET(self):
        self.serve(False)

    def do_HEAD(self):
        self.serve(True)

    def do_POST(self):
        self.send_error(405, "Read-only service")

    do_PUT = do_POST
    do_DELETE = do_POST
    do_PATCH = do_POST

    def serve(self, head_only):
        if not self.host_allowed():
            self.send_error(403, "Loopback host required")
            return
        route = urlsplit(self.path).path
        if route == "/preview":
            self.send_response(302)
            self.send_header("Location", "/preview/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if route == "/api/preview-state":
            payload = json.dumps(scan_state(self.root), ensure_ascii=False, allow_nan=False).encode()
            self.send_headers(200, "application/json; charset=utf-8", len(payload))
            if not head_only:
                self.wfile.write(payload)
            return
        path = safe_path(self.root, "/index.html" if route == "/" else self.path)
        if path is None:
            self.send_error(404, "Resource not exposed")
            return
        try:
            content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if path.suffix == ".mjs":
                content_type = "text/javascript"
            with path.open("rb") as source:
                self.send_headers(200, content_type, path.stat().st_size)
                if not head_only:
                    shutil.copyfileobj(source, self.wfile)
        except (OSError, BrokenPipeError):
            pass


class PreviewServer(ThreadingHTTPServer):
    # A gallery and studio can request dozens of ES modules concurrently.
    request_queue_size = 128


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root, primarily for isolated tests")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be 1..65535")
    server = PreviewServer(("127.0.0.1", args.port), functools.partial(PreviewHandler, root=args.root))
    server.daemon_threads = True
    print(f"Read-only local preview: http://127.0.0.1:{args.port}/preview/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
