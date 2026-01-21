# ui-style Specification

## Purpose
TBD - created by archiving change optimize-ui-styles. Update Purpose after archive.
## Requirements
### Requirement: Unified Dark Theme
The application SHALL use a consistent dark theme palette across all UI components.

#### Scenario: Theme Consistency
- **WHEN** the user navigates between different views (e.g., Project List, Editor)
- **THEN** the background colors, border colors, and text colors SHALL remain consistent with the defined theme tokens.

### Requirement: Responsive Layout
The application layout SHALL adapt gracefully to different screen sizes.

#### Scenario: Sidebar Collapse
- **WHEN** the user resizes the window or toggles the sidebar
- **THEN** the sidebar SHALL collapse or expand with a smooth transition animation.

### Requirement: Enhanced Project Cards
Project cards SHALL provide clear visual feedback and information.

#### Scenario: Card Hover
- **WHEN** the user hovers over a project card
- **THEN** the card SHALL scale slightly and display a shadow to indicate interactivity.

### Requirement: Editor Visual Integration
The script editor SHALL visually integrate with the rest of the application.

#### Scenario: Editor Styling
- **WHEN** the user opens the script editor
- **THEN** the editor container border and background SHALL match the application's dark theme palette.

### Requirement: Project List View
项目列表页面 SHALL 提供简洁高效的项目浏览和管理体验。

#### Scenario: 有项目时的列表展示
- **WHEN** 用户有一个或多个项目
- **THEN** 头部显示紧凑的标题、搜索框、筛选器和新建按钮
- **AND** 项目以无封面的简洁卡片形式展示
- **AND** 卡片包含状态标签、标题、类型标签、集数和最后编辑时间

#### Scenario: 无项目时的空状态
- **WHEN** 用户没有任何项目
- **THEN** 头部不显示新建按钮
- **AND** 列表区域显示一个横贯的创建项目按钮
- **AND** 按钮样式醒目，引导用户创建第一个项目

#### Scenario: 搜索过滤无结果
- **WHEN** 用户搜索或筛选后没有匹配项目
- **THEN** 显示无结果提示和清除筛选按钮
- **AND** 不显示创建项目按钮（因为是筛选无结果，不是真的没项目）

### Requirement: Component Module Organization
组件目录 SHALL 按功能模块划分，便于理解和维护。

#### Scenario: 开发者查找组件
- **WHEN** 开发者需要修改某个功能的组件
- **THEN** 可以通过模块目录快速定位（common, project, asset, storyboard, settings, editor）
- **AND** 每个模块有 index.ts 统一导出

### Requirement: App Component Decomposition
App.tsx SHALL 保持精简，复杂逻辑拆分到子组件和 hooks。

#### Scenario: 查看应用入口
- **WHEN** 开发者打开 App.tsx
- **THEN** 代码行数不超过 400 行
- **AND** 主要职责是组合子组件和管理全局状态

