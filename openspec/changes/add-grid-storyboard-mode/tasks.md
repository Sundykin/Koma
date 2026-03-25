## 1. 数据模型
- [x] 1.1 Shot 接口增加 `imageMode: 'normal' | 'grid'` 字段（默认 `'normal'`）
- [x] 1.2 ShotMediaState 增加 `gridImage?: StoredMediaAsset` 字段（存储九宫格原图）

## 2. 提示词模板
- [x] 2.1 新增 `grid_shot_prompt_generation` LLM 模板（将单个分镜扩展为 9 个连续画面的提示词）
- [x] 2.2 新增 `tti_grid_shot_image` TTI 模板（九宫格图片生成提示词）
- [x] 2.3 在 `PromptTemplateType` 联合类型中注册新模板 ID
- [x] 2.4 在 `DEFAULT_TEMPLATES` 中添加新模板的默认内容和变量声明

## 3. 九宫格提示词生成服务
- [x] 3.1 `ShotPromptService` 新增 `generateGridShotPrompt()` 方法：接收单个 Shot + 项目资产，调用 `grid_shot_prompt_generation` 模板，将 Shot 的 scriptContent 扩展为 9 条连续画面提示词
- [x] 3.2 解析 LLM 输出的 "镜头01~镜头09" 格式，整体写回该 Shot 的 `imagePrompt`
- [x] 3.3 `batchGenerateShotPrompts()` 增加 imageMode 判断：grid 模式时调用 `generateGridShotPrompt()`

## 4. 九宫格图片生成 Workflow
- [x] 4.1 新增 `gridShotImageWorkflow()` 函数：读取 Shot 的 imagePrompt（含 9 条镜头描述），使用 `tti_grid_shot_image` 模板组装为九宫格 TTI 提示词，调用 TTI 生成
- [x] 4.2 九宫格图片存储到该 Shot 的 `media.gridImage`
- [x] 4.3 确保九宫格图片中每格画面比例与整体图片比例一致

## 5. Workflow 入口集成
- [x] 5.1 `shotImageWorkflow` 增加 imageMode 分支：grid 模式调用 `gridShotImageWorkflow`，normal 模式走原流程
- [x] 5.2 确保九宫格图片可作为 ITV 参考图，衔接 `shotRenderWorkflow`

## 6. UI 模式切换
- [x] 6.1 分镜工具栏新增「普通模式 / 九宫格模式」切换按钮
- [x] 6.2 支持批量切换所有 Shot 的 imageMode，也支持单个 Shot 独立切换
- [x] 6.3 九宫格模式下 ShotCard 显示九宫格预览图（如果已生成）

## 7. 验证
- [x] 7.1 验证 normal 模式行为无变化
- [x] 7.2 验证 grid 模式完整链路：LLM 扩展分镜为 9 画面 → TTI 生成九宫格图 → ITV 视频生成
- [x] 7.3 验证模式切换不丢失已生成的媒体资产
