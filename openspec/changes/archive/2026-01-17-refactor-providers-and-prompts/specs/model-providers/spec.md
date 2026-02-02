# model-providers Spec Delta

## ADDED Requirements

### Requirement: LLM Provider Directory Structure
系统 SHALL 将 LLM Provider 组织在独立的 `providers/llm/` 目录中。

#### Scenario: LLM 目录结构
- **GIVEN** providers 目录结构
- **WHEN** 开发者需要添加新的 LLM Provider
- **THEN** 应在 `providers/llm/` 目录下创建
- **AND** 继承 `LLMProvider` 接口
- **AND** 在 `providers/llm/index.ts` 中注册

### Requirement: TTI Provider Directory Structure
系统 SHALL 将 TTI Provider 组织在独立的 `providers/tti/` 目录中。

#### Scenario: TTI 目录结构
- **GIVEN** providers 目录结构
- **WHEN** 开发者需要添加新的 TTI Provider
- **THEN** 应在 `providers/tti/` 目录下创建
- **AND** 继承 `TTIProvider` 接口
- **AND** 在 `providers/tti/index.ts` 中注册

### Requirement: Provider Directory Consistency
系统 SHALL 保持所有 Provider 目录结构一致。

#### Scenario: 统一目录结构
- **GIVEN** 四类 Provider（LLM, TTI, ITV, TTS）
- **THEN** 每类 Provider 都有独立目录（llm/, tti/, itv/, tts/）
- **AND** 每个目录包含 index.ts（工厂函数）和 types.ts（类型定义）
- **AND** 根目录 providers/index.ts 统一导出所有 Provider
