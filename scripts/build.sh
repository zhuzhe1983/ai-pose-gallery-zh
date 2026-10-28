#!/usr/bin/env bash
# 构建静态托管所需的发布目录 dist/。
# 只拷贝站点运行时真正用到的文件，排除 .git（内含 660 MB 打包对象，
# 会被 Pages 当作静态资源扫描并因超过 25 MiB 单文件限制而报错）。
set -euo pipefail

cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist

cp -R index.html app.js _headers robots.txt sitemap.xml og-cover.jpg .nojekyll llms.txt skills data thumbs img dist/

echo "dist ready:"
du -sh dist
find dist -type f | wc -l
