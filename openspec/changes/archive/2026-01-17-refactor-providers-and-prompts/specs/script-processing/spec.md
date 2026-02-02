# script-processing Spec Delta

## ADDED Requirements

### Requirement: Use Global Prompt Templates
系统 SHALL 使用全局 Prompt 模板系统进行剧本分析。

#### Scenario: 角色提取使用模板
- **WHEN** ScriptAnalysisService 执行角色提取
- **THEN** 从 `promptTemplates.ts` 加载 `character_extraction` 模板
- **AND** 使用 `fillTemplate()` 填充 `{{script}}` 变量
- **AND** 用户自定义的模板优先于默认模板

#### Scenario: 场景提取使用模板
- **WHEN** ScriptAnalysisService 执行场景提取
- **THEN** 从 `promptTemplates.ts` 加载 `scene_extraction` 模板
- **AND** 使用 `fillTemplate()` 填充变量

#### Scenario: 道具提取使用模板
- **WHEN** ScriptAnalysisService 执行道具提取
- **THEN** 从 `promptTemplates.ts` 加载 `prop_extraction` 模板
- **AND** 使用 `fillTemplate()` 填充变量

#### Scenario: 分镜生成使用模板
- **WHEN** ScriptAnalysisService 执行分镜生成
- **THEN** 从 `promptTemplates.ts` 加载 `shot_breakdown` 模板
- **AND** 使用 `fillTemplate()` 填充 `{{script}}`, `{{characters}}`, `{{scenes}}`, `{{props}}` 变量

### Requirement: Template Customization Effect
系统 SHALL 确保用户自定义模板立即生效。

#### Scenario: 用户修改模板后生效
- **GIVEN** 用户在设置页面修改了 `character_extraction` 模板
- **WHEN** 用户执行剧本分析
- **THEN** 使用用户自定义的模板内容
- **AND** 不使用硬编码的默认 Prompt

### Requirement: JSON Schema Constraint
系统 SHALL 在 Prompt 中包含 JSON Schema 约束。

#### Scenario: 输出格式约束
- **WHEN** 调用 LLM 进行实体提取
- **THEN** Prompt 末尾包含 JSON Schema 定义
- **AND** Schema 定义在代码中（非模板中），确保输出格式一致性
