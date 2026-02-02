## ADDED Requirements

### Requirement: LLM Config List Component
系统 SHALL 提供 LLM 模型配置列表组件。

#### Scenario: 列表展示
- **WHEN** 用户进入设置页面的 LLM 配置选项卡
- **THEN** 显示所有已配置的 LLM 模型列表
- **AND** 每个配置项显示：名称、渠道类型、模型名、是否为默认
- **AND** 显示配置总数（如 "已配置 3 个模型"）

#### Scenario: 空状态
- **WHEN** 没有任何 LLM 配置
- **THEN** 显示引导文案和「添加第一个模型」按钮

#### Scenario: 列表操作
- **WHEN** 鼠标悬停在配置项上
- **THEN** 显示操作按钮：编辑、删除、设为默认、测试连接
- **AND** 默认配置显示星标图标

### Requirement: LLM Config Editor Component
系统 SHALL 提供 LLM 模型配置编辑器组件。

#### Scenario: 新增配置
- **WHEN** 用户点击「添加模型」按钮
- **THEN** 打开配置编辑器弹窗
- **AND** 表单包含：名称、渠道类型、API 地址、API Key、模型名
- **AND** 保存时验证必填字段

#### Scenario: 渠道选择
- **WHEN** 用户选择渠道类型
- **THEN** 如果选择 OpenAI，显示模型下拉框（gpt-4o, gpt-4o-mini 等）
- **AND** 如果选择 Gemini，显示模型下拉框（gemini-2.0-flash 等）
- **AND** 如果选择 OpenAI 兼容，显示预设渠道选择和自定义 baseUrl 输入框

#### Scenario: 预设渠道选择
- **WHEN** 选择 OpenAI 兼容渠道并选择预设
- **THEN** 自动填充 baseUrl 和建议的模型名列表
- **AND** 用户只需填写 API Key

#### Scenario: 连接测试
- **WHEN** 用户点击「测试连接」按钮
- **THEN** 使用当前配置创建 Provider 并调用 testConnection
- **AND** 显示测试结果（成功/失败）
- **AND** 失败时显示错误信息

### Requirement: Project LLM Selector Component
系统 SHALL 在项目设置中提供 LLM 模型选择组件。

#### Scenario: 模型选择下拉框
- **WHEN** 用户打开项目设置
- **THEN** 显示 LLM 模型选择下拉框
- **AND** 选项包含所有已配置的模型和「使用全局默认」选项
- **AND** 当前选中的模型高亮显示

#### Scenario: 显示当前配置
- **WHEN** 项目已关联某个 LLM 配置
- **THEN** 显示该配置的名称和渠道类型
- **AND** 如果配置已被删除，显示警告并提示重新选择

#### Scenario: 切换确认
- **WHEN** 用户切换到不同的模型
- **THEN** 显示简短提示说明切换影响
- **AND** 保存切换后立即生效

### Requirement: Script Analysis Wizard Component
系统 SHALL 提供剧本解析向导组件。

#### Scenario: 向导入口
- **WHEN** 用户在剧本工作室点击「AI 解析」按钮
- **THEN** 检查是否已配置 LLM
- **AND** 如果未配置，提示跳转到设置页面
- **AND** 如果已配置，打开解析向导弹窗

#### Scenario: 步骤导航
- **WHEN** 解析向导打开
- **THEN** 显示步骤指示器（1.角色 2.场景 3.道具 4.分镜）
- **AND** 当前步骤高亮
- **AND** 已完成步骤显示勾选标记

#### Scenario: 结果卡片
- **WHEN** 某个步骤完成
- **THEN** 以卡片列表形式展示提取结果
- **AND** 每个卡片可展开编辑详情
- **AND** 支持删除和添加操作

#### Scenario: 底部操作栏
- **WHEN** 展示步骤结果
- **THEN** 底部显示「重新生成」「上一步」「确认并继续」按钮
- **AND** 最后一步显示「完成」按钮
