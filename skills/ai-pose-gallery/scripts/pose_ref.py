#!/usr/bin/env python3
"""List one small pose catalog, construct a URL, or download a reference. Stdlib only."""
import argparse
import json
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://zhuzhe1983.github.io/ai-pose-gallery-zh/"
SYSTEMS = ("solo", "sexy", "upper", "duo")
VIEWS = ("f", "hi", "lo", "s", "d")


def pose_slug(value):
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
        raise ValueError("Use the exact ASCII pose token from the category catalog")
    return value


def make_url(base, path):
    return base.rstrip("/") + "/" + urllib.parse.quote(path, safe="/-_.")


def read_url(url):
    request = urllib.request.Request(url, headers={"User-Agent": "ai-pose-gallery-skill/1"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=BASE, help="Override only for another mirror or local testing")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("catalog", help="List systems and categories (no full image index)")
    for name in ("list", "url", "download"):
        sub = commands.add_parser(name)
        sub.add_argument("--system", required=True, choices=SYSTEMS)
        sub.add_argument("--category", required=True)
        if name == "list":
            sub.add_argument("--query", default="", help="Match English, Chinese or Japanese words within this category")
        else:
            sub.add_argument("--pose", required=True, help="Exact compact pose token from the catalog")
            sub.add_argument("--view", default="f", choices=VIEWS)
            sub.add_argument("--thumb", action="store_true", help="300×400 JPEG instead of 900×1200 PNG")
            if name == "download":
                sub.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "catalog":
        result = json.loads(read_url(make_url(args.base_url, "data/catalog.json")))
    else:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.category):
            parser.error("category must be a catalog slug, e.g. sit")
        if args.command == "list":
            path = f"data/catalog/{args.system}/{args.category}.json"
            result = json.loads(read_url(make_url(args.base_url, path)))
            if args.query:
                terms = args.query.lower().split()
                result = [row for row in result if all(term in " ".join([row["pose"], *row["name"].values()]).lower() for term in terms)]
        else:
            stem = f"{args.system}_{args.category}_{pose_slug(args.pose)}_{args.view}"
            path = f"thumbs/{stem}.jpg" if args.thumb else f"img/{stem}.png"
            if len(Path(path).name) > 64:
                parser.error("Filename exceeds the gallery limit of 64 ASCII characters")
            url = make_url(args.base_url, path)
            if args.command == "url":
                print(url)
                return
            content = read_url(url)
            signature = b"\xff\xd8\xff" if args.thumb else b"\x89PNG\r\n\x1a\n"
            if not content.startswith(signature):
                raise ValueError("响应不是预期的图片；未保存文件")
            args.output_dir.mkdir(parents=True, exist_ok=True)
            output = args.output_dir / Path(path).name
            # Commit only complete, validated bytes; no half-downloaded reference.
            with tempfile.NamedTemporaryFile(dir=args.output_dir, delete=False) as tmp:
                temp_path = Path(tmp.name)
                try:
                    tmp.write(content)
                    tmp.flush()
                except BaseException:
                    temp_path.unlink(missing_ok=True)
                    raise
            try:
                temp_path.replace(output)
            finally:
                temp_path.unlink(missing_ok=True)
            result = {"url": url, "path": str(output.resolve()), "bytes": len(content)}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (urllib.error.URLError, ValueError, OSError) as error:
        print(f"失败：{error}。名称或视角不存在时，读取该分类的 list；不要反复猜 URL。", file=sys.stderr)
        sys.exit(1)
