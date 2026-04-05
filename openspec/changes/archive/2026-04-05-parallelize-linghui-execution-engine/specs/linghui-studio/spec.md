## ADDED Requirements

### Requirement: Layered Parallel Linghui Execution

灵绘 SHALL 按拓扑层级执行工作流，同一层内彼此无依赖的节点 MUST 可以并发运行。

#### Scenario: 同层独立节点并发开始

- **WHEN** 用户执行一个包含多个独立上游分支的工作流
- **THEN** 系统 MUST 在同一拓扑层内并发启动这些节点
- **AND** 下游节点 MUST 等待其直接上游全部完成后才开始执行

#### Scenario: 同层分支失败不会中断其他分支

- **WHEN** 同一拓扑层中的某个节点执行失败
- **THEN** 该失败 MUST 仅影响依赖它的后续节点
- **AND** 其他无依赖关系的并发节点 MUST 继续执行并产出各自结果

### Requirement: Parallel Execution Queue State

灵绘 SHALL 在执行队列状态中暴露并发运行信息，以支持页面和调试逻辑感知当前层的执行进度。

#### Scenario: 队列状态反映多个运行中节点

- **WHEN** 某个拓扑层中有多个节点正在执行
- **THEN** 队列状态 MUST 暴露全部运行中节点 ID
- **AND** 已完成、失败和取消的节点统计 MUST 继续保持准确
