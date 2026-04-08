## ADDED Requirements

### Requirement: 右侧引导式工作流侧车

系统 SHALL 通过右侧 Drawer 提供引导式工作流，而不是将剧本、推理、风格和导出拆成独立页面。

#### Scenario: 打开侧车面板

- **WHEN** 用户点击工作台顶部的剧本、推理、风格或导出入口
- **THEN** 系统 SHALL 从右侧弹出对应工作流面板
- **AND** 主工作台 SHALL 保持可见且不丢失当前分镜上下文

#### Scenario: 面板切换保留状态

- **WHEN** 用户在多个工作流面板之间切换
- **THEN** 每个面板的草稿、步骤进度、作用范围和最近应用信息 SHALL 被保留

### Requirement: 剧本工作流分步引导

系统 SHALL 将剧本导入处理拆成可逐步确认的流程。

#### Scenario: 剧本导入流程

- **WHEN** 用户打开剧本工作室
- **THEN** 面板 SHALL 提供导入 -> 精炼 -> 章节划分 -> 拆分分镜 -> 应用的步骤引导
- **AND** 用户 SHALL 可以在写入前预览中间结果

#### Scenario: 导入写回分镜

- **WHEN** 用户确认脚本工作流结果
- **THEN** 系统 SHALL 按 append 或 replace 模式把结果写回当前 Episode 的 Shot 列表

### Requirement: 章节推理工作流

系统 SHALL 将批量推理定义为“生成草稿 -> 预览 -> 应用”的流程。

#### Scenario: 按范围推理

- **WHEN** 用户在章节推理面板选择作用范围
- **THEN** 系统 SHALL 支持当前分镜、选中分镜、当前章节和全部分镜
- **AND** 推理结果 SHALL 先以草稿形式展示

#### Scenario: 应用推理结果

- **WHEN** 用户接受推理或改写草稿
- **THEN** 系统 SHALL 把图片提示词、视频提示词或改写文案写回对应分镜

### Requirement: 风格面板与推理联动

系统 SHALL 在风格切换后为用户生成面向分镜的影响评估，而不是只做全局设置写入。

#### Scenario: 生成风格影响计划

- **WHEN** 用户在风格面板选择新的风格预设
- **THEN** 系统 SHALL 计算影响范围、受影响分镜数量和建议的重新推理级别

#### Scenario: 跳转推理面板

- **WHEN** 用户决定执行重新推理
- **THEN** 风格面板 SHALL 能将影响计划传递给章节推理面板
- **AND** 章节推理面板 SHALL 自动带入对应范围和模板级别
