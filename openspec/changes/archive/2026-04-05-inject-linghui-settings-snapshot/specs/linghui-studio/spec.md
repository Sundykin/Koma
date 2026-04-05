## ADDED Requirements

### Requirement: Workflow Execution Settings Snapshot

灵绘 SHALL 在单次工作流执行开始时冻结一份 settings snapshot，并在该次执行期间将其作为执行上下文的一部分传递给所有节点 provider 解析路径。

#### Scenario: 单次执行复用同一份设置快照

- **WHEN** 用户开始执行一个灵绘工作流或其子图
- **THEN** 系统 MUST 在执行开始时捕获一份 settings snapshot
- **AND** 该次执行中的所有节点 MUST 复用这同一份 snapshot 解析媒体 provider

#### Scenario: 执行期间设置发生变化

- **WHEN** 工作流正在执行且全局 settings 在外部被修改
- **THEN** 当前这次执行 MUST 继续使用启动时捕获的 snapshot
- **AND** 系统 MUST NOT 为同一次执行中的后续节点重新读取全局 settings
