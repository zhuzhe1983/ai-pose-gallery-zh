# 线稿姿态识别：当前结论与候选方案

核对日期：2026-10-29。**本次没有替换线上识别模型，也没有宣称线稿转换已完成。**

工作台当前使用 MediaPipe Pose Landmarker Full v1，先检测人物，再估计关键点。
此前在本图库抽测的站姿、举手、坐姿、跪姿、卧姿五张线稿均没有得到可用人物。
这表明当前流程不适合这些样本；尚未对内部检测/关键点阶段分别测量，不能把所有失败
都归因于某一个阶段。降低阈值可能增加误检，换显示用 3D 网格不会改善 2D 检测。

| 方案 | 已核实能力 | 本项目限制 |
| --- | --- | --- |
| [Sketch2Pose](https://github.com/kbrodt/sketch2pose)（2022） | 从位图人体草图估计 3D 姿态，结合骨骼方向、透视缩短和自接触约束；有代码 | Python/PyTorch 优化流程，依赖另行取得的 SMPL-X；未验证浏览器移植和资产再分发许可 |
| [Sketch2PoseNet](https://wangli000.github.io/Sketch2PoseNet-Page/)（2025） | 论文针对多种草图风格直接预测 3D 人体姿态与形状 | [作者代码仓库](https://github.com/wangli000/Sketch2PoseNet)当前只有 README/LICENSE，README 为 `Coming Soon`，没有可直接接入的权重或推理实现 |
| [bizarre-pose-estimator](https://github.com/ShuhongChen/bizarre-pose-estimator)（WACV 2022） | 插画域训练的 2D 人体关键点估计，公开代码和模型 | 作者明确只针对单个完整人物；插画训练不等于已验证本图库黑白线稿。多人需另行分离 |
| [ComfyUI-AnimePose](https://github.com/dalai2/ComfyUI-AnimePose) | 上述研究的 ComfyUI 封装，提供置信度筛选；约 271 MB 首次权重 | Python/ComfyUI，不是浏览器组件；README 记录域外风格效果下降，单人限制；AGPL-3.0 |
| [DWPose ONNX](https://github.com/IDEA-Research/DWPose/tree/onnx) / [RTMPose](https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose) | 成熟的通用关键点估计与 ONNX 部署路径 | 不是专用线稿识别模型；人物检测失败时后续估计可能根本不会执行，需比较裁切/手选人物区域 |

## 建议实验顺序

1. 建立带人工关键点标注的代表性小基准集；区分单人、多人物、遮挡和局部图。
2. 比较通用模型的全图检测、人工框选后关键点估计，以及插画专用模型。
   分开记录人物检出率、可见关节误差、左右颠倒、耗时和模型大小。
3. 只有图库实测明显更好的模型才评估 ONNX 导出、WebGPU 算子支持、WASM 回退和许可证。
   [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)支持浏览器 GPU 推理，
   但这不能证明上述完整 Python 流程已可移植。
4. 2D 检测通过后，再处理深度歧义、相机视角、受限 IK 和接触；必须保留人工校正。
   单张线稿通常不能唯一确定遮挡部位和前后深度。

ControlNet Lineart / Anime2Sketch 用于线条条件或线稿提取，并不直接输出人物关节，
不能当作姿态识别模型接入现有骨架同步接口。
