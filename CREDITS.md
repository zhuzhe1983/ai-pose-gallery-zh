# 致谢与版权目录 · Credits & Attribution

本项目 **FitRoom · Virtual Fitting Room（虚拟试衣间）** 由多个开源代码项目与公开参考数据集整合而成。所有代码与素材均严格保留原始署名、来源链接与对应许可协议，**各组成部分适用各自独立的许可范围，互不覆盖**。

---

## 1. 服装图集与 AI 模特素材（`data/nvzhuang/`）

### 女装参考图集（写实 1,407 套 + 二次元 1,320 套）
- **来源仓库**：[paipiange/nvzhuang](https://github.com/paipiange/nvzhuang)（作者：`paipiange`）
- **原始灵感**：[COSTUME-DB-01](https://x.com/giaaibusi)（X `@giaaibusi`）
- **授权协议**：**MIT License**
- **使用说明**：图集中的服装图像为 AI 生成的概念服装设计参考，非真实品牌商品实拍，代码与图片素材均按 MIT 协议开源整合。原寸 PNG 外链归属原发布站点条款。

### AI 模特脸部与造型库（1,499 张）
- **原始来源**：[ai-portrait-gallery](https://ai-portrait-gallery.pages.dev/)（原作者：あぎ / `@agi_aibusi`）
- **整合来源**：经由 [paipiange/nvzhuang](https://github.com/paipiange/nvzhuang) 收录的缩略图索引与多语发型标签
- **授权协议**：**CC0 1.0 Universal**（公共领域贡献，自愿署名致谢）

---

## 2. 人体姿势参考图集（`img/`、`thumbs/`、`data/wavespeed/`）

### 原版多角度人体姿势图库（288 组 / 1,439 张）
- **原作者**：ギア（`@giaaibusi`）
- **原始站点**：<https://ai-pose-gallery.pages.dev/>
- **中文版整理与汉化维护**：Anhao（[github.com/anhao/ai-pose-gallery-zh](https://github.com/anhao/ai-pose-gallery-zh) · [X `@anhao_ai`](https://x.com/anhao_ai)）
- **授权与限制**：原站允许用于作品制作、加工与动作参考（含商业作品）；**图片数据本身（原尺寸或加工后）的再分发、转载与转售受原作者条款限制，不适用仓库 MIT 协议**。

### 扩展姿势参考图集（491 组 / 2,946 张）
- **来源**：[WaveSpeed AI Pose Gallery](https://wavespeed.ai/free-tools/ai-pose-gallery)
- **详细溯源与校验**：见 [`data/wavespeed/README.md`](data/wavespeed/README.md) 与 `data/wavespeed/sources.json`
- **授权与限制**：WaveSpeed AI 允许个人及商业创作参考使用，**禁止单独将图片打包作为姿势图包转售**，不适用代码 MIT 协议。

---

## 3. 3D 摆姿工作台与浏览器端引擎（`studio/`）

`studio/` 目录独立采用 **GPL-3.0-only** 协议（见 [`studio/LICENSE`](studio/LICENSE) 与 [`studio/THIRD_PARTY.md`](studio/THIRD_PARTY.md)）：

- **[Mannequin.js](https://github.com/boytchev/mannequin.js)**（`mannequin-js@5.2.3`）— Pavel Boytchev，**GPL-3.0**
- **[Three.js](https://github.com/mrdoob/three.js)**（`three@0.186.1`）— **MIT License**
- **[MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe)**（`@mediapipe/tasks-vision@1.2.0` + BlazePose GHUM Full float16 v1）— Google，**Apache-2.0**
- **[MakeHuman / MPFB](https://github.com/makehumancommunity/mpfb2)** 成人男女连续人体网格与胸部形态增量 — **CC0 1.0**（详情见 [`studio/assets/humans/README.md`](studio/assets/humans/README.md)）

---

## 4. 网站代码维护与社区致谢

- **仓库维护者**：`zhuzhe1983`（[github.com/zhuzhe1983/ai-pose-gallery-zh](https://github.com/zhuzhe1983/ai-pose-gallery-zh)）
- **上游中文画廊与 3D 工作台基础**：Anhao（[github.com/anhao/ai-pose-gallery-zh](https://github.com/anhao/ai-pose-gallery-zh)）
- **女装参考图集、模特整合与社区灵感**：`paipiange`（[github.com/paipiange/nvzhuang](https://github.com/paipiange/nvzhuang)）及 [LINUX DO](https://linux.do/) 社区

> 若任何版权方或原作者认为本仓库引用或展示存在不当之处，请通过 GitHub Issue 联系，我们将第一时间核实并移除相关内容。
