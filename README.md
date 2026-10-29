# AI Pose Gallery · 中文 / English / 日本語

> 288 组 / 1439 张多角度姿势参考图，支持中英日切换、ASCII 语义短文件名和 Agent Skill。

![画廊预览](docs/preview.jpg)

<details><summary>手机端预览</summary>

![手机端预览](docs/mobile.jpg)

</details>

**GitHub Pages：** <https://zhuzhe1983.github.io/ai-pose-gallery-zh/>
**语言：** [中文](https://zhuzhe1983.github.io/ai-pose-gallery-zh/?lang=zh) · [English](https://zhuzhe1983.github.io/ai-pose-gallery-zh/?lang=en) · [日本語](https://zhuzhe1983.github.io/ai-pose-gallery-zh/?lang=ja)
**Agent Skill：** [SKILL.md](https://zhuzhe1983.github.io/ai-pose-gallery-zh/skills/ai-pose-gallery/SKILL.md)
**上游中文版：** <https://ai-pose-gallery.anhao.app/>
**原始站点：** <https://ai-pose-gallery.pages.dev/>
**原作者：** ギア（@giaaibusi）
**中文版维护：** Anhao · [X @anhao_ai](https://x.com/anhao_ai)
**GitHub：** <https://github.com/zhuzhe1983/ai-pose-gallery-zh>
**上游仓库：** <https://github.com/anhao/ai-pose-gallery-zh>

---

## Agent 访问与 AIGC

先读 [skill](skills/ai-pose-gallery/SKILL.md)，也可从 [llms.txt](llms.txt) 发现入口。本站不提供图片生成服务；agent 下载原图后，把它作为真实的图像输入交给可用的生成工具。

图片统一命名为 `{type}_{category}_{pose}_{view}.png`，例如：

```text
img/solo_sit_lean-bk-kn-up_f.png
thumbs/solo_sit_lean-bk-kn-up_f.jpg
```

`solo` 表示标准单人，`sit` 表示坐姿，`lean-bk-kn-up` 表示后仰抬膝，`f` 表示正面。常用缩写和其他类型、视角见 skill。只用小写 ASCII 字母、数字、`-` 和 `_`；含扩展名最多 64 个字符，目前最长 38 个字符。名称不随页面语言变化。

- 已知准确名称：直接访问原图，不需要索引。
- 查找姿势：[data/catalog/solo/sit.json](data/catalog/solo/sit.json) 等分类小目录包含名称、中英日说明和实际可用视角，每个姿势只记录一次。
- 不知道分类：[data/catalog.json](data/catalog.json) 列出 4 个体系、30 个体系内分类目录。
- 原始编号只用于溯源；[data/asset-names.json](data/asset-names.json) 保存固定映射。修改显示标题不会改动图片 URL。个别姿势缺少部分视角，须以目录为准。

安装到本机 Codex（只下载 skill 的 3 个小文件，不克隆图库）：

```bash
pose_skill_dir="${CODEX_HOME:-$HOME/.codex}/skills/ai-pose-gallery"
pose_site="https://zhuzhe1983.github.io/ai-pose-gallery-zh"
mkdir -p "$pose_skill_dir/scripts" "$pose_skill_dir/agents"
curl -fL "$pose_site/skills/ai-pose-gallery/SKILL.md" -o "$pose_skill_dir/SKILL.md"
curl -fL "$pose_site/skills/ai-pose-gallery/scripts/pose_ref.py" -o "$pose_skill_dir/scripts/pose_ref.py"
curl -fL "$pose_site/skills/ai-pose-gallery/agents/openai.yaml" -o "$pose_skill_dir/agents/openai.yaml"
```

其他 agent 也可直接读取公开的 SKILL.md 并按约定访问，不依赖 Codex。Python 辅助脚本仅使用标准库：

```bash
python3 skills/ai-pose-gallery/scripts/pose_ref.py list --system solo --category sit --query 'knee'
python3 skills/ai-pose-gallery/scripts/pose_ref.py download --system solo --category sit --pose lean-bk-kn-up --view d --output-dir ./output/pose-refs
```

## 三语与数据维护

语言选择器和 `?lang=zh|en|ja` 控制界面、分类、姿势与视角；选择会保存在浏览器本地。关键词搜索同时匹配三种语言和新旧 ID。

- `data/ui.json`：三语界面文案。
- `data/pose-zh.json`、`data/pose-en.json`、`data/pose-ja.json`：同一组图片的三语展示数据，三者字段结构一致。
- `data/pose.json`：原站日文数据，原始路径只用于向原站下载，**不是本站的图片地址**。
- `data/pose-titles-en.json`：288 个英文显示标题；中文译文在 `scripts/i18n.py`，日文采用原数据。
- `data/asset-names.json`：原始姿势组 ID 到固定短名称的映射；需要维护名称时在此修改。

修改译文后运行 `python3 scripts/apply_translation.py`，会生成三语数据和分类目录。`python3 scripts/verify.py` 校验命名长度、ASCII、唯一性、三语引用一致性、目录覆盖与全部图片文件。原图内容没有修改。

## 部署到 GitHub Pages

本仓库使用 `main` 分支根目录发布，`.nojekyll` 关闭 Jekyll 处理，无需安装依赖或构建框架。GitHub 仓库 Settings → Pages → Deploy from a branch → `main` / `(root)`。之后推送到 `main` 即自动发布。发布方式参见 [GitHub 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

正式地址为 `https://zhuzhe1983.github.io/ai-pose-gallery-zh/`。所有运行时资源用相对路径，支持项目子目录；不能省略 `/ai-pose-gallery-zh/`。其他静态平台可运行 `bash scripts/build.sh`，发布 `dist/`。

## 这是什么

原站是一套面向 AI 绘画 / 3D / 摄影参考的姿势图库，元数据全部为日文，且不提供批量素材下载。本仓库做了三件事：

1. **全量镜像** —— 1439 条记录对应的 1439 张缩略图（JPG 300×400）与 1439 张原图（PNG 900×1200）全部落地，共 2878 个文件 / 659.5 MB。
2. **完整汉化** —— 日文字段逐条译为中文，覆盖 4 个体系、26 个分类、288 个姿势名、5 个视角，零遗漏。
3. **可用的前端** —— 零依赖响应式画廊，完整实现原站的分类筛选、多角度切换、分组浏览、灯箱导航与原图下载，并针对手机重新设计布局。

## 页面功能

- 4 个体系页签，显示各体系的图片数与姿势组数
- 姿势名、编号、ID、分类关键词搜索，支持 `/` 快速聚焦
- 动作分类、5 种视角组合筛选，可一键重置
- **按姿势分组 / 逐张浏览**双模式，分组卡片带多角度缩略图
- 悬停或点击缩略图切换主图角度，点击卡片打开灯箱
- 灯箱先显示缩略图、再加载 900×1200 原图，支持直接下载 PNG、复制 ID、新窗口打开
- `← / →` 切换角度，`↑ / ↓` 切换姿势，`Esc` 关闭；手机支持左右滑动
- PC 多列网格、手机双列网格，移动端筛选面板可展开/收起
- 使用指南与注意事项弹窗，页脚标注图片来源与维护者链接

## SEO 与分享

页面内置了完整的 SEO 与社交分享配置：

- 关键词化标题：`AI 姿势参考库｜288 组人体姿势 · 1439 张多角度参考图`
- 独立 description、keywords、author 与 `max-image-preview:large`
- `canonical` 指向正式域名，避免自定义域名与 pages.dev 域名重复收录
- Open Graph / Twitter Card 使用 1200×630 的 `og-cover.jpg`
- JSON-LD 结构化数据：`WebSite` + `ImageGallery`，声明语言、简介与页面主图
- `robots.txt` 放行全站并声明 sitemap，`sitemap.xml` 指向首页
- 语义结构：单一 H1、分区 H2、卡片 H3；缩略图 `alt` 含姿势名与视角，图片懒加载

本站的 SEO 地址指向 `https://zhuzhe1983.github.io/ai-pose-gallery-zh/`。Fork 后如使用其他域名，需同步替换 `index.html` 的 canonical、`og:*`、`twitter:*`、JSON-LD，以及 `robots.txt`、`sitemap.xml` 中的地址。

## 数据规模

| 体系 | 条数 |
| --- | ---: |
| 全身单人・标准系 | 365 |
| 全身单人・性感系 | 399 |
| 上半身单人 | 400 |
| 双人缠绵 | 275 |
| **合计** | **1439** |

每条记录对应 5 个视角中的若干个：正面 / 斜侧 / 侧面 / 俯视 / 仰视。

## 目录结构

```
.
├── index.html              # 单页画廊（零依赖，需 HTTP 预览）
├── app.js                  # 画廊交互与语言切换
├── skills/ai-pose-gallery/ # 可安装的 Agent Skill
├── llms.txt                # Agent 发现入口
├── robots.txt              # 搜索引擎抓取规则
├── sitemap.xml             # 站点地图
├── og-cover.jpg            # 1200×630 社交分享封面
├── data/
│   ├── pose.json           # 原始日文数据（1439 条，未改动）
│   ├── pose-zh.json        # 中文展示数据（en / ja 同结构）
│   ├── catalog.json        # 按需查找分类入口
│   ├── catalog/            # 30 个分类小目录
│   ├── ui.json             # 中英日界面文案
│   ├── asset-names.json    # 固定短名称映射
│   ├── pose-titles-en.json # 英文姿势标题
│   ├── meta.json           # 原始体系分类
│   ├── meta-zh.json        # 中文体系分类
│   └── translations.csv    # 日⇄中对照表（323 条，便于校对）
├── thumbs/                 # 缩略图 1439 张 JPG 300×400（22 MB）
├── img/                    # 原图 1439 张 PNG 900×1200（637 MB）
├── scripts/
│   ├── download.py         # 并发下载器（48 线程 / 断点续传 / 自动重试）
│   ├── i18n.py             # 日译中词典（唯一值去重后的 323 条译文）
│   ├── apply_translation.py# 回填译文，生成中文数据
│   ├── verify.py           # 校验文件完整性（存在性 / 大小 / 图片头）
│   └── build.sh            # 生成 Cloudflare Pages 发布目录 dist/
├── docs/                   # README 页面预览图
├── _headers                # Cloudflare Pages 缓存策略
├── LICENSE
└── README.md
```

## 数据结构

`data/pose-zh.json` 字段说明：

| 字段 | 原日文字段 | 示例 | 说明 |
| --- | --- | --- | --- |
| `id` | — | `solo_sit_lean-bk-kn-up_f` | 固定语义短 ID |
| `source_id` | — | `full_single_P001_front` | 原站 ID，用于溯源 |
| `体系` | `系統` | 全身单人・性感系 | 4 大类 |
| `姿势编号` | `ポーズ番号` | `P001` | 80 组编号 |
| `分类` | `分類` | 站姿 | 26 类动作 |
| `姿势名称` | `ポーズ名` | S形站姿・胯部侧顶 | 288 种描述 |
| `角度` | `アングル` | 正面 | 5 种视角 |
| `缩略图` | `サムネ` | `thumbs/…jpg` | 相对路径 |
| `原图` | `原寸` | `img/…png` | 相对路径 |
| `检索` | — | 拼接串 | 供前端模糊搜索 |

原始日文数据 `data/pose.json` 保持原样，用于对照和上游下载；本站日文展示使用带新路径的 `data/pose-ja.json`。

## 本地预览

画廊通过 `fetch` 读取 JSON，需要 HTTP 环境（直接双击 `index.html` 会被 CORS 拦截）：

```bash
python3 -m http.server 8000
# 打开 http://127.0.0.1:8000
```

页面支持体系/分类/视角组合筛选、关键词搜索、分组与逐张浏览、多角度缩略图、懒加载、灯箱原图下载、键盘与触屏导航。

## 脚本用法

```bash
# 重新拉取全部图片（已存在的文件自动跳过，可反复执行）
python3 scripts/download.py
WORKERS=64 python3 scripts/download.py   # 调整并发

# 修改 scripts/i18n.py 中的译文后，重新生成中文数据
python3 scripts/apply_translation.py

# 校验 2878 个文件是否完整
python3 scripts/verify.py
```

## 部署到 Cloudflare Pages

仓库为纯静态站点，无框架、无依赖。

**方式一：GitHub 自动部署（推荐）**

1. 登录 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 选择本仓库 → 生产分支 `main`
3. 构建设置照抄：

   | 字段 | 值 |
   | --- | --- |
   | Framework preset | `None` |
   | Build command | `bash scripts/build.sh` |
   | Build output directory | `dist` |

4. **Save and Deploy**，约 2–5 分钟得到 `https://<project>.pages.dev`
5. 之后每次 `git push` 自动重新发布

> ⚠️ **不要**把 Build output directory 直接填 `/`。仓库根目录含 `.git`（数百 MB），
> Cloudflare 会把它当静态资源扫描，pack 文件超过 25 MiB 单文件限制会导致构建失败。
> `scripts/build.sh` 只拷贝站点代码、数据、图片和 skill 等发布文件到 `dist/`，排除 Git 历史。
> 若确实想用根目录，仓库已附 `.assetsignore` 兜底排除非站点文件。

> 站点限制：单文件 ≤ 25 MiB、每次部署 ≤ 20,000 个文件。图片最大约 917 KB；具体发布体积及文件数可运行构建脚本查看。

**方式二：命令行直传**

```bash
bash scripts/build.sh
npx wrangler pages deploy dist --project-name ai-pose-gallery-zh
```

`_headers` 已为 `img/`、`thumbs/` 配置一年期强缓存，图片不会重复回源。

## 3D 白模摆姿工作台

图库页头提供“实验性 3D 模型（不完善）”总开关，默认关闭，并记住浏览器选择。开启后显示 3D 工作台入口、悬停预览及查看器 3D 模式；关闭后停止预览并恢复原图。各视角共用同一姿势骨架，只切换相机。现有模型仍是待校对草稿，手指、支撑接触和极端动作蒙皮尚不完善。直接访问工作台链接不受图库开关限制。

现在支持**照片转初始姿势**：选择本地照片，浏览器内识别最多六人并同步到场景，人物不足自动补齐。照片不上传服务器；识别模型首次按需下载。可以查看骨架、拖动修点、选择人物再同步；取消、失败和未检出人物时保留原场景，成功同步可整批撤销。手指、深度、遮挡和接触仍需人工调整。本模型对本项目线稿的抽测结果不理想，不能把它当成准确图库转换工具，详见 [实测与待办](TODO.md)。

人物默认使用 MakeHuman/MPFB 的成人男女真人比例网格，连续蒙皮随骨架变形，可选择象牙白或纯白材质；模型加载失败时显示简化人偶并提示。画布上方提供“移动人物（W）/ 旋转关节（E）”切换，可直接拖动坐标轴，向上拖动自动解除贴地。

访问 [3D 工作台](https://zhuzhe1983.github.io/ai-pose-gallery-zh/studio/)。支持中、英、日三语，WebGPU 优先；不支持时自动使用 WebGL 2，并在界面标明。

- 一到六个真人比例男女人偶（CC0 网格），象牙白与纯白两种材质；每个人物卡片可直接删除；支持 80%–120% 整体缩放，点击部位、角度滑块、数值输入、旋转环和位置控制。
- 24 个待校对的人工近似草稿，支持从图库打开；其他图库图片可作旁边的视觉参考。图库没有 3D 骨骼数据，预设不代表精确重建；接触点和穿插需要手动调整。
- 镜头快捷键、撤销/重做、本机自动保存、场景 JSON 导入导出。场景参数自动写入 URL，也可点击“分享场景链接”；链接优先于本机缓存恢复。
- 滑块、旋转环、API 与导入共用关节范围。校正了默认腰胯前后错位，使用连续曲面重新连接胸、腰、骨盆。
- [准确转换 TODO](TODO.md)与[全量状态表](data/pose-3d-status.json)覆盖 288 组姿势，现有 24 个草稿同样待审核，准确还原通过数为 0。
- 1600 × 1600 PNG 截图，自动隐藏操作环、网格、选中高亮及参考卡片；agent 接口可指定其他尺寸。
- [Agent 操作说明](skills/ai-pose-gallery/references/studio.md)包含页面 API 和可执行的截图脚本，用于生成后续 AIGC 的姿势参考。

工作台使用 [Mannequin.js](https://github.com/boytchev/mannequin.js) 的骨骼系统，不沿用原来的操控界面；人物外观由本项目重新制作，并非 SHF 官方模型。`studio/` 独立采用 **GPL-3.0-only**，保留上游许可和完整可编辑源码；Three.js 采用 MIT；MediaPipe 运行时和姿势模型采用 Apache-2.0。详见 [第三方来源与修改说明](studio/THIRD_PARTY.md)。原图库代码和图片的许可范围保持原状。

浏览器依赖已固定版本并随站点托管，无外部 CDN 依赖。重新生成依赖：`npm ci --ignore-scripts && npm run vendor:studio && npm run vendor:pose`。检查站点：`npm run verify`；构建发布目录：`npm run build`。

## 内容提示

图库包含成人向姿势参考（部分分类名称涉及性行为术语），仅供艺术创作、动作参考与前端技术学习使用。请勿用于违法用途。未成年人请勿访问。

## 版权与致谢

- **图片与原始数据的著作权归原作者ギア所有**，来源地址见页首
- 本仓库仅为个人学习、汉化与静态站点实践存档，**不对图片主张任何权利**，也不构成对原作品的商业使用授权
- 若原作者认为本仓库侵犯其权益，请通过 Issue 联系，将立即删除相关内容
- `scripts/` 与 `index.html` 的代码以 MIT 协议开源（见 [LICENSE](LICENSE)），该协议**不覆盖** `img/`、`thumbs/` 与 `data/` 中的图片和原始数据

## 本轮 3D 校对与离线线稿工具

照片由浏览器本机识别；固定图库线稿由维护者离线处理，已经移除“识别当前参考图”。
[离线工具](scripts/offline-pose/README.md) 可将复核后的 2D 点拟合为工作台 JSON 草稿并渲染对照，
当前仅试跑 Sketch2Pose 的 2D 前段，不是完整 Sketch2Pose 或全量准确重建。

人偶使用双四元数蒙皮与锁骨辅助旋转，缓解极端姿势的体积塌陷；已修正头顶比心和举臂伸展预设。
其余预设仍需逐图修正，不能把 24 个草稿当成准确转换。参见 [渲染对照报告](docs/preset-review.md)。

可选浏览器回归检查（先启动本地 8767 静态服务，并安装 Playwright）：

```sh
node scripts/verify-human-render.mjs
node scripts/verify-human-render.mjs --webgpu
```

检查六人、缩放、体积保持、拾取、贴地、旧场景迁移、比心手部高度及截图；浏览器在检查后自动关闭。

### 分段脊柱与共享预览

工作台支持骨盆、腰、胸独立控制，腰带动下两段脊柱；可固定双脚和胸部朝向进行受限 IK 补偿。牵引模式可直接拖手腕、肘、脚踝或膝，让相邻关节联动，左右同步可选。旧版场景和 URL 自动迁移。图库列表悬停才加载共享 3D 预览器，大图弹层可切换图片/3D；“新增到 3D 工作台”保留已有场景并加入新人物，最多六人。未转换的图明确显示待转换，现有 3D 草稿仍需校对。

本机转换结果可运行 `python3 scripts/offline-pose/preview_server.py` 后查看 [本地预览](http://127.0.0.1:8767/preview/)。这是读取本地输出的进度页，GitHub Pages 不执行本地转换。[动画功能规划](TODO.md) 已登记，尚未实现。
