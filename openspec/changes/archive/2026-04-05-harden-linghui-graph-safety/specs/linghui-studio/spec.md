## ADDED Requirements

### Requirement: Workflow Cycle Detection

灵绘 SHALL 在执行工作流前显式检测待执行子图中的循环依赖。

#### Scenario: 循环依赖图执行失败

- **WHEN** 待执行节点及其依赖形成了有向环
- **THEN** 系统 MUST 阻止执行
- **AND** MUST 返回明确的循环依赖错误

### Requirement: Explicit RF Type Mapping

灵绘 SHALL 使用显式映射表完成 RF 节点类型和灵绘节点类型之间的转换。

#### Scenario: 合法类型双向转换

- **WHEN** 系统在 RF 类型和灵绘节点类型之间转换
- **THEN** 已知节点类型 MUST 被稳定地双向映射

#### Scenario: 边界类型输入

- **WHEN** 系统收到未知或格式异常的 RF 类型字符串
- **THEN** 系统 MUST 使用稳定、可预测的回退结果
- **AND** MUST NOT 通过宽松字符串替换误判为其他合法节点类型
