## Context

Koma 当前主方向已经从“线性制作器”转向“分镜创作工作台”，但这轮实现比 `storyboard-centric-workflow` 所记录的内容更进一步：

- 主视图不再依赖 `ShotListEditor` 风格的密集卡片，而是切换为 `ShotNavigator + CurrentShotStage + CurrentShotInspector` 的三栏布局。
- 右侧工具面板不再只是单次弹窗，而是带有 session 状态的工作流容器，支持剧本、推理、风格、导出各自的临时草稿和步骤进度。
- 导出中心已经开始接入真实的 `StoryboardExportService`，能从分镜直接构建视频、剪映草稿和图片序列。

竞品资料与模板资源对产品方向提供了更具体的约束：

### 竞品流程信号

`template/docs/cards/ad2cf129-b7c9-4fd5-977f-d619205fb06c.json` 展示了典型主路径：

1. 创建作品并导入文案
2. 在作品主页面完成故事/章节推理
3. 批量执行章节提示词推理
4. 设置全局风格继承
5. 批量生成图片/视频
6. 直接导出或去剪映继续编辑

这说明产品的核心并不是多个独立页面，而是一个能持续承接这些动作的分镜主页面。

### 分镜主页面信号

`template/docs/cards/核心功能/创作空间/作品主页面/分镜界面/分镜图片.json` 与 `处理后提示词.json` 显示：

- 图片/视频区域必须足够大，成为创作主舞台。
- 提示词编辑器是核心编辑区之一，需要足够的高度与模式切换能力。
- 章节推理优先于单分镜推理，主流程强调批量生成和批量重试。
- 导出要围绕选中图片、分镜顺序和模板化设置展开。

### 模板资源信号

`template/resources/official_prompt_templates` 中的模板类别显示，创作流程可拆为以下阶段：

- 剧本输入与转换：`preset_script_conversion.json`、`preset_script_dialogue.json`、`preset_script_narration.json`
- 文案精炼：`preset_content_condensation.json`、`preset_content_expansion.json`、`preset_content_polish.json`
- 章节处理：`preset_chapter_division.json`、`preset_chapter_batch_infer.json`、`preset_chapter_batch_rewrite.json`
- 单项提取与推理：`preset_extract.json`、`preset_match.json`、`preset_infer.json`
- 辅助能力：`preset_reference.json`、`preset_video_interrogate.json`、`preset_viral_opening.json`
- 导出与工作流模板：`export_templates.json`、`workflow_templates.json`

这意味着我们需要一个“按阶段/任务/级别组织模板”的产品结构，而不是让用户在一个大列表里自己猜模板用途。

## Goals / Non-Goals

**Goals**

- 把分镜工作台正式定义为项目主界面，强化大画面舞台和大提示词编辑区。
- 将剧本导入、章节推理、风格应用、导出统一为右侧引导式工作流。
- 让工作流的每一步都以“写回或增强分镜数据”为终点，而不是停留在临时结果页。
- 让剪辑编辑器变成可选高级能力，默认导出链路直接面向分镜。
- 把竞品中的官方模板资产沉淀为 Koma 的创作操作器与默认导出预设。

**Non-Goals**

- 不移除现有时间线编辑器和高级导出能力。
- 不在这一轮重写底层 Shot / Episode / Project 数据结构。
- 不在这一轮实现多用户协作与云同步。
- 不在这一轮把整个 `template/` 目录逐字搬入产品文案；重点是提炼功能结构和数据资产。

## Decisions

### Decision 1: 使用三栏分镜工作台替代线性主内容

**选择**

项目主内容采用三栏布局：

- 左侧 `ShotNavigator` 负责分镜定位、多选和概览
- 中间 `CurrentShotStage` 负责大图/视频舞台与候选素材切换
- 右侧 `CurrentShotInspector` 负责提示词、文案和镜头参数编辑

**理由**

- 竞品的核心体验是“主页面即创作页面”，而不是进入后还要继续选步骤。
- 用户当前最重要的操作就是查看分镜结果、修改提示词、重新生成，因此画面与提示词必须获得最大空间。
- 当前实现已经具备稳定的三栏结构，OpenSpec 需要正式确认这一方向。

### Decision 2: 右侧 Drawer 是“引导式工作流侧车”，不是单纯工具箱

**选择**

右侧面板沿用 Drawer，但每个面板都必须带有 session state、步骤进度、草稿摘要、作用范围和最近一次应用记录。

**理由**

- 用户要求从剧本导入、解析、分镜推理开始，引导用户一步一步地生成数据，最后落回分镜。
- 竞品虽然操作多，但主路径高度连续；session state 是保持连续性的关键。
- 当前 `workflowSessions.ts` 已经为 script / inference / style / export 建立了统一状态结构，适合正式规格化。

**结果**

- `ScriptStudioPanel` 负责“导入 -> 精炼 -> 章节划分 -> 拆分分镜 -> 应用”
- `ChapterInferencePanel` 负责“生成草稿 -> 预览 -> 应用”，支持当前分镜、选中分镜、当前章节、全部分镜
- `StyleSettingsPanel` 负责“风格选择 -> 影响评估 -> 准备重新推理”
- `ExportCenterPanel` 负责“导出方式选择 -> 参数/模板 -> 执行/历史”

### Decision 3: 工作流输出必须直接增强分镜，而不是生成平行数据结构

**选择**

所有工作流步骤的最终落点都是分镜：

- 剧本面板写入 Shot 列表
- 推理面板写入图片/视频提示词与改写文案
- 风格面板生成针对分镜的重推理计划
- 导出面板从当前分镜清单直接构建输出

**理由**

- 用户明确要求“一切都是为了生成分镜、增强分镜能力”。
- 这能避免临时数据散落在多个页面，降低认知负担。
- 这和竞品文档中“作品主页面承接全部批量动作”的结构一致。

### Decision 4: 模板体系采用“创作操作器”抽象承接官方 Prompt 资产

**选择**

引入 `CreativeOperatorDefinition` 作为模板元数据层，按 `phase + task + level` 组织官方模板，不直接把原始模板文件暴露为无结构清单。

**理由**

- `template/resources/official_prompt_templates` 的信息量很大，但用户真正需要的是“在这个阶段该用哪类模板、强度是什么”。
- 当前代码已经新增 `CreativeOperatorPhase / Task / Level` 和查询函数，适合作为产品级抽象。

**直接影响**

- Script 面板可根据阶段呈现基础/进阶/工作室级转换与精炼能力
- 推理面板可根据阶段呈现不同等级的章节提示词推理
- 后续可继续吸纳 `workflow_templates.json` 和 `export_templates.json` 作为更高层预设资产

### Decision 5: 导出链路以 Storyboard Manifest 为统一中间层

**选择**

新增 `StoryboardExportService` 作为分镜导出的统一入口，核心流程为：

1. 读取 Episode Shot 列表
2. 构建 `StoryboardManifest`
3. 将 Manifest 编译为标准轨道 `buildStoryboardTracks`
4. 分别导向快速视频、剪映草稿、图片序列

**理由**

- 用户要求剪辑是可选过程，因此导出不能再强依赖时间线编辑器。
- Manifest 层可以让导出、模板应用、后续范围选择都围绕同一数据结构演进。
- 当前实现已经具备这一基础，只需要在规格上把它固定下来。

### Decision 6: 编辑器保留为可选高级路径

**选择**

导出中心与工作台工具栏默认提供分镜直出；时间线编辑器仅作为“高级编辑器”入口保留。

**理由**

- 用户明确要求本地剪辑与直接导出并存，但默认不应该强制进入剪辑。
- 竞品主流程也是先完成分镜和批量生成，再决定是否进入进一步编辑。

## Risks / Trade-offs

### 风险 1: 工作流状态目前仍然是内存态

当前 `workflowSessions` 由 `StoryboardWorkspace` 维护，切换面板和切换同一会话中的步骤没有问题，但尚未持久化到项目或剧集级存储。应用重启后，用户的导出模板、脚本草稿和重推理计划会丢失。

**缓解**

- 在本变更中把“按剧集持久化 workflow session”列为后续任务。

### 风险 2: 直出链路已有骨架，但音频/超分辨率仍为降级实现

当前快速视频导出和剪映导出已经打通，但独立音频混合、超分辨率导出仍以 warning 降级。

**缓解**

- 在任务中继续拆出“真实音轨合成”“超分辨率执行”“范围选择”等收尾项。

### 风险 3: 模板资产还没有完全产品化

当前我们已经抽象了操作器元数据，但还没有把 `template/resources/official_prompt_templates` 中的模型信息、输出边界、导出模板和工作流模板整体吸纳成可视化资产。

**缓解**

- 保持操作器层稳定，并在下一阶段补齐模板导入和预设管理。

## Open Questions

1. Workflow session 应该仅按 Episode 持久化，还是按 Project + Episode + Panel 分层持久化？
2. 导出中心中的模板资产应优先复用竞品导出模板结构，还是采用 Koma 自有更简化的配置格式？
3. 工作流模板是否要做成可弹出的“recipes”，还是继续内嵌在现有面板中逐步开放？
