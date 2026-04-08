## Why

`storyboard-centric-workflow` 已经完成了第一轮从线性流程向分镜中心迁移，但最新一轮实现已经不只是“把步骤挪进右侧面板”，而是把项目主工作区进一步收敛成 `navigator + stage + inspector + workflow drawer` 的工作台形态。当前代码已经开始落地这套工作台、引导式剧本/推理/风格/导出流程和分镜直出链路，但 `storyboard-studio-workbench` 目录仍然没有 proposal / design / tasks / specs，导致 OpenSpec 无法继续 apply，也无法准确表达当前实现和下一阶段计划。

`template/` 中的竞品资料进一步说明了这轮改造的方向必须更彻底：

- `template/docs/cards/*作品流程*.json` 与作品主页面文档表明，主路径并不是“资产页 → 分镜页 → 剪辑页”，而是“导入文案/字幕 → 推理故事和章节 → 批量提示词 → 批量生成 → 导出/剪映查看”，所有动作都围绕分镜主页面展开。
- `template/docs/cards/核心功能/创作空间/作品主页面/分镜界面/*.json` 说明竞品把大图预览、提示词编辑、文案编辑、批量操作、章节推理和导出都放在分镜工作台里。
- `template/resources/official_prompt_templates/*.json` 提供了 20+ 类官方模板，覆盖剧本转换、内容精炼、章节划分、章节批量推理、批量改写、导出等任务，说明产品能力需要按“任务阶段 + 模板级别”组织，而不是只暴露几个零散 Prompt。
- `template/resources/official_prompt_templates/export_templates.json` 和 `workflow_templates.json` 说明导出与工作流都需要模板资产化，支持复用、批处理和默认预设。

因此需要补齐一个新的 OpenSpec 变更，用于正式定义“分镜工作台 + 引导式创作 + 分镜直出链路”的产品要求，并把当前已实现内容与后续待完成项沉淀为可执行任务。

## What Changes

- 新增 **Storyboard Studio Workbench** 能力，把项目主界面正式定义为三栏分镜工作台：左侧分镜导航，中间大画布/视频舞台，右侧提示词与文案检视器。
- 新增 **Workflow Guided Creation** 能力，将剧本导入、精炼、章节划分、分镜推理、风格影响评估、导出配置改为右侧抽屉中的分步工作流，并支持会话状态保留与跨面板衔接。
- 新增 **Storyboard Export Pipeline** 能力，定义快速视频导出、剪映草稿导出、图片序列导出都直接从分镜数据生成，剪辑编辑器退为可选高级路径。
- 修改 **ui-layout**，将分镜主工作区升级为更强调画面舞台和大提示词编辑区的布局，不再以线性步骤或密集表格为主。
- 修改 **prompt-templates**，将官方模板能力收敛为“创作操作器”维度，支持按阶段、任务和级别选择模板。
- 修改 **script-processing**，将剧本处理正式定义为工作台中的渐进式导入流程，而非独立页面。
- 修改 **visual-style-management**，让风格面板直接输出“影响评估 + 重新推理计划”，并与分镜推理联动。
- 修改 **export**，增加分镜工作台内的快速导出、模板资产和导出历史。

## Capabilities

### New Capabilities

- `storyboard-studio-workbench`
- `workflow-guided-creation`
- `storyboard-export-pipeline`

### Modified Capabilities

- `ui-layout`
- `prompt-templates`
- `script-processing`
- `visual-style-management`
- `export`

## Impact

- `frontend/src/components/storyboard/Storyboard.tsx`
- `frontend/src/components/storyboard/StoryboardStudio.tsx`
- `frontend/src/components/storyboard/StoryboardWorkspace.tsx`
- `frontend/src/components/storyboard/ShotNavigator.tsx`
- `frontend/src/components/storyboard/CurrentShotStage.tsx`
- `frontend/src/components/storyboard/CurrentShotInspector.tsx`
- `frontend/src/components/storyboard/panels/*`
- `frontend/src/services/StoryboardExportService.ts`
- `frontend/src/store/promptTemplates.ts`
- `frontend/src/components/editor/EditorView.tsx`
- `frontend/src/App.tsx`
- `openspec/specs/ui-layout/spec.md`
- `openspec/specs/prompt-templates/spec.md`
- `openspec/specs/script-processing/spec.md`
- `openspec/specs/visual-style-management/spec.md`
- `openspec/specs/export/spec.md`
