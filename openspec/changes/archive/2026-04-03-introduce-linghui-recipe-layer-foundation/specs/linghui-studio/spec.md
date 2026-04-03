## ADDED Requirements

### Requirement: Built-In Recipe Templates In Linghui Workflow Library

灵绘 SHALL 在工作流模板库中提供系统级 Recipe 模板，使用户可以直接把预设工作流骨架发送到画布继续编辑。

#### Scenario: 打开工作流模板库时展示系统 Recipe

- **WHEN** 用户打开灵绘的“添加到画布”或“工作流模板”抽屉
- **THEN** 系统 MUST 展示内置 Recipe 模板
- **AND** 首版 MUST 至少包含“角色设计流”“分镜创作流”“配音工作流”三类 Recipe
- **AND** 每个 Recipe MUST 包含节点快照、连线关系和默认参数预设

#### Scenario: 将系统 Recipe 发送到画布

- **WHEN** 用户从模板库中选择任一内置 Recipe 并发送到画布
- **THEN** 系统 MUST 复用现有模板插入协议把完整子图发送到画布
- **AND** 插入后的节点关系和默认参数 MUST 保持与 Recipe 定义一致

### Requirement: Workflow Template Metadata Distinguishes Recipes And Workspace Saves

灵绘 SHALL 为工作流模板提供显式来源元数据，区分系统 Recipe 和工作区自建模板。

#### Scenario: 读取模板列表时暴露模板来源与类型

- **WHEN** 系统读取当前工作区的工作流模板列表
- **THEN** 每条模板记录 MUST 暴露来源与类型元数据
- **AND** 系统 Recipe MUST 被标记为系统来源
- **AND** 用户保存的工作流模板 MUST 被标记为工作区来源

#### Scenario: 保存工作流块为模板

- **WHEN** 用户将选中的节点或工作流块保存为工作流模板
- **THEN** 系统 MUST 继续保存该模板的 snapshot、统计信息和名称
- **AND** 新保存的模板记录 MUST 显式标记为工作区模板
