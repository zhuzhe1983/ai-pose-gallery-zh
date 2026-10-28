#!/usr/bin/env python3
"""Offline inference orchestration; model implementation is explicitly supplied locally."""
import argparse
import base64
import hashlib
import html
import importlib.util
import io
import json
from pathlib import Path
import platform
import statistics
import sys
import time

from PIL import Image

from schema import EDGES, NAMES, validate_pose


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_adapter(path):
    spec = importlib.util.spec_from_file_location("local_pose_adapter", path)
    if spec is None or spec.loader is None:
        raise ValueError("cannot load the explicitly supplied Python adapter")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not callable(getattr(module, "load_model", None)) or not callable(getattr(module, "predict", None)):
        raise ValueError("adapter must expose load_model(model_path, threads) and predict(model, image_path)")
    return module


def color(name):
    return "#d64c31" if name.startswith("right_") else "#087ac4" if name.startswith("left_") else "#218c50"


def overlay(image, record):
    """Numbered SVG with embedded source pixels, without altering inference data."""
    image = image.convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    width, height = image.size
    font_size = max(width, height) / 42
    stroke = max(width, height) / 350
    points = record["points"]
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">',
             '<title>Unreviewed 2D prediction: red anatomical right, blue left, green center</title>',
             f'<image width="{width}" height="{height}" href="data:image/png;base64,{encoded}"/>']
    for a, b in EDGES:
        p, q = points[a], points[b]
        parts.append(f'<line x1="{p["x"]}" y1="{p["y"]}" x2="{q["x"]}" y2="{q["y"]}" stroke="{color(q["name"])}" stroke-width="{stroke}"/>')
    for p in points:
        parts.append(f'<circle cx="{p["x"]}" cy="{p["y"]}" r="{stroke * 1.5}" fill="{color(p["name"])}"/>')
        parts.append(f'<text x="{p["x"] + stroke * 2}" y="{p["y"] - stroke * 2}" font-family="sans-serif" font-size="{font_size}" fill="{color(p["name"])}" stroke="white" stroke-width="{stroke}" paint-order="stroke">{p["id"]}</text>')
    return "\n".join(parts + ["</svg>"])


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def render_report(records, errors, metadata):
    escape = html.escape
    cards = []
    for r in records:
        rows = "".join(f'<tr><td>{p["id"]}</td><td>{p["name"]}</td><td>{p["x"]:.2f}</td><td>{p["y"]:.2f}</td><td>{p["confidence"]:.4f}</td></tr>' for p in r["points"])
        diagnostics = escape(json.dumps(r["diagnostics"], ensure_ascii=False))
        cards.append(f'<article><h2>{escape(r["image"])}</h2><p>{escape(r.get("category", ""))} · unreviewed · {r["timing_ms"]["median"]:.1f} ms median</p><img src="{r["overlay"]}" alt="Numbered predicted skeleton"><p>{diagnostics}</p><details><summary>18 points / raw JSON</summary><a href="{r["record_file"]}">JSON</a><table><tr><th>ID</th><th>Name</th><th>x</th><th>y</th><th>Heatmap peak</th></tr>{rows}</table></details></article>')
    failures = "".join(f'<li>{escape(e["image"])}: {escape(e["error"])}</li>' for e in errors)
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline pose review</title><style>body{font:16px/1.5 system-ui;margin:2rem;background:#f5f6f8;color:#18202b}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem}article{background:white;padding:1rem;overflow-wrap:anywhere}h2{font-size:1rem}img{width:100%;max-height:620px;object-fit:contain}td,th{text-align:left;padding:0 .4rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Offline 2D pose review</h1><p>Unreviewed machine predictions. Heatmap peaks are not probabilities; every image may produce a skeleton, including blank images. Red = anatomical right, blue = left, green = center. Overlap, occlusion, left/right and depth require review. No 3D pose or accuracy claim is produced here.</p><p>' + f'{len(records)} completed, {len(errors)} failed.</p><ul>{failures}</ul><details><summary>Provenance</summary><pre>{escape(json.dumps(metadata, indent=2))}</pre></details><main>' + "".join(cards) + '</main></html>'


def run(args):
    manifest_path, adapter_path, model_path = (Path(p).resolve() for p in (args.manifest, args.adapter, args.model))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or manifest.get("schema") != "pose-batch/1" or not isinstance(manifest.get("images"), list):
        raise ValueError("manifest must contain schema pose-batch/1 and an images list")
    if not manifest["images"]:
        raise ValueError("manifest must contain at least one image")
    for entry in manifest["images"]:
        if not isinstance(entry, dict) or not isinstance(entry.get("image"), str) or not entry["image"]:
            raise ValueError("each manifest entry requires a nonempty image path")
        if "category" in entry and not isinstance(entry["category"], str):
            raise ValueError("category must be text")
    out = Path(args.output).resolve()
    if out.exists() and any(out.iterdir()):
        raise ValueError("output must be new or empty to preserve previous experiments")
    adapter = load_adapter(adapter_path)
    metadata = {
        "schema": "pose-batch-results/1", "model_sha256": sha256(model_path),
        "adapter_sha256": sha256(adapter_path), "manifest_sha256": sha256(manifest_path),
        "python": platform.python_version(), "platform": platform.platform(),
        "threads_requested": args.threads, "repeat": args.repeat,
        "backend": getattr(adapter, "DESCRIPTION", "Local adapter; consult its source"),
        "scope": "2D inference only; no 3D fitting or human approval",
        "timing_scope": "adapter predict calls; excludes model load, validation and rendering",
    }
    start = time.perf_counter()
    model = adapter.load_model(model_path, args.threads)
    metadata["model_load_ms"] = (time.perf_counter() - start) * 1000
    records, errors = [], []
    try:
        out.mkdir(parents=True, exist_ok=True)
        for index, entry in enumerate(manifest["images"]):
            path = (manifest_path.parent / entry["image"]).resolve()
            try:
                with Image.open(path) as source:
                    source.load()
                    image = source.copy()
                # No EXIF transpose: the adapter contract uses the encoded pixel grid.
                times = []
                for _ in range(args.repeat):
                    start = time.perf_counter()
                    value = adapter.predict(model, path)
                    times.append((time.perf_counter() - start) * 1000)
                    record = validate_pose(value, image.size)
                key = f"{index + 1:05d}"
                record.update({"image": entry["image"], "source_sha256": sha256(path),
                               "category": entry.get("category", ""),
                               "timing_ms": {"runs": times, "median": statistics.median(times)},
                               "overlay": key + ".svg", "record_file": key + ".json"})
                svg = overlay(image, record)
                (out / record["overlay"]).write_text(svg, encoding="utf-8")
                write_json(out / record["record_file"], record)
                records.append(record)
                print(f'{index + 1}/{len(manifest["images"])} {path.name}: {statistics.median(times):.1f} ms, unreviewed', flush=True)
            except Exception as error:
                errors.append({"image": entry["image"], "error": f"{type(error).__name__}: {error}"})
                print(f'{path.name}: failed: {error}', file=sys.stderr, flush=True)
    finally:
        try:
            if callable(getattr(adapter, "close", None)):
                adapter.close(model)
        finally:
            # Preserve partial results on interruption, too.
            if out.exists():
                write_json(out / "results.json", {"metadata": metadata, "results": records, "errors": errors})
                (out / "report.html").write_text(render_report(records, errors, metadata), encoding="utf-8")
    return 1 if errors else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--adapter", required=True, help="Explicit local Python adapter file (executes Python)")
    parser.add_argument("--model", required=True, help="Local model; never downloaded by this tool")
    parser.add_argument("--output", required=True, help="New or empty local result directory")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--repeat", type=int, default=3)
    args = parser.parse_args()
    if args.threads < 1 or args.repeat < 1:
        parser.error("threads and repeat must be positive")
    try:
        return run(args)
    except (ValueError, OSError, ImportError) as error:
        parser.exit(2, f"error: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
