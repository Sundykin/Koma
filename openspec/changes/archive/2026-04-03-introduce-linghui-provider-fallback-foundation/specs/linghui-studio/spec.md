## ADDED Requirements

### Requirement: Capability-Aware Provider Fallback For Image And Video Execution

灵绘 SHALL 为图片与视频节点执行生成同能力 Provider fallback 计划，并在首选 Provider 不可用或运行失败时自动切换到备选。

#### Scenario: 首选当前选择并限制候选范围

- **WHEN** 系统准备执行图片或视频生成请求
- **THEN** 系统 MUST 优先尝试节点显式选择的 Provider，若未显式选择则优先尝试当前默认 Provider
- **AND** MUST 仅从同一媒体类别下、已启用且支持当前 capability 的其他 Provider / model 中选择备选
- **AND** MUST 对本轮总尝试次数设置上限，避免无限重试

#### Scenario: Provider 在运行阶段失败后自动切换

- **WHEN** 当前图片或视频 Provider 创建失败、校验失败、任务提交失败或异步轮询失败 / 超时
- **THEN** 系统 MUST 自动切换到下一个备选 Provider 重试同一执行请求
- **AND** 在备选耗尽前 MUST 不立即终止当前节点执行

### Requirement: Provider Fallback Outcomes Stay Transparent

灵绘 SHALL 在 Provider fallback 成功或失败后保留可追踪的尝试摘要，避免自动切换变成黑盒。

#### Scenario: 备选 Provider 接管成功

- **WHEN** 节点在首选 Provider 失败后由备选 Provider 成功完成
- **THEN** 系统 MUST 在节点结果 metadata 中记录本轮尝试过的 Provider 列表、失败原因摘要与最终成功 Provider
- **AND** MUST 使用最终成功 Provider 的结果继续写回节点

#### Scenario: 全部备选耗尽

- **WHEN** 当前执行请求的所有 Provider 尝试都失败
- **THEN** 系统 MUST 将该节点标记为失败
- **AND** MUST 在失败信息中包含已尝试 Provider 摘要与最后一次错误
