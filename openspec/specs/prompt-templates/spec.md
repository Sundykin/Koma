# prompt-templates Specification

## Purpose
TBD - created by archiving change unify-prompt-and-debug-logging. Update Purpose after archive.
## Requirements
### Requirement: TTI Prompt Templates
系统 SHALL 提供可配置的 TTI 提示词模板。

#### Scenario: 角色定妆照模板
- **WHEN** 生成角色定妆照
- **THEN** 使用 `tti_character_costume` 模板
- **AND** 模板包含三视图规范（turnaround sheet, front/side/back view）
- **AND** 模板包含 `stylePrefix` 和 `appearance` 变量

#### Scenario: 场景预览图模板
- **WHEN** 生成场景预览图
- **THEN** 使用 `tti_scene_preview` 模板
- **AND** 模板包含 `stylePrefix`, `description`, `location`, `time`, `mood` 变量

#### Scenario: 道具参考图模板
- **WHEN** 生成道具参考图
- **THEN** 使用 `tti_prop_reference` 模板
- **AND** 模板包含 `stylePrefix`, `description`, `type` 变量

#### Scenario: 分镜图片模板
- **WHEN** 生成分镜图片
- **THEN** 使用 `tti_shot_image` 模板
- **AND** 模板包含 `stylePrefix`, `description`, `shotType`, `emotion` 变量

### Requirement: AI Call Debug Logging
系统 SHALL 打印所有 AI 调用的完整提示词。

#### Scenario: TTI 调用日志
- **WHEN** 调用 TTI 服务生成图片
- **THEN** 在控制台打印完整提示词
- **AND** 打印调用参数（width, height 等）
- **AND** 日志格式为 `[AI:TTI] ========== {provider} ==========`

#### Scenario: ITV 调用日志
- **WHEN** 调用 ITV 服务生成视频
- **THEN** 在控制台打印图片源和运动提示词
- **AND** 打印调用参数（duration, aspectRatio 等）
- **AND** 日志格式为 `[AI:ITV] ========== {provider} ==========`

#### Scenario: LLM 调用日志
- **WHEN** 调用 LLM 服务
- **THEN** 在控制台打印完整提示词
- **AND** 打印 system prompt（如有）
- **AND** 日志格式为 `[AI:LLM] ========== {provider} ==========`

#### Scenario: TTS 调用日志
- **WHEN** 调用 TTS 服务生成语音
- **THEN** 在控制台打印文本内容和语音 ID
- **AND** 打印调用参数（rate, pitch 等）
- **AND** 日志格式为 `[AI:TTS] ========== {provider} ==========`

