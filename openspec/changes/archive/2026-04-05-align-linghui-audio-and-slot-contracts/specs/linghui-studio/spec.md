## ADDED Requirements

### Requirement: Effective Slot Connections Only

灵绘 SHALL 阻止用户创建那些执行层不会消费的无效节点连接。

#### Scenario: 图片不能连接到无效图片槽位

- **WHEN** 用户尝试把图片结果连接到 text / audio / script 节点的图片参考槽位
- **THEN** 系统 MUST 阻止该连接
- **AND** MUST 明确告知当前节点不会消费该图片输入

### Requirement: Audio Node Voice Selection

灵绘 SHALL 允许用户为音频节点显式选择 TTS 音色，而不是始终依赖 provider 默认值。

#### Scenario: 用户显式选择音色

- **WHEN** 用户在音频节点中选择了一个 `voiceId`
- **THEN** 系统 MUST 在后续 TTS 请求中优先使用该 `voiceId`

#### Scenario: 未选择音色时回退默认值

- **WHEN** 用户没有为音频节点选择音色
- **THEN** 系统 MAY 回退到 provider 默认音色或第一个可用音色
- **AND** 节点仍然 MUST 可正常执行
