## MODIFIED Requirements

### Requirement: TTI Prompt Templates

系统 SHALL 在已有模板能力之上，提供可按创作阶段和级别筛选的模板组织方式。

#### Scenario: 按创作阶段组织模板

- **WHEN** 用户在剧本工作室或章节推理面板选择模板
- **THEN** 系统 SHALL 能按剧本导入、内容精炼、章节划分、分镜推理和批量改写阶段筛选模板

#### Scenario: 按级别组织模板

- **WHEN** 用户需要切换模板强度
- **THEN** 系统 SHALL 支持基础、进阶、工作室级等不同层级
- **AND** 同一任务下的级别切换 SHALL 对应不同的模板定义

## ADDED Requirements

### Requirement: 创作操作器元数据层

系统 SHALL 提供创作操作器元数据层，用于封装官方 Prompt 模板能力。

#### Scenario: 查询操作器

- **WHEN** 前端面板需要展示某一阶段的模板能力
- **THEN** 系统 SHALL 能按 phase、task、level 查询创作操作器
- **AND** 返回结果 SHALL 包含标签、说明和关联模板类型

#### Scenario: 解析具体操作器模板

- **WHEN** 用户选择某个创作操作器
- **THEN** 系统 SHALL 能解析其对应的 PromptTemplate
- **AND** 后续 LLM 调用 SHALL 使用该模板执行
