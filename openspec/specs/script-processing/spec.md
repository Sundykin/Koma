# script-processing Specification

## Purpose
TBD - created by archiving change add-antd-timeline-editor. Update Purpose after archive.
## Requirements
### Requirement: Script Input
系统 SHALL 支持剧本文本输入和管理。

#### Scenario: 输入剧本
- **WHEN** 用户在剧本工作室输入文本或粘贴剧本
- **THEN** 系统保存剧本内容到项目
- **AND** 支持分章节/分幕结构化输入
- **AND** 支持 Markdown 格式

#### Scenario: 导入剧本文件
- **WHEN** 用户导入 .txt / .md / .fountain 剧本文件
- **THEN** 系统解析文件内容
- **AND** 自动识别角色、场景、对话结构

### Requirement: Idea to Script (LLM)
系统 SHALL 支持从创意点自动生成剧本。

#### Scenario: 生成剧本
- **WHEN** 用户输入简短的创意描述（Idea）
- **THEN** 系统调用 LLM 生成完整剧本
- **AND** 包含场景描述、角色对话、舞台指示
- **AND** 遵循用户选择的风格（搞笑/悬疑/治愈等）

#### Scenario: 润色剧本
- **WHEN** 用户选择已有剧本并触发「AI 润色」
- **THEN** 系统调用 LLM 优化剧本质量
- **AND** 保留原剧本作为历史版本

### Requirement: Script to Shot List (核心)
系统 SHALL 自动将剧本拆解为分镜列表。

#### Scenario: 自动分镜拆解
- **WHEN** 用户触发「生成分镜」操作
- **THEN** 系统调用 LLM 分析剧本结构
- **AND** 输出 Shot List（分镜列表）JSON
- **AND** 每个 Shot 包含：
  - shotId: 唯一标识
  - sceneIndex: 所属场景序号
  - content: 画面描述（用于 TTI prompt）
  - dialogue: 台词文本（用于 TTS）
  - duration: 建议时长（秒）
  - characters: 出场角色列表
  - emotion: 情绪标签（开心/紧张/悲伤等）
  - cameraAngle: 镜头建议（全景/特写/中景等）

#### Scenario: 分镜提示词生成
- **WHEN** 生成分镜列表时
- **THEN** 为每个 Shot 自动生成图片生成提示词（TTI Prompt）
- **AND** 融合角色特征、场景设定、情绪氛围
- **AND** 适配当前选择的视觉模型风格

#### Scenario: 手动调整分镜
- **WHEN** 用户编辑某个分镜的描述或参数
- **THEN** 系统保存修改
- **AND** 不影响其他分镜
- **AND** 支持插入、删除、合并分镜

### Requirement: Character Extraction
系统 SHALL 从剧本中提取角色信息。

#### Scenario: 自动识别角色
- **WHEN** 剧本导入或生成后
- **THEN** 系统调用 LLM 提取角色列表
- **AND** 包含角色名、描述、性格特征
- **AND** 提示用户补充角色视觉参考

#### Scenario: 角色关联
- **WHEN** 角色被识别后
- **THEN** 自动关联到项目角色库
- **AND** 如果已有同名角色则复用
- **AND** 新角色需要用户确认并添加参考图

### Requirement: Scene Extraction
系统 SHALL 从剧本中提取场景信息。

#### Scenario: 自动识别场景
- **WHEN** 剧本分析时
- **THEN** 系统提取场景列表
- **AND** 包含场景名、环境描述、氛围
- **AND** 关联到项目场景库

### Requirement: Props Extraction
系统 SHALL 从剧本中提取道具信息。

#### Scenario: 自动识别道具
- **WHEN** 剧本分析时
- **THEN** 系统调用 LLM 提取道具列表
- **AND** 包含道具名、外观描述、用途
- **AND** 标记道具在哪些分镜中出现

#### Scenario: 道具关联
- **WHEN** 道具被识别后
- **THEN** 自动关联到项目道具库
- **AND** 如果已有同名道具则复用
- **AND** 新道具需要用户确认并添加参考图

### Requirement: LLM Prompt Templates
系统 SHALL 使用可配置的 Prompt 模板进行 LLM 调用。

#### Scenario: 分镜拆解 Prompt
- **WHEN** 执行分镜拆解时
- **THEN** 使用预定义的 System Prompt 模板
- **AND** 模板包含输出 JSON Schema 约束
- **AND** 用户可自定义模板

#### Scenario: Prompt 模板管理
- **WHEN** 用户访问设置页面
- **THEN** 可查看和编辑 Prompt 模板
- **AND** 支持重置为默认模板
- **AND** 模板分类：剧本生成、分镜拆解、角色提取

### Requirement: Progress Feedback
系统 SHALL 在 LLM 处理时显示进度。

#### Scenario: 分镜生成进度
- **WHEN** 分镜拆解进行中
- **THEN** 显示处理阶段（角色提取/场景提取/道具提取/分镜生成）
- **AND** 显示当前步骤的等待确认状态
- **AND** 支持取消操作
- **AND** 错误时显示具体原因并支持重试

### Requirement: Script Analysis Service
系统 SHALL 提供完整的剧本解析服务。

#### Scenario: 服务初始化
- **WHEN** 初始化 ScriptAnalysisService
- **THEN** 接受 LLMModelConfig 作为参数
- **AND** 创建对应的 LLM Provider 实例

#### Scenario: 完整解析流程
- **WHEN** 调用 analyzeScript 方法
- **THEN** 按顺序执行：角色提取 → 场景提取 → 道具提取 → 分镜生成
- **AND** 每个步骤返回中间结果
- **AND** 支持在任意步骤暂停等待用户确认

### Requirement: Character Extraction with Preview
系统 SHALL 展示角色提取的中间结果。

#### Scenario: 角色提取
- **WHEN** 执行角色提取步骤
- **THEN** 调用 LLM 分析剧本中的角色
- **AND** 返回结构化的角色列表
- **AND** 每个角色包含：name, description, personality, appearance

#### Scenario: 角色结果编辑
- **WHEN** 展示角色提取结果
- **THEN** 用户可编辑角色名称和描述
- **AND** 用户可删除错误识别的角色
- **AND** 用户可手动添加遗漏的角色
- **AND** 确认后进入下一步

### Requirement: Scene Extraction with Preview
系统 SHALL 展示场景提取的中间结果。

#### Scenario: 场景提取
- **WHEN** 执行场景提取步骤
- **THEN** 调用 LLM 分析剧本中的场景
- **AND** 返回结构化的场景列表
- **AND** 每个场景包含：name, description, atmosphere, timeOfDay

#### Scenario: 场景结果编辑
- **WHEN** 展示场景提取结果
- **THEN** 用户可编辑场景名称和描述
- **AND** 用户可删除或添加场景
- **AND** 确认后进入下一步

### Requirement: Props Extraction with Preview
系统 SHALL 展示道具提取的中间结果。

#### Scenario: 道具提取
- **WHEN** 执行道具提取步骤
- **THEN** 调用 LLM 分析剧本中的道具
- **AND** 返回结构化的道具列表
- **AND** 每个道具包含：name, description, usage, relatedScenes

#### Scenario: 道具结果编辑
- **WHEN** 展示道具提取结果
- **THEN** 用户可编辑道具信息
- **AND** 用户可删除或添加道具
- **AND** 确认后进入下一步

### Requirement: Shot Generation with Preview
系统 SHALL 展示分镜生成的中间结果。

#### Scenario: 分镜生成
- **WHEN** 执行分镜生成步骤
- **THEN** 调用 LLM 基于剧本和已确认的角色/场景/道具生成分镜列表
- **AND** 每个分镜包含 shotId, sceneIndex, content, dialogue, duration, characters, emotion, cameraAngle

#### Scenario: 分镜结果调整
- **WHEN** 展示分镜列表预览
- **THEN** 用户可拖拽调整分镜顺序
- **AND** 用户可编辑分镜描述和参数
- **AND** 用户可删除或合并分镜
- **AND** 用户可插入新分镜
- **AND** 确认后完成解析流程

### Requirement: Analysis Progress Feedback
系统 SHALL 在解析过程中提供详细的进度反馈。

#### Scenario: 进度展示
- **WHEN** 剧本解析进行中
- **THEN** 显示当前步骤名称（角色提取/场景提取/道具提取/分镜生成）
- **AND** 显示总步骤数和当前步骤序号（如 2/4）
- **AND** 显示步骤状态（进行中/等待确认/已完成）

#### Scenario: 单步重试
- **WHEN** 某个步骤的结果不满意
- **THEN** 用户可点击「重新生成」
- **AND** 重新调用 LLM 生成该步骤结果
- **AND** 不影响之前步骤的确认结果

#### Scenario: 取消解析
- **WHEN** 用户点击「取消」按钮
- **THEN** 中断当前 LLM 调用
- **AND** 返回解析前状态
- **AND** 已确认的中间结果不保存

### Requirement: Structured Output Schema
系统 SHALL 使用 JSON Schema 约束 LLM 输出格式。

#### Scenario: 角色提取 Schema
- **WHEN** 调用 LLM 提取角色
- **THEN** 使用预定义的 JSON Schema 约束输出
- **AND** Schema 定义角色数组结构和必填字段
- **AND** 解析失败时进行重试或降级处理

#### Scenario: 分镜生成 Schema
- **WHEN** 调用 LLM 生成分镜
- **THEN** 使用预定义的 JSON Schema 约束输出
- **AND** Schema 定义分镜数组结构和字段类型
- **AND** 验证 duration 为正数，characters 引用有效角色

### Requirement: Use Global Prompt Templates
系统 SHALL 使用全局 Prompt 模板系统进行剧本分析。

#### Scenario: 角色提取使用模板
- **WHEN** ScriptAnalysisService 执行角色提取
- **THEN** 从 `promptTemplates.ts` 加载 `character_extraction` 模板
- **AND** 使用 `fillTemplate()` 填充 `{{script}}` 变量
- **AND** 用户自定义的模板优先于默认模板

#### Scenario: 场景提取使用模板
- **WHEN** ScriptAnalysisService 执行场景提取
- **THEN** 从 `promptTemplates.ts` 加载 `scene_extraction` 模板
- **AND** 使用 `fillTemplate()` 填充变量

#### Scenario: 道具提取使用模板
- **WHEN** ScriptAnalysisService 执行道具提取
- **THEN** 从 `promptTemplates.ts` 加载 `prop_extraction` 模板
- **AND** 使用 `fillTemplate()` 填充变量

#### Scenario: 分镜生成使用模板
- **WHEN** ScriptAnalysisService 执行分镜生成
- **THEN** 从 `promptTemplates.ts` 加载 `shot_breakdown` 模板
- **AND** 使用 `fillTemplate()` 填充 `{{script}}`, `{{characters}}`, `{{scenes}}`, `{{props}}` 变量

### Requirement: Template Customization Effect
系统 SHALL 确保用户自定义模板立即生效。

#### Scenario: 用户修改模板后生效
- **GIVEN** 用户在设置页面修改了 `character_extraction` 模板
- **WHEN** 用户执行剧本分析
- **THEN** 使用用户自定义的模板内容
- **AND** 不使用硬编码的默认 Prompt

### Requirement: JSON Schema Constraint
系统 SHALL 在 Prompt 中包含 JSON Schema 约束。

#### Scenario: 输出格式约束
- **WHEN** 调用 LLM 进行实体提取
- **THEN** Prompt 末尾包含 JSON Schema 定义
- **AND** Schema 定义在代码中（非模板中），确保输出格式一致性

### Requirement: 分集拆分模式
ScriptAnalysisService SHALL 支持分集拆分模式，允许按单集或全剧本两种方式进行剧本分析。

#### Scenario: 单集分析模式
- **WHEN** 提供 episodeId 和 episodeScript 参数
- **THEN** 仅分析指定分集的内容
- **AND** 提取结果标记为属于该分集

#### Scenario: 全剧本分析模式
- **WHEN** 未提供分集参数
- **THEN** 分析完整剧本内容
- **AND** 提取所有角色、场景、道具

### Requirement: 角色提取后生成定妆照入口
系统 SHALL 在角色提取完成后提供生成定妆照的快捷入口。

#### Scenario: 显示生成定妆照入口
- **WHEN** 角色提取步骤完成
- **THEN** ScriptAnalysisWizard 显示"生成定妆照"按钮
- **AND** 点击后可进入资产生成流程

