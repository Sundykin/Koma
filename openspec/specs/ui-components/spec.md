# ui-components Specification

## Purpose
TBD - created by archiving change add-antd-timeline-editor. Update Purpose after archive.
## Requirements
### Requirement: Ant Design Integration
系统 SHALL 使用 Ant Design 5.x 作为主要 UI 组件库。

#### Scenario: 暗色主题配置
- **WHEN** 应用启动时
- **THEN** 所有 Antd 组件应用暗色主题
- **AND** 主色调为绿色（#10b981）
- **AND** 背景色与现有设计保持一致

#### Scenario: 布局组件使用
- **WHEN** 渲染应用主框架时
- **THEN** 使用 Antd Layout、Sider、Content 组件
- **AND** 侧边栏可折叠

### Requirement: Form Components Migration
系统 SHALL 将表单相关组件迁移至 Antd Form 系统。

#### Scenario: 设置页面表单
- **WHEN** 用户访问设置页面
- **THEN** 显示使用 Antd Form、Input、Select 构建的配置表单
- **AND** 支持表单验证
- **AND** 使用 Tabs 分区（LLM / TTI / ITV / TTS）

#### Scenario: 模态框组件
- **WHEN** 用户触发创建项目操作
- **THEN** 显示 Antd Modal 组件
- **AND** 内部使用 Antd Form 收集输入

### Requirement: Interactive Components
系统 SHALL 使用 Antd 交互组件提升用户体验。

#### Scenario: Tab 导航
- **WHEN** 用户在资产管理页面切换标签
- **THEN** 使用 Antd Tabs 组件
- **AND** 支持动画过渡

#### Scenario: 图片预览
- **WHEN** 用户点击资产缩略图
- **THEN** 使用 Antd Image 组件显示预览
- **AND** 支持缩放和关闭

#### Scenario: 通知提示
- **WHEN** 操作成功或失败时
- **THEN** 使用 Antd message 或 notification 显示提示
- **AND** 自动消失或可手动关闭

### Requirement: Button Standardization
系统 SHALL 统一使用 Antd Button 组件。

#### Scenario: 主要操作按钮
- **WHEN** 显示主要操作按钮（保存、下一步、确认）
- **THEN** 使用 Antd Button type="primary"
- **AND** 保持绿色主题

#### Scenario: 危险操作按钮
- **WHEN** 显示危险操作按钮（删除）
- **THEN** 使用 Antd Button danger 属性
- **AND** 需要二次确认

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

### Requirement: TTI Config Manager Component
系统 SHALL 提供文生图配置管理组件。

#### Scenario: 配置列表展示
- **WHEN** 用户进入 TTI 设置页
- **THEN** 以卡片列表展示所有 TTI 配置
- **AND** 显示名称、厂商类型、默认标记
- **AND** 提供「添加配置」按钮

#### Scenario: 配置编辑
- **WHEN** 用户点击「添加」或「编辑」按钮
- **THEN** 打开配置编辑弹窗
- **AND** 显示厂商预设快速选择
- **AND** ComfyUI 类型显示工作流上传区域
- **AND** 填写完成后保存

#### Scenario: 测试连接
- **WHEN** 用户点击「测试连接」按钮
- **THEN** 系统验证 API 可用性
- **AND** 显示成功或失败状态

### Requirement: ITV Config Manager Component
系统 SHALL 提供图生视频配置管理组件。

#### Scenario: 配置列表展示
- **WHEN** 用户进入 ITV 设置页
- **THEN** 以卡片列表展示所有 ITV 配置
- **AND** 显示名称、厂商类型、默认时长

#### Scenario: 配置编辑
- **WHEN** 用户编辑 ITV 配置
- **THEN** 可选择厂商预设
- **AND** 配置默认时长、分辨率
- **AND** ComfyUI AnimateDiff 类型支持工作流上传

### Requirement: TTS Config Manager Component
系统 SHALL 提供语音合成配置管理组件。

#### Scenario: 配置列表展示
- **WHEN** 用户进入 TTS 设置页
- **THEN** 以卡片列表展示所有 TTS 配置
- **AND** 显示名称、厂商类型、默认音色

#### Scenario: 音色试听
- **WHEN** 用户配置 TTS 时
- **THEN** 可选择音色并试听效果
- **AND** 播放示例语音

### Requirement: Workflow Uploader Component
系统 SHALL 提供 ComfyUI 工作流上传组件。

#### Scenario: 文件上传
- **WHEN** 用户上传工作流 JSON 文件
- **THEN** 系统解析并验证格式
- **AND** 显示工作流名称和节点数量
- **AND** 提供「查看节点」和「删除」操作

#### Scenario: 节点映射配置
- **WHEN** 用户点击「配置映射」
- **THEN** 显示可映射的输入节点列表
- **AND** 用户为每个系统输入选择对应节点 ID
- **AND** 支持：正向提示词、负向提示词、图片输入、种子、尺寸等

### Requirement: Project Media Selector Component
系统 SHALL 提供项目级媒体配置选择组件。

#### Scenario: 配置选择
- **WHEN** 在项目设置中配置媒体服务
- **THEN** 显示 TTI/ITV/TTS 三个下拉选择器
- **AND** 选项包含「使用全局默认」+ 所有已配置项
- **AND** 显示当前选中配置的简要信息

#### Scenario: 快捷入口
- **WHEN** 用户需要添加新配置
- **THEN** 选择器提供「前往设置」快捷链接
- **AND** 点击后跳转到对应的全局设置页

### Requirement: 失败任务重试按钮
系统 SHALL 在任务通知中为失败的任务显示重试按钮，允许用户一键重试失败的操作。

#### Scenario: 显示重试按钮
- **WHEN** 异步任务执行失败
- **THEN** 通知组件显示该任务的重试按钮
- **AND** 点击重试按钮触发任务重新执行

#### Scenario: 重试成功
- **WHEN** 用户点击重试按钮
- **AND** 任务重新执行成功
- **THEN** 显示成功通知
- **AND** 移除失败通知

### Requirement: ScriptEditor 组件集成
系统 SHALL 在剧本编辑和分镜提示词编辑场景中使用 ScriptEditor 组件，提供语法高亮和增强编辑体验。

#### Scenario: 剧本编辑使用 ScriptEditor
- **WHEN** 用户编辑剧本内容
- **THEN** 使用 ScriptEditor 组件替代普通 textarea
- **AND** 提供剧本格式的语法高亮

#### Scenario: 分镜提示词编辑使用 ScriptEditor
- **WHEN** 用户编辑分镜提示词
- **THEN** 使用 ScriptEditor 组件
- **AND** 提供适合提示词的编辑体验

