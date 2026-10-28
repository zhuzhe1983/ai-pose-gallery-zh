#!/usr/bin/env python3
"""并发下载 POSE 站点的 thumbs + img 全部图片（断点续传、失败重试）。

用法（在仓库根目录）:
    python3 scripts/download.py
    WORKERS=64 python3 scripts/download.py
"""
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from semantic_assets import asset_paths, read_names

BASE = "https://ai-pose-gallery.pages.dev/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKERS = int(os.environ.get("WORKERS", "48"))
RETRY = 4
TIMEOUT = 60

with open(os.path.join(ROOT, "data", "pose.json"), encoding="utf-8") as f:
    data = json.load(f)

tasks = []
names = read_names()
for item in data:
    for key, destination in zip(("サムネ", "原寸"), asset_paths(item["id"], names)):
        tasks.append((BASE + item[key], os.path.join(ROOT, destination)))
tasks = list(dict.fromkeys(tasks))


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 1024:
        return "skip", path, os.path.getsize(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    last = None
    for attempt in range(RETRY):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": BASE})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                body = r.read()
            if len(body) < 1024:
                raise IOError("too small: %d" % len(body))
            tmp = path + ".part"
            with open(tmp, "wb") as f:
                f.write(body)
            os.replace(tmp, path)
            return "ok", path, len(body)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(0.4 * (attempt + 1))
    return "fail", path, str(last)


t0 = time.time()
ok = skip = fail = 0
fails = []
total_bytes = 0
with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    futs = [ex.submit(fetch, u, p) for u, p in tasks]
    for i, fut in enumerate(as_completed(futs), 1):
        st, path, info = fut.result()
        if st == "ok":
            ok += 1
            total_bytes += info
        elif st == "skip":
            skip += 1
            if isinstance(info, int):
                total_bytes += info
        else:
            fail += 1
            fails.append((path, info))
        if i % 200 == 0 or i == len(tasks):
            el = time.time() - t0
            print(f"[{i}/{len(tasks)}] ok={ok} skip={skip} fail={fail} "
                  f"{total_bytes/1048576:.0f}MB {el:.0f}s ({i/el:.1f}/s)", flush=True)

print(f"DONE ok={ok} skip={skip} fail={fail} {time.time()-t0:.0f}s")
if fails:
    with open(os.path.join(ROOT, "download_failed.txt"), "w", encoding="utf-8") as f:
        for p, e in fails:
            f.write(f"{p}\t{e}\n")
    print("failed list -> download_failed.txt")
