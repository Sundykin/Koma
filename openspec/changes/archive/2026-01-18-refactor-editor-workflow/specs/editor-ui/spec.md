## ADDED Requirements

### Requirement: 分镜列表编辑器

系统 SHALL 提供内联编辑的分镜列表视图，每行包含：剧本文案、提示词编辑器、参考图、视频片段。

#### Scenario: 用户在列表中编辑提示词
- **WHEN** 用户点击某行的提示词编辑器
- **THEN** 编辑器获得焦点，可直接输入
- **AND** 输入的运镜/景别关键字自动高亮

#### Scenario: 用户选择参考图
- **WHEN** 用户点击参考图区域
- **THEN** 显示资产选择下拉（角色、场景、道具）
- **AND** 显示上传按钮

#### Scenario: 用户生成多版本视频
- **WHEN** 用户点击"生成新版本"
- **THEN** 生成新的视频版本
- **AND** 版本列表追加新版本

### Requirement: 分镜拆解与提示词生成解耦

系统 SHALL 将分镜拆解和提示词生成分为两个独立步骤。

#### Scenario: AI分镜拆解
- **WHEN** 用户点击"开始智能拆解"
- **THEN** AI 只生成分镜结构（剧本文案、角色关联、情绪、时长）
- **AND** 不自动生成 description 提示词

#### Scenario: 单条生成提示词
- **WHEN** 用户点击某行的"AI生成提示词"按钮
- **THEN** 调用 LLM 为该分镜生成提示词
- **AND** 提示词自动包含 @角色ID 引用
- **AND** 提示词包含运镜和景别关键字

#### Scenario: 批量生成提示词
- **WHEN** 用户点击顶部"批量生成提示词"按钮
- **THEN** 为所有无提示词的分镜生成提示词
- **AND** 显示生成进度

### Requirement: 提示词AI生成增强

提示词生成 SHALL 自动注入角色引用和预定义关键字。

#### Scenario: 角色引用注入
- **WHEN** 分镜关联了角色 A（sora2CharacterId = "abc123"）
- **THEN** 生成的提示词包含 `@abc123` 格式引用

#### Scenario: 运镜关键字注入
- **WHEN** AI 生成提示词
- **THEN** 提示词包含预定义运镜关键字之一（如 tracking shot, pan, zoom）

#### Scenario: 景别关键字注入
- **WHEN** AI 生成提示词
- **THEN** 提示词包含预定义景别关键字之一（如 close-up, wide shot）

### Requirement: 提示词关键字高亮

提示词编辑器 SHALL 自动识别并高亮运镜和景别关键字。

#### Scenario: 运镜关键字高亮
- **WHEN** 用户输入 `zoom in` 或 `tracking shot`
- **THEN** 关键字显示为紫色高亮

#### Scenario: 景别关键字高亮
- **WHEN** 用户输入 `close-up` 或 `wide shot`
- **THEN** 关键字显示为蓝色高亮

### Requirement: 精简步骤条

步骤条 SHALL 采用紧凑设计，减少占用高度。

#### Scenario: 步骤条显示
- **WHEN** 用户进入编辑器视图
- **THEN** 步骤条高度不超过 60px
- **AND** 步骤图标尺寸为 32x32

#### Scenario: 步骤操作按钮
- **WHEN** 用户处于某个步骤
- **THEN** 步骤条显示该步骤的主操作按钮

## MODIFIED Requirements

### Requirement: Shot 数据结构

Shot 类型的 description 字段 SHALL 改为可选，支持分镜拆解后手动生成。

#### Scenario: 分镜拆解后无提示词
- **WHEN** AI 完成分镜拆解
- **THEN** Shot.description 为 undefined
- **AND** UI 显示"待生成"状态

## REMOVED Requirements

### Requirement: 导演控制台

**Reason**: 改为列表内联编辑模式，不再需要独立的控制面板

**Migration**: 所有编辑功能迁移到 ShotListEditor 行内

### Requirement: 分镜卡片视图

**Reason**: 改为列表编辑模式，卡片视图效率低

**Migration**: 使用 ShotListEditor 替代

### Requirement: 景别/运镜下拉选择器

**Reason**: 通过提示词关键字自动识别，无需手动选择

**Migration**: 用户在提示词中使用关键字，系统自动高亮识别
