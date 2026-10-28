# -*- coding: utf-8 -*-
"""校验：文件是否存在、大小是否正常、图片头是否合法。

用法（在仓库根目录）: python3 scripts/verify.py
"""
import json
import os
import sys
import re
from pathlib import Path
from semantic_assets import asset_paths, read_names, semantic_id

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JPEG = b"\xff\xd8\xff"
PNG = b"\x89PNG\r\n\x1a\n"

with open(os.path.join(ROOT, "data", "pose-zh.json"), encoding="utf-8") as f:
    data = json.load(f)

bad = []
total = 0
size_thumbs = size_img = 0
for item in data:
    for key, magic in (("缩略图", JPEG), ("原图", PNG)):
        p = os.path.join(ROOT, item[key])
        total += 1
        if not os.path.exists(p):
            bad.append((p, "MISSING"))
            continue
        sz = os.path.getsize(p)
        if sz < 2048:
            bad.append((p, f"TOO_SMALL {sz}"))
            continue
        with open(p, "rb") as fh:
            head = fh.read(8)
        if not head.startswith(magic):
            bad.append((p, f"BAD_HEADER {head[:4]!r}"))
            continue
        if key == "缩略图":
            size_thumbs += sz
        else:
            size_img += sz

root = Path(ROOT)
source = json.loads((root / "data/pose.json").read_text(encoding="utf-8"))
names = read_names()
assert len(data) == len(source) == len({row['id'] for row in data})
assert {row['id'] for row in source} == {row['source_id'] for row in data}
assert len(names) == len(set(names.values())) == len({row['id'].rsplit('_', 1)[0] for row in source})
for row in data:
    assert row['id'] == semantic_id(row['source_id'], names)
    assert (row['缩略图'], row['原图']) == asset_paths(row['source_id'], names)
    filename = Path(row['原图']).name
    assert re.fullmatch(r'[a-z0-9_-]+\.png', filename), filename
    assert len(filename) <= 64, filename
for directory, field in [('img', '原图'), ('thumbs', '缩略图')]:
    assert {p.relative_to(root).as_posix() for p in (root / directory).iterdir() if p.is_file()} == {row[field] for row in data}
catalog = json.loads((root / 'data/catalog.json').read_text(encoding='utf-8'))
catalog_ids = []
catalog_files = set()
for system, entry in catalog['systems'].items():
    for category, info in entry['categories'].items():
        catalog_files.add(root / info['index'])
        poses = json.loads((root / info['index']).read_text(encoding='utf-8'))
        assert len(poses) == info['pose_count']
        for pose in poses:
            assert set(pose['name']) == {'zh', 'en', 'ja'}
            catalog_ids.extend(f"{system}_{category}_{pose['pose']}_{view}" for view in pose['views'])
assert len(catalog_ids) == len(set(catalog_ids)) == len(data)
assert set(catalog_ids) == {row['id'] for row in data}
assert catalog_files == set((root / 'data/catalog').rglob('*.json'))
for lang in ('en', 'ja'):
    translated = json.loads((root / f'data/pose-{lang}.json').read_text(encoding='utf-8'))
    assert len(translated) == len(data)
    for zh, row in zip(data, translated):
        for key in ('id', 'source_id', '原图', '缩略图', '姿势编号'):
            assert row[key] == zh[key]
        assert all(row[key] for key in ('体系', '分类', '姿势名称', '角度'))
ui = json.loads((root / 'data/ui.json').read_text(encoding='utf-8'))
for lang in ('en', 'ja'):
    assert set(ui[lang]) == set(ui['zh'])
    for key, text in ui['zh'].items():
        assert set(re.findall(r'\{\w+\}', text)) == set(re.findall(r'\{\w+\}', ui[lang][key])), (lang, key)
html = (root / 'index.html').read_text(encoding='utf-8')
app = (root / 'app.js').read_text(encoding='utf-8')
used_keys = set(re.findall(r'data-i18n(?:-html|-aria-label|-placeholder|-title)?="([^"]+)"', html))
used_keys.update(re.findall(r"\bt\('([^']+)'", app))
assert used_keys <= set(ui['zh']), used_keys - set(ui['zh'])
print(f"语义命名与分类目录校验通过：{len(names)} 组、{len(catalog_files)} 个小目录")
print(f"期望文件数 {total}，异常 {len(bad)}")
print(f"thumbs 合计 {size_thumbs/1048576:.1f} MB，img 合计 {size_img/1048576:.1f} MB，"
      f"总计 {(size_thumbs+size_img)/1048576:.1f} MB")
if bad:
    for p, why in bad[:40]:
        print(" ", p, why)
    with open(os.path.join(ROOT, "verify_failed.txt"), "w", encoding="utf-8") as f:
        for p, why in bad:
            f.write(f"{p}\t{why}\n")
    print("完整清单 -> verify_failed.txt")
    sys.exit(1)
print("全部通过 ✅")
