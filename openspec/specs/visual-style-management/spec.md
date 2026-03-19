# visual-style-management Specification

## Purpose
TBD - created by archiving change fix-ai-and-visual-style. Update Purpose after archive.
## Requirements
### Requirement: Custom Theme Preset Management
系统 SHALL 允许用户在全局设置中管理自定义视觉风格预设。

#### Scenario: View all theme presets
- **Given** 用户打开全局设置
- **When** 用户切换到"视觉风格"Tab
- **Then** 系统 SHALL 显示所有可用的风格预设列表
- **And** 系统内置预设 MUST 标记为"内置"
- **And** 用户自定义预设 SHALL 显示在列表前面

#### Scenario: Add custom theme preset
- **Given** 用户在视觉风格管理界面
- **When** 用户点击"新增风格"按钮
- **And** 填写风格名称、描述、TTI提示词前缀、LLM提示词后缀
- **And** 点击保存
- **Then** 新风格 MUST 保存到用户配置
- **And** 风格列表 SHALL 刷新显示新添加的预设

#### Scenario: Edit custom theme preset
- **Given** 用户有自定义风格预设
- **When** 用户点击编辑按钮
- **And** 修改风格配置
- **And** 点击保存
- **Then** 风格配置 MUST 更新成功
- **And** 使用该风格的项目在下次生成时 SHALL 应用新配置

#### Scenario: Delete custom theme preset
- **Given** 用户有自定义风格预设
- **When** 用户点击删除按钮
- **And** 确认删除
- **Then** 风格 MUST 从列表中移除
- **And** 使用该风格的项目 SHALL 不受影响（需手动更换）

#### Scenario: Cannot edit built-in preset
- **Given** 用户查看系统内置风格预设
- **When** 用户尝试编辑或删除
- **Then** 编辑/删除按钮 MUST 不可用或隐藏
- **And** 系统 SHALL 显示"内置风格不可修改"提示

### Requirement: Theme Preset Data Structure
风格预设 MUST 包含完整的配置信息。

#### Scenario: Preset contains required fields
- **Given** 一个��格预设
- **Then** 预设 MUST 包含以下字段：
  - `id`: 唯一标识符
  - `name`: 显示名称
  - `description`: 风格描述
  - `ttiStylePrefix`: TTI提示词风格前缀（英文）
  - `llmPromptSuffix`: LLM提示词风格后缀（中文）
- **And** 预设 SHALL 可选包含：
  - `previewImage`: 预览图URL

### Requirement: Theme Preset Selection in Project
用户 SHALL 仅能从统一的全局风格目录中为项目选择风格。

#### Scenario: Select style from unified catalog when creating project
- **Given** 系统存在内置风格与全局自定义风格
- **When** 用户创建新项目并打开风格选择器
- **Then** 系统 SHALL 显示统一的风格目录
- **And** 目录 MUST 同时包含内置风格和全局自定义风格
- **And** 项目 SHALL 只保存被选中风格的快照

#### Scenario: Custom preset available to project selection
- **Given** 用户已在全局设置中创建自定义风格
- **When** 用户创建项目或修改项目风格
- **Then** 风格目录 MUST 包含该自定义风格
- **And** 用户 SHALL 能直接选择它作为项目风格

### Requirement: Theme Presets Loading
主题预设加载逻辑 MUST 提供统一目录结果，供项目选择与全局管理复用。

#### Scenario: Load unified style catalog
- **Given** 系统需要显示项目风格选择器
- **When** 调用统一风格目录读取接口
- **Then** 系统 SHALL 返回合并后的风格目录
- **And** 返回项 MUST 包含完整的 `ThemePreset` 字段
- **And** 项目选择器 SHALL 不直接读取静态 `THEME_PRESETS`

### Requirement: Project Style Snapshot
项目 MUST 保存所选风格的不可变快照，作为后续生成链路的唯一风格来源。

#### Scenario: Save snapshot when project selects style
- **Given** 用户为项目选择了一个全局风格
- **When** 用户完成创建项目或更新项目风格
- **Then** 项目 MUST 保存 `styleSnapshot`
- **And** `styleSnapshot` MUST 包含 `ttiStylePrefix` 和 `llmPromptSuffix`
- **And** `styleSnapshot` MUST 记录来源类型和来源预设 ID

#### Scenario: Global preset changes do not directly change existing project
- **Given** 项目已经保存 `styleSnapshot`
- **When** 用户后续修改全局自定义风格预设
- **Then** 已有项目的后续生成 SHALL 继续使用自己的 `styleSnapshot`
- **And** 只有在用户重新为项目选择风格时才刷新快照

