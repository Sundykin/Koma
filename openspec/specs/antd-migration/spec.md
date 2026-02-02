# antd-migration Specification

## Purpose
TBD - created by archiving change migrate-antd-v6. Update Purpose after archive.
## Requirements
### Requirement: Message API 使用方式

组件中使用 antd message API **MUST** 通过 `App.useApp()` hook 获取实例，不再支持直接导入静态方法。

#### Scenario: 组件显示成功消息

**Given** 用户完成某项操作
**When** 组件需要显示成功反馈
**Then** 使用 `App.useApp().message.success()` 显示消息
**And** 消息自动继承 ConfigProvider 的主题配置

#### Scenario: 组件显示错误消息

**Given** 操作发生错误
**When** 组件需要显示错误提示
**Then** 使用 `App.useApp().message.error()` 显示错误
**And** 错误消息样式符合当前主题

#### Scenario: 组件显示加载消息

**Given** 异步操作开始执行
**When** 需要显示加载状态
**Then** 使用 `App.useApp().message.loading()` 显示加载提示
**And** 操作完成后消息自动消失或被替换

---

### Requirement: Modal API 使用方式

组件中使用 antd Modal 确认框 **MUST** 通过 `App.useApp()` hook 获取实例。

#### Scenario: 显示确认对话框

**Given** 用户触发需要确认的操作（如删除）
**When** 组件需要显示确认对话框
**Then** 使用 `App.useApp().modal.confirm()` 显示确认框
**And** 对话框继承 ConfigProvider 的主题配置

#### Scenario: 显示成功结果对话框

**Given** 操作成功完成
**When** 需要向用户展示成功结果
**Then** 使用 `App.useApp().modal.success()` 显示结果
**And** 对话框样式符合当前主题

#### Scenario: 显示错误结果对话框

**Given** 操作失败
**When** 需要向用户展示错误详情
**Then** 使用 `App.useApp().modal.error()` 显示错误对话框
**And** 对话框样式符合当前主题

---

### Requirement: Hook 中使用消息 API

自定义 hook 需要使用消息 API 时，**SHALL** 直接调用 `App.useApp()` hook 获取实例（hook 可以调用其他 hook）。

#### Scenario: Hook 显示操作反馈

**Given** 自定义 hook 执行某些操作需要反馈
**When** hook 内部需要显示消息
**Then** hook 内直接调用 `App.useApp()` 获取 message 实例
**And** 使用获取的实例显示消息

### Requirement: Card 组件样式属性

Card 组件的样式配置 **MUST** 使用 `styles` 对象属性，不再使用废弃的 `bodyStyle`/`headStyle`。

#### Scenario: 设置 Card body 样式

**Given** 需要自定义 Card body 区域样式
**When** 配置 Card 组件
**Then** 使用 `styles={{ body: { ... } }}` 设置样式
**And** 不使用废弃的 `bodyStyle` 属性

#### Scenario: 设置 Card header 样式

**Given** 需要自定义 Card header 区域样式
**When** 配置 Card 组件
**Then** 使用 `styles={{ header: { ... } }}` 设置样式
**And** 不使用废弃的 `headStyle` 属性

---

### Requirement: Space 组件方向属性

Space 组件的方向配置 **MUST** 使用 `orientation` 属性，不再使用废弃的 `direction`。

#### Scenario: 设置垂直布局

**Given** 需要垂直排列子元素
**When** 配置 Space 组件
**Then** 使用 `orientation="vertical"` 设置方向
**And** 不使用废弃的 `direction` 属性

#### Scenario: 设置水平布局

**Given** 需要水平排列子元素
**When** 配置 Space 组件
**Then** 使用 `orientation="horizontal"` 或省略（默认值）
**And** 不使用废弃的 `direction` 属性

---

### Requirement: Image.PreviewGroup 预览属性

Image.PreviewGroup 的预览控制 **MUST** 使用 `open`/`onOpenChange` 属性，不再使用废弃的 `visible`/`onVisibleChange`。

#### Scenario: 控制预览显示状态

**Given** 需要控制图片预览的显示/隐藏
**When** 配置 Image.PreviewGroup preview 属性
**Then** 使用 `open` 控制显示状态
**And** 使用 `onOpenChange` 监听状态变化
**And** 不使用废弃的 `visible`/`onVisibleChange` 属性

---

### Requirement: List 组件替代方案

列表展示 **MUST** 使用 Flex 组件配合自定义渲染，避免使用废弃的 List 组件。

#### Scenario: 渲染简单列表

**Given** 需要展示一组数据项
**When** 实现列表 UI
**Then** 使用 Flex 组件配合 map 渲染
**And** 不使用废弃的 List 组件

