## ADDED Requirements

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
- **THEN** 显示处理阶段（分析中/生成中/校验中）
- **AND** 支持取消操作
- **AND** 错误时显示具体原因
