## ADDED Requirements

### Requirement: Strict Multi-Angle Image Execution

灵绘 SHALL 将多角度图片视为严格的参考图驱动执行模式，而不是在输入不完整时静默退回普通文生图。

#### Scenario: 缺少参考图时明确失败

- **WHEN** 图片节点显式开启了多角度能力
- **AND** 当前没有连接任何上游图片参考
- **THEN** 系统 MUST 阻止执行
- **AND** MUST 返回清晰的缺失参考图错误
- **AND** MUST NOT 回退为普通文生图

#### Scenario: 多角度请求保留用户 prompt

- **WHEN** 图片节点显式开启了多角度能力
- **AND** 用户填写了主体或风格 prompt
- **THEN** 系统 MUST 在请求编译中保留用户原始 prompt
- **AND** MUST 同时附带由多角度参数生成的角度 prompt

### Requirement: Batch Image References Propagate Downstream

灵绘 SHALL 在下游消费图片参考时透传整组批量图片结果，而不是只传当前结果的单张主图。

#### Scenario: 批量图片作为下游参考

- **WHEN** 上游图片节点持有多张生成结果或导入结果
- **AND** 下游图片节点或视频节点消费该节点的图片参考
- **THEN** 系统 MUST 传递该组结果中的全部唯一图片源
- **AND** 当前选中的主图 MUST 仍然排在参考列表前面

### Requirement: Stable Script Output Contracts

灵绘 SHALL 让脚本节点在生成态和静态解析态都输出稳定的结构化结果。

#### Scenario: 自定义 system prompt 不破坏 JSON 约束

- **WHEN** 用户为脚本节点填写了自定义 `systemPrompt`
- **THEN** 系统 MUST 保留默认的 JSON 输出约束
- **AND** MUST 将用户自定义要求追加到同一 system prompt 中

#### Scenario: 手动脚本静态解析输出结构化 shots

- **WHEN** 手动脚本节点通过静态解析路径被下游节点消费
- **THEN** 系统 MUST 输出结构化 `shots`
- **AND** MUST 输出统一格式化后的脚本文本
