#!/usr/bin/env python3
"""Import outfit and AI portrait assets from paipiange/nvzhuang.

Supports either a local checkout (--source-dir) or direct parallel download (--fetch).

Usage:
  python3 -I scripts/import-nvzhuang.py --source-dir /path/to/nvzhuang
  python3 -I scripts/import-nvzhuang.py --fetch [--meta-dir /path/to/meta] [--workers 32]
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "nvzhuang"
UPSTREAM_REPO = "https://github.com/paipiange/nvzhuang"
UPSTREAM_RAW = "https://raw.githubusercontent.com/paipiange/nvzhuang/main"
UPSTREAM_PAGES = "https://paipiange.github.io/nvzhuang"

GARMENT_CATEGORIES = {
    "春": {"slug": "spring", "zh": "春季穿搭", "en": "Spring", "ja": "春"},
    "夏": {"slug": "summer", "zh": "夏季穿搭", "en": "Summer", "ja": "夏"},
    "秋": {"slug": "autumn", "zh": "秋季穿搭", "en": "Autumn", "ja": "秋"},
    "冬": {"slug": "winter", "zh": "冬季穿搭", "en": "Winter", "ja": "冬"},
    "ランジェリー": {"slug": "lingerie", "zh": "内衣家居", "en": "Lingerie", "ja": "ランジェリー"},
    "パーティ": {"slug": "party", "zh": "礼服派对", "en": "Party", "ja": "パーティ"},
    "水着": {"slug": "swimwear", "zh": "泳装度假", "en": "Swimwear", "ja": "水着"},
    "セクシー": {"slug": "sexy", "zh": "性感风格", "en": "Sexy", "ja": "セクシー"},
}

PORTRAIT_CATEGORIES = {
    "短发": {"slug": "short", "zh": "短发", "en": "Short hair", "ja": "ショート"},
    "中发": {"slug": "medium", "zh": "中发", "en": "Medium hair", "ja": "ミディアム"},
    "中长发": {"slug": "semi-long", "zh": "中长发", "en": "Medium-long hair", "ja": "セミロング"},
    "长发": {"slug": "long", "zh": "长发", "en": "Long hair", "ja": "ロング"},
}

PORTRAIT_SECTIONS = {
    "face": {"zh": "脸部特写", "en": "Face close-up", "ja": "顔アップ"},
    "styling": {"zh": "全身/半身造型", "en": "Styling shot", "ja": "スタイリング"},
}

EN2ZH = {
    "ivory": "象牙白", "white": "白", "black": "黑", "red": "红", "pink": "粉", "blue": "蓝",
    "navy": "藏青", "brown": "棕", "beige": "米色", "grey": "灰", "green": "绿", "yellow": "黄",
    "orange": "橙", "purple": "紫", "lavender": "薰衣草紫", "mint": "薄荷绿", "cream": "奶油白",
    "gold": "金", "silver": "银", "khaki": "卡其", "burgundy": "酒红", "olive": "橄榄绿",
    "dress": "连衣裙", "skirt": "半身裙", "jacket": "夹克", "coat": "外套", "sweater": "毛衣",
    "cardigan": "开衫", "blouse": "衬衫", "shirt": "衬衫", "pants": "裤子", "jeans": "牛仔裤",
    "shorts": "短裤", "boots": "靴子", "sneakers": "运动鞋", "sandals": "凉鞋", "heels": "高跟鞋",
    "loafers": "乐福鞋", "pumps": "浅口鞋", "socks": "袜子", "tights": "连裤袜", "stockings": "丝袜",
    "bag": "包", "tote": "托特包", "hat": "帽子", "beret": "贝雷帽", "beanie": "针织帽",
    "scarf": "围巾", "muffler": "围巾", "gloves": "手套", "belt": "腰带", "necklace": "项链",
    "choker": "项圈", "camisole": "吊带背心", "bra": "文胸", "briefs": "内裤", "swimsuit": "泳装",
    "bikini": "比基尼", "hoodie": "连帽衫", "vest": "马甲", "corset": "束腰", "robe": "睡袍",
    "turtleneck": "高领", "sunglasses": "墨镜", "headband": "发箍", "apron": "围裙",
    "denim": "丹宁", "lace": "蕾丝", "satin": "缎面", "leather": "皮革", "knit": "针织",
    "suede": "麂皮", "fur": "皮草", "velvet": "丝绒", "wool": "羊毛", "chiffon": "雪纺",
    "tulle": "薄纱", "mesh": "网纱", "corduroy": "灯芯绒", "floral": "碎花",
    "polka-dot": "波点", "ribbon": "蝴蝶结", "frill": "荷叶边", "pleated": "百褶",
    "mini": "迷你", "midi": "中长", "maxi": "及地",
}


def extract_const_json(text: str, var_name: str):
    pattern = re.compile(rf"\bconst\s+{re.escape(var_name)}\s*=\s*")
    match = pattern.search(text)
    if not match:
        raise ValueError(f"Could not find declaration for {var_name}")
    decoder = json.JSONDecoder()
    obj, _ = decoder.raw_decode(text, match.end())
    return obj


def is_webp_bytes(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def is_webp(path: Path) -> bool:
    if not path.is_file():
        return False
    with path.open("rb") as fh:
        return is_webp_bytes(fh.read(12))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_bytes(url: str, timeout: int = 45, retries: int = 4) -> bytes:
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "FitRoom-Importer/1"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(0.4 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last}")


def ensure_webp_from_remote(upstream_rel: str, dst: Path) -> None:
    if is_webp(dst):
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    data = None
    for base in (UPSTREAM_RAW, UPSTREAM_PAGES):
        try:
            body = fetch_bytes(f"{base}/{upstream_rel}")
            if is_webp_bytes(body):
                data = body
                break
        except Exception:  # noqa: BLE001
            continue
    if data is None:
        raise ValueError(f"Unable to fetch valid WebP for {upstream_rel}")
    tmp = dst.with_suffix(".part")
    tmp.write_bytes(data)
    os.replace(tmp, dst)


def copy_webp_local(src: Path, dst: Path) -> None:
    if not src.is_file():
        raise FileNotFoundError(f"Missing source asset: {src}")
    if not is_webp(src):
        raise ValueError(f"Invalid WebP header: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not is_webp(dst) or dst.stat().st_size != src.stat().st_size:
        shutil.copy2(src, dst)


def translate_keywords_zh(kw: str) -> list[str]:
    out = []
    seen = set()
    for token in kw.lower().split():
        zh = EN2ZH.get(token)
        if zh and zh not in seen:
            seen.add(zh)
            out.append(zh)
    return out


def prepare_garments(rows: list[dict], library: str, jobs: list[dict]):
    prefix = "anime" if library == "anime" else ""
    out_rows = []
    counts = {meta["slug"]: 0 for meta in GARMENT_CATEGORIES.values()}
    seen_ids = set()

    for row in rows:
        item_id = row["id"]
        if not re.fullmatch(r"[A-Za-z0-9_-]+", item_id):
            raise ValueError(f"Unexpected garment id: {item_id}")
        if item_id in seen_ids:
            raise ValueError(f"Duplicate garment id: {item_id}")
        seen_ids.add(item_id)

        cat_meta = GARMENT_CATEGORIES[row["カテゴリ"]]
        slug = cat_meta["slug"]
        counts[slug] += 1

        thumb_rel = row["サムネ"]
        img_rel = row["画像"]
        if prefix and not thumb_rel.startswith(f"{prefix}/"):
            raise ValueError(f"Unexpected anime path: {thumb_rel}")

        dst_thumb = OUT / library / "thumbs" / Path(thumb_rel).name
        dst_img = OUT / library / "img" / Path(img_rel).name

        jobs.append({"id": item_id, "kind": f"{library}_thumb", "upstream_rel": f"assets/{thumb_rel}", "dst": dst_thumb})
        jobs.append({"id": item_id, "kind": f"{library}_img", "upstream_rel": f"assets/{img_rel}", "dst": dst_img})

        kw_en = " ".join(str(row.get("キーワード", "")).split())
        kw_zh = translate_keywords_zh(kw_en)
        ext_png = row.get("原寸", "")
        if ext_png and not ext_png.startswith("http"):
            ext_png = f"https://ai-costume-gallery.pages.dev/{ext_png}" if library == "real" else ext_png

        search_parts = [
            f"{library}:{item_id}", item_id,
            cat_meta["zh"], cat_meta["en"], cat_meta["ja"],
            kw_en, *kw_zh,
        ]
        out_rows.append({
            "id": f"{library}:{item_id}",
            "code": item_id,
            "library": library,
            "category": slug,
            "categoryName": {"zh": cat_meta["zh"], "en": cat_meta["en"], "ja": cat_meta["ja"]},
            "keywords": kw_en,
            "keywordsZh": kw_zh,
            "thumb": dst_thumb.relative_to(ROOT).as_posix(),
            "image": dst_img.relative_to(ROOT).as_posix(),
            "externalOriginal": ext_png or None,
            "search": " ".join(p for p in search_parts if p).lower(),
        })

    return out_rows, counts


def prepare_portraits(rows: list[dict], jobs: list[dict]):
    out_rows = []
    counts = {meta["slug"]: 0 for meta in PORTRAIT_CATEGORIES.values()}
    section_counts = {"face": 0, "styling": 0}
    seen_ids = set()

    for row in rows:
        item_id = row["id"]
        if not re.fullmatch(r"[A-Za-z0-9_-]+", item_id):
            raise ValueError(f"Unexpected portrait id: {item_id}")
        if item_id in seen_ids:
            raise ValueError(f"Duplicate portrait id: {item_id}")
        seen_ids.add(item_id)

        cat_meta = PORTRAIT_CATEGORIES[row["カテゴリ"]]
        slug = cat_meta["slug"]
        counts[slug] += 1

        sec = row.get("sec", "face")
        if sec not in PORTRAIT_SECTIONS:
            raise ValueError(f"Unknown portrait section: {sec}")
        section_counts[sec] += 1

        thumb_rel = row["サムネ"]
        dst_thumb = OUT / "portrait" / "thumbs" / Path(thumb_rel).name
        jobs.append({"id": item_id, "kind": "portrait_thumb", "upstream_rel": f"assets/{thumb_rel}", "dst": dst_thumb})

        style_zh = row.get("styleZh") or ""
        style_en = row.get("styleEn") or ""
        style_ja = row.get("style") or ""
        hair_zh = row.get("hairZh") or cat_meta["zh"]
        hair_en = row.get("hairEn") or cat_meta["en"]
        hair_ja = row.get("hair") or cat_meta["ja"]

        search_parts = [
            f"portrait:{item_id}", item_id, sec,
            PORTRAIT_SECTIONS[sec]["zh"], PORTRAIT_SECTIONS[sec]["en"], PORTRAIT_SECTIONS[sec]["ja"],
            hair_zh, hair_en, hair_ja,
            style_zh, style_en, style_ja,
            str(row.get("キーワード", "")),
        ]
        out_rows.append({
            "id": f"portrait:{item_id}",
            "code": item_id,
            "section": sec,
            "sectionName": PORTRAIT_SECTIONS[sec],
            "category": slug,
            "categoryName": {"zh": cat_meta["zh"], "en": cat_meta["en"], "ja": cat_meta["ja"]},
            "hair": {"zh": hair_zh, "en": hair_en, "ja": hair_ja},
            "style": {"zh": style_zh, "en": style_en, "ja": style_ja},
            "width": row.get("w"),
            "height": row.get("h"),
            "thumb": dst_thumb.relative_to(ROOT).as_posix(),
            "image": dst_thumb.relative_to(ROOT).as_posix(),
            "externalOriginal": row.get("原寸") or None,
            "search": " ".join(p for p in search_parts if p).lower(),
        })

    return out_rows, counts, section_counts


def write_readme(real_count: int, anime_count: int, portrait_count: int, total_bytes: int):
    mb = total_bytes / (1024 * 1024)
    text = f"""# 女装参考图集与 AI 模特头像（`paipiange/nvzhuang`）

本目录收录从 [`paipiange/nvzhuang`]({UPSTREAM_REPO}) 规范化导入的服装与模特参考素材，供 **FitRoom 虚拟试衣间** 与多角度姿势搭配使用。

## 收录规模

- **写实女装（`real/`、`real.json`）**：{real_count} 套（缩略图 + 展示图共 {real_count * 2} 个 WebP 文件）
- **二次元女装（`anime/`、`anime.json`）**：{anime_count} 套（缩略图 + 展示图共 {anime_count * 2} 个 WebP 文件）
- **AI 模特头像与造型（`portrait/`、`portrait.json`）**：{portrait_count} 张缩略图 WebP
- **合计本地图片**：{real_count * 2 + anime_count * 2 + portrait_count} 个 WebP 文件，共 {mb:.1f} MiB

## 来源与授权协议

- **写实 / 二次元女装图集与前端数据整理**：来自 [`paipiange/nvzhuang`]({UPSTREAM_REPO})，采用 **MIT License** 开源（图像为 AI 生成概念服装，非真实品牌商品照片；原始设计灵感来自 `@giaaibusi`）。原寸 PNG 外链归属原发布站点条款。
- **AI 模特脸部与造型库**：源自 [ai-portrait-gallery](https://ai-portrait-gallery.pages.dev/)（原作者：あぎ `@agi_aibusi`），采用 **CC0 1.0 Universal** 公共领域贡献；此处通过 `paipiange/nvzhuang` 的索引与多语标签整合。
- **文件校验**：所有本地文件的来源路径、字节数和 SHA-256 校验值均记录在 `sources.json`，可通过 `node scripts/verify-nvzhuang.mjs` 复核。

## 数据重现

```bash
python3 -I scripts/import-nvzhuang.py --fetch
node scripts/verify-nvzhuang.mjs
```
"""
    (OUT / "README.md").write_text(text, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--source-dir", type=Path, help="Path to local paipiange/nvzhuang checkout")
    mode.add_argument("--fetch", action="store_true", help="Fetch metadata and WebP assets directly from upstream")
    parser.add_argument("--meta-dir", type=Path, help="Optional cached directory with data.js / data-anime.js / data-portrait.js")
    parser.add_argument("--workers", type=int, default=24, help="Concurrent download workers for --fetch")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    meta_root = args.meta_dir or args.source_dir

    def read_meta(filename: str) -> str:
        if meta_root and (meta_root / filename).is_file():
            return (meta_root / filename).read_text(encoding="utf-8")
        return fetch_bytes(f"{UPSTREAM_RAW}/{filename}").decode("utf-8")

    real_raw = extract_const_json(read_meta("data.js"), "D")
    anime_raw = extract_const_json(read_meta("data-anime.js"), "D_ANIME")
    portrait_raw = extract_const_json(read_meta("data-portrait.js"), "D_PORTRAIT")

    jobs: list[dict] = []
    real_rows, real_counts = prepare_garments(real_raw, "real", jobs)
    anime_rows, anime_counts = prepare_garments(anime_raw, "anime", jobs)
    portrait_rows, portrait_counts, section_counts = prepare_portraits(portrait_raw, jobs)

    src_assets = args.source_dir.resolve() / "assets" if args.source_dir else None
    t0 = time.time()

    def process_job(job: dict) -> dict:
        dst = job["dst"]
        if src_assets:
            rel = job["upstream_rel"].removeprefix("assets/")
            copy_webp_local(src_assets / rel, dst)
        else:
            ensure_webp_from_remote(job["upstream_rel"], dst)
        return {
            "id": job["id"],
            "kind": job["kind"],
            "path": dst.relative_to(ROOT).as_posix(),
            "bytes": dst.stat().st_size,
            "sha256": sha256_file(dst),
            "upstream": f"{UPSTREAM_RAW}/{job['upstream_rel']}",
        }

    sources = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futs = [pool.submit(process_job, job) for job in jobs]
        for idx, fut in enumerate(as_completed(futs), 1):
            sources.append(fut.result())
            if idx % 500 == 0 or idx == len(jobs):
                elapsed = max(0.1, time.time() - t0)
                print(f"[{idx}/{len(jobs)}] processed in {elapsed:.1f}s", flush=True)

    sources.sort(key=lambda s: s["path"])

    (OUT / "real.json").write_text(
        json.dumps(real_rows, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    (OUT / "anime.json").write_text(
        json.dumps(anime_rows, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    (OUT / "portrait.json").write_text(
        json.dumps(portrait_rows, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )

    catalog = {
        "schema_version": 1,
        "source": UPSTREAM_REPO,
        "libraries": {
            "real": {
                "name": {"zh": "写实女装", "en": "Realistic outfits", "ja": "リアル衣装"},
                "license": "MIT",
                "count": len(real_rows),
                "index": "data/nvzhuang/real.json",
                "categories": {
                    meta["slug"]: {
                        "name": {"zh": meta["zh"], "en": meta["en"], "ja": meta["ja"]},
                        "count": real_counts[meta["slug"]],
                    }
                    for meta in GARMENT_CATEGORIES.values()
                },
            },
            "anime": {
                "name": {"zh": "二次元女装", "en": "Anime outfits", "ja": "アニメ衣装"},
                "license": "MIT",
                "count": len(anime_rows),
                "index": "data/nvzhuang/anime.json",
                "categories": {
                    meta["slug"]: {
                        "name": {"zh": meta["zh"], "en": meta["en"], "ja": meta["ja"]},
                        "count": anime_counts[meta["slug"]],
                    }
                    for meta in GARMENT_CATEGORIES.values()
                },
            },
            "portrait": {
                "name": {"zh": "AI 模特头像", "en": "AI model portraits", "ja": "AI モデル顔"},
                "license": "CC0-1.0",
                "source": "https://ai-portrait-gallery.pages.dev/",
                "count": len(portrait_rows),
                "index": "data/nvzhuang/portrait.json",
                "sections": {
                    sec: {"name": name, "count": section_counts[sec]}
                    for sec, name in PORTRAIT_SECTIONS.items()
                },
                "categories": {
                    meta["slug"]: {
                        "name": {"zh": meta["zh"], "en": meta["en"], "ja": meta["ja"]},
                        "count": portrait_counts[meta["slug"]],
                    }
                    for meta in PORTRAIT_CATEGORIES.values()
                },
            },
        },
    }
    (OUT / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUT / "sources.json").write_text(
        json.dumps(sources, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    total_bytes = sum(s["bytes"] for s in sources)
    write_readme(len(real_rows), len(anime_rows), len(portrait_rows), total_bytes)

    print(
        f"Imported {len(real_rows)} real + {len(anime_rows)} anime outfits + "
        f"{len(portrait_rows)} portraits ({len(sources)} files, {total_bytes / 1048576:.1f} MiB)."
    )


if __name__ == "__main__":
    main()
