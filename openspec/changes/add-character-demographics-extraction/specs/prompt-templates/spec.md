## MODIFIED Requirements
### Requirement: TTI Prompt Templates
系统 SHALL 提供可配置的 TTI 提示词模板。

#### Scenario: 角色提取模板要求结构化人口属性
- **WHEN** 使用默认 `character_extraction` 模板提取角色
- **THEN** 模板 MUST 明确要求输出 `name`、`age`、`gender`、`role`、`appearance`、`description`
- **AND** `appearance` 只能描述客观外貌、服装、材质、配色和体态
- **AND** `description` 不得替代 `appearance` 承担视觉字段职责
