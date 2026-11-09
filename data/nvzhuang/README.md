# 女装参考图集与 AI 模特头像（`paipiange/nvzhuang`）

本目录收录从 [`paipiange/nvzhuang`](https://github.com/paipiange/nvzhuang) 规范化导入的服装与模特参考素材，供 **FitRoom 虚拟试衣间** 与多角度姿势搭配使用。

## 收录规模

- **写实女装（`real/`、`real.json`）**：1407 套（缩略图 + 展示图共 2814 个 WebP 文件）
- **二次元女装（`anime/`、`anime.json`）**：1320 套（缩略图 + 展示图共 2640 个 WebP 文件）
- **AI 模特头像与造型（`portrait/`、`portrait.json`）**：1499 张缩略图 WebP
- **合计本地图片**：6953 个 WebP 文件，共 206.6 MiB

## 来源与授权协议

- **写实 / 二次元女装图集与前端数据整理**：来自 [`paipiange/nvzhuang`](https://github.com/paipiange/nvzhuang)，采用 **MIT License** 开源（图像为 AI 生成概念服装，非真实品牌商品照片；原始设计灵感来自 `@giaaibusi`）。原寸 PNG 外链归属原发布站点条款。
- **AI 模特脸部与造型库**：源自 [ai-portrait-gallery](https://ai-portrait-gallery.pages.dev/)（原作者：あぎ `@agi_aibusi`），采用 **CC0 1.0 Universal** 公共领域贡献；此处通过 `paipiange/nvzhuang` 的索引与多语标签整合。
- **文件校验**：所有本地文件的来源路径、字节数和 SHA-256 校验值均记录在 `sources.json`，可通过 `node scripts/verify-nvzhuang.mjs` 复核。

## 数据重现

```bash
python3 -I scripts/import-nvzhuang.py --fetch
node scripts/verify-nvzhuang.mjs
```
