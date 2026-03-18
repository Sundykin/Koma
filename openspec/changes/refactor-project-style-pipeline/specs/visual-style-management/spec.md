## MODIFIED Requirements
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

## ADDED Requirements
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
