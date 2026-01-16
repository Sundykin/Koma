# ComfyUI 深度对接

## Summary
实现 ComfyUI 工作流 JSON 的深度对接，支持工作流导入、节点映射、参数绑定、任务执行与进度监控。使用户可以利用本地或远程 ComfyUI 服务进行高度定制化的 AI 图像/视频生成。

## Motivation
Phase 1 中 ComfyUI Provider 仅为占位实现。DOC.md 要求「ComfyUI 映射：通过上传 JSON 自动映射输入节点」，是实现「全模型适配」的关键环节。ComfyUI 生态丰富，支持 AnimateDiff、IP-Adapter、ControlNet 等高级功能，深度对接能释放其全部潜力。

## Approach

### 1. 工作流 JSON 解析与映射
- 解析 ComfyUI 导出的 workflow JSON
- 自动识别可映射的输入节点（KSampler、LoadImage、CLIPTextEncode 等）
- 生成节点映射配置（输入参数 → 节点 ID + 输入名）
- 支持手动调整映射关系

### 2. 参数绑定系统
- 图片输入：分镜图片 → LoadImage 节点
- 正向提示词：TTI Prompt → CLIPTextEncode (positive)
- 负向提示词：配置的 negative prompt → CLIPTextEncode (negative)
- 随机种子：seed → KSampler.seed
- 其他参数：steps、cfg、denoise 等

### 3. 服务连接与任务执行
- 本地/远程 ComfyUI 服务发现
- WebSocket 连接建立
- 任务提交与队列管理
- 实时进度监听
- 结果文件下载

### 4. 预设管理
- 工作流预设保存/加载
- 预设分类（TTI、ITV、Upscale 等）
- 预设共享导入/导出

## Specs
- `specs/comfyui/spec.md` - ComfyUI 对接详细规范

## Tasks
见 `tasks.md`

## Dependencies
- Phase 1: add-antd-timeline-editor（基础架构、Provider 接口）
