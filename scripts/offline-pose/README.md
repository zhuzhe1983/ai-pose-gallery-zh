# Offline gallery fitting

图库线稿在维护者电脑离线处理；用户上传的照片仍在浏览器里由 MediaPipe 识别。
这个目录是原创的**受限骨架拟合原型**，不是完整 Sketch2Pose，也不包含其实现、模型权重、
SMPL-X 或 SPIN。不要把生成 JSON 或较低的二维重投影误差当成三维准确性验收。

## 运行

先按 [离线 2D 工具](../../experiments/sketch-pose-offline/README.md) 取得并目测复核
`pose-keypoints/1` JSON。模型和调用适配器由本机另行提供，不打包到网站。
安装 Python 依赖，并在另一终端从仓库根目录启动静态服务：

```sh
python3 -m venv output/offline-pose/venv
output/offline-pose/venv/bin/python -m pip install -r scripts/offline-pose/requirements.txt
python3 -m http.server 8767
```

以下 Node 脚本需要环境已安装 Playwright 及 Chromium；可用 `POSE_PLAYWRIGHT_MODULE`
指定其 `index.mjs` 绝对路径。所有脚本都无头运行，并在 `finally` 关闭自建浏览器。

```sh
# 从正在运行的真实编辑器导出骨架，切勿复用其他网格版本的 rig.json。
node scripts/offline-pose/export-rig.mjs --sex female --output output/offline-pose/rig.json

# example.json 必须是单张、单个人物的 18 点记录。排除遮挡/错误点可加 --exclude 点名…
output/offline-pose/venv/bin/python scripts/offline-pose/fit_pose.py \
  --rig output/offline-pose/rig.json --input output/example.json \
  --output-dir output/offline-pose/drafts --starts 3 --max-evaluations 160

# 用实际蒙皮包围盒贴地，同时平移相机以保持原投影。
node scripts/offline-pose/prepare-scene.mjs \
  --input output/offline-pose/drafts/solo_stand_arms-up-stretch_f.scene.json \
  --output output/offline-pose/ready/solo_stand_arms-up-stretch_f.scene.json

# 渲染对应分辨率，并与原图逐视角对照。
node skills/ai-pose-gallery/scripts/render_studio.mjs \
  --scene output/offline-pose/ready/solo_stand_arms-up-stretch_f.scene.json \
  --output output/offline-pose/review.png --width 900 --height 1200 \
  --url http://127.0.0.1:8767/studio/
```

三个浏览器脚本均可用 `--url` 指定本地工作台。`prepare-scene` 输出的场景可通过工作台
“加载场景”导入，继续调整、保存和分享。拟合报告里的世界坐标是贴地前的坐标；贴地只
对人物和相机施加相同的竖直平移，二维投影不变。报告本身不需要因贴地重新拟合。

## 方法和限制

- 导出实际骨架的父子关系、固定变换、关节范围和角度约定；31 个可记录控制量。
- 使用透视相机和 SciPy 有界最小二乘，联合拟合关节与镜头。相机视角和现有手工预设
  作为软约束，降低单视图拟合造成的异常转身；没有预设时从中立姿势开始。
- 输入是未经概率校准的热图峰值。低峰值、出界点和显式排除点不参与；少于 8 个可用点
  或缺少足够肩髋点时拒绝输出。这个规则不能代替人物检测或人工审核。
- 头、脊柱、脚尖为近似标记，固定骨长不能完全匹配图库里的夸张比例。手指、手掌接触、
  遮挡顺序、关节轴向旋转、多人接触、碰撞和多视角联合解算仍未解决。
- `.fit.json` 始终标记 `draft-needs-review`，记录所用点、角度、相机和误差。
  `.scene.json` 是工作台场景协议，协议本身没有准确性保证。务必保留同名报告。
- **不自动写入 `data/`，不自动发布，不替换任何线上预设。** 经原图/渲染对照和人工修正后，
  才能把轻量场景作为静态资源发布；模型权重和用户照片不随场景发布。

## 本轮验证

真实 2D 前段已在 10 张图库图及空白负对照运行。原始数据、叠图和复核提示仅保存在
忽略目录 `output/sketch-pose-offline/`。站立、举手和正面跪姿三个样本进一步生成了
可导入工作台的 3D 草稿，均未通过准确重建验收。

```sh
output/offline-pose/venv/bin/python scripts/offline-pose/verify_fit.py \
  --rig output/offline-pose/rig.json --blank output/sketch-pose-offline/blank-control.json
```

检查中立骨架与导出坐标一致、受限拟合能降低已知合成投影误差、所有角度在范围内，
以及空白/非有限/重复点/错误坐标协议被拒绝。合成检查只验证实现，不是识别精度测试。
另在真实浏览器中核对拟合姿态的关节坐标与 Three.js 投影一致，导入和 PNG 导出可用。
