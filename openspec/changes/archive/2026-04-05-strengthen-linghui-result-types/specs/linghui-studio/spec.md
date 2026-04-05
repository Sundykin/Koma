## ADDED Requirements

### Requirement: Tagged Linghui Node Results

灵绘 SHALL 使用以 `kind` 为判别字段的结构化节点结果契约，而不是“所有字段都可选”的宽泛结果对象。

#### Scenario: 文本与分镜结果具备必需文本字段

- **WHEN** 文本节点或脚本节点输出运行结果
- **THEN** `text` 结果 MUST 包含非空 `text`
- **AND** `storyboard` 结果 MUST 包含 `text` 和结构化 `shots`

#### Scenario: 媒体结果具备必需主产物字段

- **WHEN** 图片、视频或音频节点输出运行结果
- **THEN** 单产物结果 MUST 包含与其 `kind` 对应的 `primary`
- **AND** 多图结果 MUST 包含 `primary` 和 `items`

#### Scenario: 静态结果与运行结果遵循同一契约

- **WHEN** 系统解析导入节点或手动节点的静态结果
- **THEN** 返回结果 MUST 与运行态结果使用相同的 `kind` 结构
- **AND** 下游消费者 MUST 无需依赖“静态结果特判”访问核心字段
