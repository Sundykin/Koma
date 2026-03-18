## ADDED Requirements

### Requirement: Explicit Episode Boundaries Take Precedence
系统 SHALL 在自动剧集时优先识别并使用剧本原文中已经存在的显式分集边界。

#### Scenario: 原文已包含明确分集标题
- **GIVEN** 用户导入的完整剧本中包含明确的分集边界标记（如“第104集”“104-1”）
- **WHEN** 用户触发「AI 自动剧集」
- **THEN** 系统先解析原文边界
- **AND** 按原文边界直接拆分剧集
- **AND** 不让 LLM 重新规划剧集数量

#### Scenario: 原文边界数量与目标集数冲突
- **GIVEN** 剧本原文已识别出明确分集边界
- **AND** 用户输入的目标集数与原文边界数量不一致
- **WHEN** 用户触发「AI 自动剧集」
- **THEN** 系统以原文边界数量为准
- **AND** 向用户明确说明已优先按原文分集结构拆分

### Requirement: LLM Planning Is Fallback Only
系统 SHALL 仅在原文不存在可识别的显式分集边界时，才使用 LLM 规划剧集数量和分割点。

#### Scenario: 原文无显式分集边界
- **GIVEN** 导入剧本中不存在可识别的分集边界
- **WHEN** 用户触发「AI 自动剧集」
- **THEN** 系统调用 LLM 规划剧集数量和分割点
- **AND** 若用户填写目标集数，则将其作为 LLM 输出的目标约束
- **AND** 若用户未填写目标集数，则允许 LLM 自行判断合适集数

#### Scenario: 原文无边界时补充剧集摘要
- **GIVEN** 原文不存在可识别的显式分集边界
- **WHEN** LLM 返回分割方案
- **THEN** 系统根据该方案切分原文
- **AND** 生成每集标题与摘要
- **AND** 展示给用户确认
