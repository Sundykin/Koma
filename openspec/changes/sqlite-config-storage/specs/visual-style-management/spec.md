## ADDED Requirements

### Requirement: Visual Style Preset Persistence
系统 SHALL 将内置与自定义视觉风格预设持久化在 SQLite `visual_style_presets` 表中。

#### Scenario: 读取预设列表
- **WHEN** 前端视觉风格管理界面加载时
- **THEN** MUST 通过 `config:style.list` IPC 获取全部预设
- **AND** 返回结果 MUST 按 `is_builtin DESC, sort_order ASC, updated_at DESC` 排序
- **AND** MUST NOT 读取 `settings.json` 或 `localStorage`

#### Scenario: 首次启动 seed 内置预设
- **WHEN** 数据库首次创建或升级到引入 `visual_style_presets` 表的 schema 版本时
- **THEN** 系统 MUST 将代码常量中定义的内置风格预设批量 INSERT
- **AND** 每行 `is_builtin=1`

#### Scenario: 新增自定义预设
- **WHEN** 用户点击"新增风格"并保存
- **THEN** 前端 MUST 调用 `config:style.upsert`
- **AND** 后端 INSERT 一行 `is_builtin=0`
- **AND** 广播 `config:changed`

#### Scenario: 编辑自定义预设
- **WHEN** 用户修改自定义预设
- **THEN** 后端 MUST UPDATE 对应行并广播变更

#### Scenario: 禁止删除内置预设
- **WHEN** 前端请求删除 `is_builtin=1` 的预设
- **THEN** 后端 Controller MUST 返回错误
- **AND** MUST NOT 执行 DELETE

## MODIFIED Requirements

### Requirement: Custom Theme Preset Management
系统 SHALL 允许用户在全局设置中管理自定义视觉风格预设，所有读写通过 `config:style.*` IPC。

#### Scenario: View all theme presets
- **Given** 用户打开全局设置
- **When** 用户切换到"视觉风格"Tab
- **Then** 系统 SHALL 通过 `config:style.list` 获取所有可用的风格预设列表
- **And** 系统内置预设 MUST 标记为"内置"
- **And** 用户自定义预设 SHALL 显示在列表前面

#### Scenario: Add custom theme preset
- **Given** 用户在视觉风格管理界面
- **When** 用户点击"新增风格"按钮
- **And** 填写风格名称、描述、TTI提示词前缀、LLM提示词后缀
- **And** 点击保存
- **Then** 前端 MUST 调用 `config:style.upsert`
- **And** 新风格 MUST 保存到 `visual_style_presets` 表
- **And** 风格列表 SHALL 刷新显示新添加的预设

#### Scenario: Edit custom theme preset
- **Given** 用户有自定义风格预设
- **When** 用户点击编辑按钮
- **And** 修改风格配置
- **And** 点击保存
- **Then** 前端 MUST 调用 `config:style.upsert`
- **And** 风格配置 MUST 在 `visual_style_presets` 表中更新
- **And** 使用该风格的项目在下次生成时 SHALL 应用新配置

#### Scenario: Delete custom theme preset
- **Given** 用户有自定义风格预设
- **When** 用户点击删除按钮
- **And** 确认删除
- **Then** 前端 MUST 调用 `config:style.delete`
- **And** 后端 MUST 从 `visual_style_presets` 表 DELETE 对应行
- **And** 风格 MUST 从列表中移除
- **And** 使用该风格的项目 SHALL 不受影响（需手动更换）

#### Scenario: Cannot edit built-in preset
- **Given** 用户查看系统内置风格预设
- **When** 用户尝试编辑或删除 `is_builtin=1` 的预设
- **Then** 系统 MUST 在 UI 层禁用对应按钮
- **And** 后端 Controller MUST 拒绝任何修改 `is_builtin=1` 行的请求
