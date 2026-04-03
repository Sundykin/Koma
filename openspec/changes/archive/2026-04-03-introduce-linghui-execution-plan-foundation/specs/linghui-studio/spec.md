## ADDED Requirements

### Requirement: Explain-Style Execution Plan Before Batch Run

灵绘 SHALL 在批量执行前生成可确认的执行计划，使用户能在真正提交前看到本轮执行规模、并行结构与预计耗时。

#### Scenario: 运行全部前展示执行计划

- **WHEN** 用户在灵绘中触发“运行全部”
- **THEN** 系统 MUST 在真正开始执行前展示当前工作流的执行计划
- **AND** 计划中 MUST 包含目标节点规模、依赖补跑范围、执行波次数与最大并行度
- **AND** 用户确认后系统才开始真正执行

#### Scenario: 运行选中前展示执行计划

- **WHEN** 用户在灵绘中触发“运行选中”或执行工作流块
- **THEN** 系统 MUST 基于解析后的目标节点生成执行计划
- **AND** 计划中 MUST 展示本轮实际会执行的节点而不是仅展示原始选中项

### Requirement: Execution Plan Summarizes Duration, Bottlenecks And Cost Availability

灵绘 SHALL 在执行计划中给出预估时长、瓶颈节点和成本可估状态，避免用户在复杂工作流上盲跑。

#### Scenario: 基于历史运行与波次估算总耗时

- **WHEN** 系统为一组目标节点生成执行计划
- **THEN** 系统 MUST 基于节点历史运行时长或节点类型兜底估算每个执行波次的时长
- **AND** MUST 生成整轮执行的总耗时估算
- **AND** MUST 标记本轮的瓶颈节点

#### Scenario: 当前缺少稳定价格元数据

- **WHEN** 系统当前无法从运行时上下文中获得稳定的 provider 定价信息
- **THEN** 执行计划 MUST 明确显示当前成本暂不可估
- **AND** MUST 不得伪造价格数字
