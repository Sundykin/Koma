## ADDED Requirements

### Requirement: Executable Linghui Agent Node

灵绘 SHALL 提供可执行的 `linghui/agent` 节点，使工作流中的节点可以触发 Agent 推理与工具调用，并输出文本结果给下游节点消费。

#### Scenario: 创建并运行 agent 节点

- **WHEN** 用户在灵绘画布中创建一个 agent 节点并填写提示词后执行
- **THEN** 系统 MUST 调用 Agent 执行链路而不是普通 LLM 文本生成链路
- **AND** 节点执行完成后 MUST 产出文本结果
- **AND** 该文本结果 MUST 可以继续作为下游文本输入被其他节点消费

#### Scenario: 消费上游文本与图片参考

- **WHEN** agent 节点连接了上游文本节点或图片节点后执行
- **THEN** 系统 MUST 将上游文本内容并入当前 Agent 输入
- **AND** MUST 将上游图片作为图片参考发送给 Agent

### Requirement: Agent Tooling And Trace Metadata

灵绘 SHALL 允许 agent 节点配置工具白名单，并将推理与工具调用轨迹保存在节点结果 metadata 中。

#### Scenario: 仅启用选中的工具

- **WHEN** 用户在 agent 节点中只选择了部分工具
- **THEN** 系统 MUST 仅向当前 Agent 执行暴露这些工具
- **AND** 未被选中的工具 MUST 不可被当前节点调用

#### Scenario: 保存 reasoning 与工具轨迹

- **WHEN** agent 节点执行过程中产生 reasoning、工具调用或工具结果
- **THEN** 系统 MUST 将这些轨迹写入当前节点结果的 metadata
- **AND** 最终文本结果 MUST 继续保持可读的最终回答内容

### Requirement: Agent Execution Safety Boundaries

灵绘 SHALL 为 agent 节点的首版执行能力提供显式边界和失败提示，避免静默回退或无限循环。

#### Scenario: LLM 渠道不兼容 chat agent

- **WHEN** 用户为 agent 节点选择了当前 chat agent 不支持映射的 LLM 渠道
- **THEN** 系统 MUST 阻止该节点执行
- **AND** MUST 明确提示当前渠道无法用于 Agent 节点

#### Scenario: 超过最大迭代次数

- **WHEN** agent 节点执行过程中超过配置的最大迭代次数
- **THEN** 系统 MUST 主动取消当前 Agent 执行
- **AND** MUST 将该节点标记为失败并告知用户超过迭代上限
