## MODIFIED Requirements

### Requirement: Mention Editor Character Support
系统 SHALL 在分镜描述编辑器中支持角色和道具的 @ 引用，且只显示已绑定 Sora2 的资产。

#### Scenario: 角色补全列表过滤
- **WHEN** 用户在编辑器中输入 `@`
- **THEN** 显示已绑定 Sora2 的角色列表
- **AND** 未绑定 Sora2 的角色不显示
- **AND** 列表项显示角色名称和绑定标记

#### Scenario: 道具补全列表过滤
- **WHEN** 用户在编辑器中输入 `@`
- **THEN** 显示已绑定 Sora2 的道具列表
- **AND** 未绑定 Sora2 的道具不显示
- **AND** 列表项显示道具名称和绑定标记

#### Scenario: Mention ID 格式
- **WHEN** 用户选择角色或道具
- **THEN** 插入 `@char_{sora2CharacterId}` 或 `@prop_{sora2PropId}` 格式
- **AND** 使用 Sora2 返回的 ID 而非自定义 ID

#### Scenario: 场景补全列表
- **WHEN** 用户输入 `@` 并筛选场景
- **THEN** 显示所有场景（场景不需要 Sora2 绑定）
- **AND** 使用自定义 ID 作为 mention ID

## ADDED Requirements

### Requirement: Asset Management Panel Layout
系统 SHALL 提供左侧列表 + 右侧属性面板的资产管理布局。

#### Scenario: 面板布局
- **WHEN** 用户进入资产管理页面
- **THEN** 左侧显示资产列表（固定 280px 宽度）
- **AND** 右侧显示选中资产的属性面板

#### Scenario: 列表项展示
- **WHEN** 显示资产列表
- **THEN** 每项显示缩略图、名称、类型标签
- **AND** 已绑定 Sora2 的资产显示绿色状态指示器
- **AND** 未绑定的资产显示灰色状态指示器

#### Scenario: 选中和编辑
- **WHEN** 用户点击列表项
- **THEN** 该项高亮选中
- **AND** 右侧面板显示该资产的详细属性
- **AND** 用户可直接在面板中编辑

### Requirement: Character Detail Panel
系统 SHALL 提供角色属性面板组件。

#### Scenario: 基础信息区
- **WHEN** 显示角色属性面板
- **THEN** 显示可编辑的名称、年龄、角色类型、描述、外貌字段

#### Scenario: 资产状态区
- **WHEN** 显示角色属性面板
- **THEN** 显示定妆照预览和生成按钮
- **AND** 显示 Sora2 绑定状态和操作按钮

#### Scenario: 提示词区
- **WHEN** 显示角色属性面板
- **THEN** 显示生成提示词预览
- **AND** 支持切换到编辑模式修改提示词

### Requirement: Scene Detail Panel
系统 SHALL 提供场景属性面板组件。

#### Scenario: 基础信息区
- **WHEN** 显示场景属性面板
- **THEN** 显示可编辑的名称、位置、时间、氛围、描述字段

#### Scenario: 资产生成区
- **WHEN** 显示场景属性面板
- **THEN** 显示场景图预览和生成按钮

#### Scenario: 提示词区
- **WHEN** 显示场景属性面板
- **THEN** 显示生成提示词预览
- **AND** 支持切换到编辑模式修改提示词

### Requirement: Prop Detail Panel
系统 SHALL 提供道具属性面板组件。

#### Scenario: 基础信息区
- **WHEN** 显示道具属性面板
- **THEN** 显示可编辑的名称、类型、描述字段

#### Scenario: 资产状态区
- **WHEN** 显示道具属性面板
- **THEN** 显示道具图预览和生成按钮
- **AND** 显示预览视频区域
- **AND** 显示 Sora2 绑定状态和操作按钮

#### Scenario: 提示词区
- **WHEN** 显示道具属性面板
- **THEN** 显示生成提示词预览
- **AND** 支持切换到编辑模式修改提示词

### Requirement: AI Storyboard Asset Preset
系统 SHALL 支持 AI 分镜生成前预选角色和道具。

#### Scenario: 预选对话框
- **WHEN** 用户点击「AI 智能生成分镜」按钮
- **THEN** 弹出预选资产对话框
- **AND** 显示已绑定 Sora2 的角色列表（可多选）
- **AND** 显示已绑定 Sora2 的道具列表（可多选）

#### Scenario: 预选资产注入
- **WHEN** 用户选择资产后确认
- **THEN** 预选资产信息注入到 AI prompt
- **AND** prompt 包含可用资产的 @ 引用格式说明

#### Scenario: AI 结果匹配
- **WHEN** AI 返回分镜结果
- **THEN** 自动解析并关联预选的角色/道具
- **AND** 分镜描述包含正确的 @ 引用
