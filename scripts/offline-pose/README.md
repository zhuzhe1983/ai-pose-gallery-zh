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
python3 scripts/offline-pose/preview_server.py
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

- 导出实际骨架的父子关系、固定变换、关节范围和角度约定；46 个可记录控制量（骨盆、腰、胸、颈、头独立；腰驱动两段脊柱；包含手腕）。
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

## 实时预览

服务启动后访问 **http://127.0.0.1:8767/preview/**，每三秒读取实际本地结果。可查看原图、2D 叠图、3D 渲染、失败/待审核状态，并把场景送入工作台继续调整。服务保持空闲时会如实显示；不会因为已有输出就声称后台正在转换。详见 [预览协议](../../preview/README.md)。模型变更后必须重新导出 rig；旧 `makehuman-v2` 草稿在预览中标为旧版本。

## 多视角对照与朝向

查看同一场景的其他视角（相机未标定，不能冒充多视角拟合）：

```sh
node scripts/offline-pose/render-views.mjs --scene output/offline-pose/ready/solo_kneel_hands-thighs_f.scene.json \
  --output-dir output/model-research/compare --views f,s
# 侧面原图可能面向相反方向，可加 --side opposite 并记录实际相机。
```

单帧 18 点不能识别头脸、手掌和脚底法线，默认锁定无证据的头、手腕角度；脚尖可用时脚踝屈伸只作近似。根节点固定以免与骨盆重复旋转。可按 [朝向提示协议](ORIENTATION.md) 标注人工参考，但这不等于自动识别或审核通过。脚掌/膝盖贴地和手掌接触仍须人工对照。

## 同组多视角拟合实验

`fit_multiview.py` 接受同一个姿势的两至五张 `pose-keypoints/1`，共用一套人物关节，并为每个视角求各自的有限范围相机。侧面默认尝试两侧；必须先人工检查关键点遮挡及左右身份，错误点用 `--exclude s:...` 排除。可指定已核对的人工朝向 `--orientations`；缺少脸部、掌面与脚底证据时继续报告未确定。若可用点不足，工具会拒绝该视角；单张图的深度和被遮挡的手脚不能凭空补出。

```sh
output/offline-pose/venv/bin/python scripts/offline-pose/fit_multiview.py \
  --rig output/offline-pose/rig-v3.json \
  --inputs output/sketch-pose-offline/solo_kneel_hands-thighs_f.json \
           output/sketch-pose-offline/solo_kneel_hands-thighs_s.json \
  --output-dir output/model-research/multiview-experiment/kneel
```

每个视角写单独 camera 的场景 JSON，人物姿势相同。报告列明侧面相机候选、重投影误差、观察不到的末端方向和质量门；该门只拒绝明显不可靠的数值结果，**通过也不等于准确还原**。真实跪姿侧视的多数左右重叠点先前已标记需要排除，盲目使用原始点只供算法实验，不能作为审核结果。

## 全量队列与表面接触修正

见 [BATCH.md](BATCH.md)：支持按姿势分组、断点续跑、实时心跳、逐视角原图/渲染对照，以及实际蒙皮的地面检查。脚尖改为真实网格端点；“双手扶腿”共用一套经过掌面与膝/小腿/脚部接触修正的姿势。没有接触证据的其他姿势仍明确标记未解决。双人图的模型能力限制、上半身图不可见下肢、原始关键点与人工标注均分别记录。
