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

