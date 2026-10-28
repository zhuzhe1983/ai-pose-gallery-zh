#!/usr/bin/env python3
"""Stable semantic asset names, migration, and small per-category catalogs."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SYSTEMS = {
    "全身单人・标准系": "solo",
    "全身单人・性感系": "sexy",
    "上半身单人": "upper",
    "双人缠绵": "duo",
}
CATEGORIES = {
    "站姿": "stand", "坐姿": "sit", "跪立・四肢着地": "floor",
    "趴卧": "lie", "特殊": "spec", "跪立": "kneel",
    "侧坐・女孩坐": "side-sit", "蹲姿": "squat", "前倾": "bend",
    "后仰・挺背": "arch", "扭身": "twist", "可爱系": "cute",
    "挤胸・强调事业线系": "chest", "性感・大胆系": "bold",
    "立位": "stand", "贴脸系": "face", "正常位（传教士）": "miss",
    "后入位": "rear", "坐位": "sit", "背向坐位": "bk-sit",
    "骑乘位": "strad", "侧卧位": "side-lie", "面对面坐位": "face-sit",
    "立位贴身": "stand-close", "坐位贴身": "sit-close", "贴身": "close",
}
VIEWS = {"正面": "f", "俯视": "hi", "仰视": "lo", "侧面": "s", "斜侧": "d"}
SOURCE_VIEWS = {"front": "f", "high": "hi", "low": "lo", "side": "s", "diag": "d"}


def read_names():
    names = json.loads((ROOT / "data/asset-names.json").read_text(encoding="utf-8"))
    for name in names.values():
        if not re.fullmatch(r"[a-z0-9-]+_[a-z0-9-]+_[a-z0-9-]+", name) or len(name + "_hi.png") > 64:
            raise ValueError(f"Invalid compact asset name: {name}")
    return names


def semantic_id(source_id, names):
    group, view = source_id.rsplit("_", 1)
    return f"{names[group]}_{SOURCE_VIEWS[view]}"


def asset_paths(source_id, names):
    stem = semantic_id(source_id, names)
    return f"thumbs/{stem}.jpg", f"img/{stem}.png"


def write_catalog(locales):
    rows = locales["zh"]
    by_id = {lang: {row["id"]: row for row in data} for lang, data in locales.items()}
    catalog = {
        "schema_version": 1,
        "image_template": "img/{system}_{category}_{pose}_{view}.png",
        "thumbnail_template": "thumbs/{system}_{category}_{pose}_{view}.jpg",
        "views": {slug: name for name, slug in VIEWS.items()},
        "systems": {},
    }
    buckets = {}
    for row in rows:
        system, category, pose, view = row["id"].split("_")
        entry = catalog["systems"].setdefault(system, {"name": {lang: data[row["id"]]["体系"] for lang, data in by_id.items()}, "categories": {}})
        entry["categories"].setdefault(category, {
            "name": {lang: data[row["id"]]["分类"] for lang, data in by_id.items()}, "index": f"data/catalog/{system}/{category}.json",
        })
        poses = buckets.setdefault((system, category), {})
        item = poses.setdefault(pose, {"pose": pose, "name": {lang: data[row["id"]]["姿势名称"] for lang, data in by_id.items()}, "views": []})
        item["views"].append(view)
    for (system, category), poses in buckets.items():
        entry = catalog["systems"][system]["categories"][category]
        entry["pose_count"] = len(poses)
        path = ROOT / entry["index"]
        path.parent.mkdir(parents=True, exist_ok=True)
        # One row per pose; no repeated image URLs or other full-index fields.
        path.write_text(json.dumps([
            {**item, "views": [v for v in VIEWS.values() if v in item["views"]]}
            for item in poses.values()
        ], ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (ROOT / "data/catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def migrate():
    """Rename old assets once; safe to rerun. Never replace an existing target."""
    names = read_names()
    rows = json.loads((ROOT / "data/pose.json").read_text(encoding="utf-8"))
    expected = {row["id"].rsplit("_", 1)[0] for row in rows}
    if set(names) != expected or len(set(names.values())) != len(names):
        raise ValueError("Asset name registry must cover every source group without collisions")
    moves = []
    for row in rows:
        for key, new_path in zip(("サムネ", "原寸"), asset_paths(row["id"], names)):
            old, new = ROOT / row[key], ROOT / new_path
            if new.exists():
                if old.exists():
                    raise FileExistsError(f"Both source and destination exist: {old}, {new}")
            elif old.is_file():
                moves.append((old, new))
            else:
                raise FileNotFoundError(old)
    for old, new in moves:
        old.rename(new)
    print(f"Renamed {len(moves)} assets; {len(rows)} image records")


if __name__ == "__main__":
    migrate()
