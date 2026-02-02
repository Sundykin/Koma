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
用户 SHALL 可以在创建项目时选择自定义风格预设。

#### Scenario: Select custom preset when creating project
- **Given** 用户有自定义风格预设
- **When** 用户创建新项目
- **And** 选择风格时
- **Then** 下拉列表 MUST 包含自定义预设
- **And** 自定义预设 SHALL 显示在系统预设前面

### Requirement: Theme Presets Loading
主题预设加载逻辑 MUST 支持异步加载自定义预设。

#### Scenario: Load all available presets
- **Given** 系统需要显示风格选择器
- **When** 调用 `getAllThemePresets()`
- **Then** 系统 SHALL 返回合并后的预设列表
- **And** 列表 MUST 包含系统内置预设
- **And** 列表 MUST 包含用户自定义预设
- **And** 自定义预设 SHALL 在前

