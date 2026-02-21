## ADDED Requirements

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
