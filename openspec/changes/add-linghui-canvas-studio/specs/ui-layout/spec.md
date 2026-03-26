## ADDED Requirements

### Requirement: Global Workspace Navigation

系统 SHALL 在根侧边栏中提供官方一级工作台导航，并允许用户在不依赖当前项目上下文的情况下进入独立工作区。

#### Scenario: 从侧边栏进入灵绘
- **WHEN** 用户点击根侧边栏中的 `灵绘` 入口
- **THEN** 系统打开独立的灵绘工作台页面
- **AND** 不要求用户先选择 `Project` 或 `Episode`

#### Scenario: 返回时保留原有项目上下文
- **WHEN** 用户从 `editor`、`overview` 或 `projects` 视图切换到 `灵绘` 再返回
- **THEN** 系统保留切换前的项目与编辑步骤状态
- **AND** 不自动重置当前项目选择
