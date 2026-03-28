## MODIFIED Requirements
### Requirement: Character Extraction
系统 SHALL 从剧本中提取角色信息。

#### Scenario: 自动识别角色
- **WHEN** 剧本导入或生成后
- **THEN** 系统调用 LLM 提取角色列表
- **AND** 每个角色 SHALL 包含 `name`、`age`、`gender`、`role`、`appearance`、`description`
- **AND** `appearance` 仅包含客观可见外观
- **AND** 提示用户补充角色视觉参考

### Requirement: Structured Output Schema
系统 SHALL 使用 JSON Schema 约束 LLM 输出格式。

#### Scenario: 角色提取 Schema
- **WHEN** 调用 LLM 提取角色
- **THEN** 使用预定义的 JSON Schema 约束输出
- **AND** Schema MUST 定义 `age` 和 `gender` 字段
- **AND** 解析失败时进行重试或降级处理
