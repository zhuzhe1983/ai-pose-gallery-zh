# -*- coding: utf-8 -*-
"""把日文数据回填为中文：生成 data/pose-zh.json / meta-zh.json / translations.csv

用法（在仓库根目录）: python3 scripts/apply_translation.py
"""
import csv
import json
import os
import sys
from collections import Counter

import i18n
import i18n_en
from semantic_assets import asset_paths, read_names, semantic_id, write_catalog

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

with open(os.path.join(DATA, "pose.json"), encoding="utf-8") as f:
    data = json.load(f)
with open(os.path.join(DATA, "meta.json"), encoding="utf-8") as f:
    meta = json.load(f)

maps = {
    "系統": i18n.SYSTEM,
    "分類": i18n.CATEGORY,
    "アングル": i18n.ANGLE,
    "ポーズ名": i18n.POSE,
}

missing = {k: sorted({x.get(k) for x in data} - set(m)) for k, m in maps.items()}
bad = {k: v for k, v in missing.items() if v}
if bad:
    print("!! 缺失译词：")
    for k, v in bad.items():
        for s in v:
            print(f"  [{k}] {s}")
    sys.exit(1)

# 中文键名版本
out = []
names = read_names()
for x in data:
    thumb, image = asset_paths(x["id"], names)
    asset_id = semantic_id(x["id"], names)
    out.append({
        "id": asset_id,
        "source_id": x["id"],
        "体系": i18n.SYSTEM[x["系統"]],
        "姿势编号": x["ポーズ番号"],
        "分类": i18n.CATEGORY[x["分類"]],
        "姿势名称": i18n.POSE[x["ポーズ名"]],
        "角度": i18n.ANGLE[x["アングル"]],
        "缩略图": thumb,
        "原图": image,
        "检索": f'{asset_id} {x["id"]} {i18n.SYSTEM[x["系統"]]}{i18n.CATEGORY[x["分類"]]}{i18n.POSE[x["ポーズ名"]]}{i18n.ANGLE[x["アングル"]]}',
    })
with open(os.path.join(DATA, "pose-titles-en.json"), encoding="utf-8") as f:
    titles_en = json.load(f)
locales = {"zh": out, "en": [], "ja": []}
for original, zh in zip(data, out):
    group = original["id"].rsplit("_", 1)[0]
    en = {**zh, "体系": i18n_en.SYSTEM[zh["体系"]], "分类": i18n_en.CATEGORY[zh["分类"]],
          "姿势名称": titles_en[group], "角度": i18n_en.ANGLE[zh["角度"]]}
    ja = {**zh, "体系": original["系統"], "分类": original["分類"],
          "姿势名称": original["ポーズ名"], "角度": original["アングル"]}
    search = " ".join([zh["id"], zh["source_id"]] + [item[key] for item in (zh, en, ja)
                     for key in ("体系", "分类", "姿势名称", "角度")])
    for row in (zh, en, ja):
        row["检索"] = search
    locales["en"].append(en)
    locales["ja"].append(ja)
for lang, rows in locales.items():
    with open(os.path.join(DATA, f"pose-{lang}.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
write_catalog(locales)

with open(os.path.join(DATA, "meta-zh.json"), "w", encoding="utf-8") as f:
    json.dump({"体系分类": [i18n.SYSTEM[s] for s in meta["lines"]]}, f, ensure_ascii=False, indent=2)

# 保留日文原值的双语表（前端可做 hover 对照）
with open(os.path.join(DATA, "translations.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["字段", "日文原文", "中文译文", "出现次数"])
    for k in ["系統", "分類", "角度", "ポーズ名"]:
        field = {"系統": "系統", "分類": "分類", "角度": "アングル", "ポーズ名": "ポーズ名"}[k]
        cnt = Counter(x[field] for x in data)
        for jp in sorted(maps[field]):
            w.writerow([k, jp, maps[field][jp], cnt[jp]])

print("OK 记录数:", len(out))
print("唯一译词:", sum(len(m) for m in maps.values()))
