## 1. Storyboard Studio 主工作台

- [x] 1.1 使用 `ShotNavigator + CurrentShotStage + CurrentShotInspector` 替代分镜主视图中的密集列表编辑模式
- [x] 1.2 在主工作台中维护 `activeShotId`、`selectedShotIds`，并将上下文同步给右侧工作流面板
- [x] 1.3 在空分镜状态下提供“从剧本工作流开始”的入口，引导用户进入右侧侧车流程
- [x] 1.4 将当前分镜、面板选择和 workflow session 持久化到剧集级状态，支持重新打开项目后恢复工作区上下文

## 2. 引导式工作流侧车

- [x] 2.1 建立 `workflowSessions.ts` 统一管理 script / inference / style / export 会话状态
- [x] 2.2 改造 `ToolPanelDrawer`，在面板切换时保留已输入草稿、步骤进度和最近应用摘要
- [x] 2.3 实现 `ScriptStudioPanel` 的渐进式导入流程：导入 -> 精炼 -> 章节划分 -> 拆分分镜 -> 应用
- [x] 2.4 实现 `ChapterInferencePanel` 的“生成草稿 -> 预览 -> 应用”流程，并支持当前分镜/选中分镜/当前章节/全部分镜范围
- [x] 2.5 实现 `StyleSettingsPanel` 的风格影响评估与重新推理交接
- [ ] 2.6 将资产面板和 AI 助手面板也接入统一 session 描述、作用范围和最近应用记录
- [ ] 2.7 基于 `template/resources/official_prompt_templates/workflow_templates.json` 设计并接入“工作流预设/recipes”入口

## 3. 模板与创作操作器

- [x] 3.1 在 `promptTemplates.ts` 中引入 `CreativeOperatorPhase / Task / Level / Definition`
- [x] 3.2 为剧本导入、内容精炼、章节划分、章节推理、批量改写建立可查询的操作器元数据
- [x] 3.3 为操作器查询与 session 默认值补充基础测试
- [ ] 3.4 将 `template/resources/official_prompt_templates/*.json` 的官方模板内容和模型元数据结构化导入为默认资产，而不是只保留轻量映射
- [x] 3.5 将 `template/resources/official_prompt_templates/export_templates.json` 转换为导出中心的默认导出模板资产

## 4. 分镜直出链路

- [x] 4.1 新建 `StoryboardExportService`，提供 `buildShotManifest`、`buildStoryboardTracks` 和三类导出执行入口
- [x] 4.2 将导出中心接入真实的快速视频导出、剪映草稿导出和图片序列导出
- [x] 4.3 在导出中心中保留导出模板与导出历史的会话态
- [x] 4.4 提供“高级编辑器”入口，将时间线编辑器降为可选后续流程
- [x] 4.5 补齐导出范围选择（当前分镜 / 选中分镜 / 当前章节 / 全部）和静帧时长等高级参数
- [ ] 4.6 接入真实的独立音频拼装、字幕对齐和图片超分辨率执行链路
- [x] 4.7 为 `StoryboardExportService` 的 manifest / track 构建逻辑补充单元测试

## 5. 验证与同步

- [x] 5.1 运行 `npm run build`，确认当前工作台和导出链路可编译
- [x] 5.2 运行现有 workflow session / creative operator 测试
- [x] 5.3 重建 `storyboard-studio-workbench` 的 proposal / design / tasks / spec deltas
- [ ] 5.4 在剩余收尾项完成后，执行 spec sync / archive，把本变更同步回主 specs
