# script-processing (delta)

## MODIFIED Requirements

### Requirement: Script to Shot List (核心)
系统 SHALL 使用项目 `styleSnapshot` 完成分镜拆解与分镜提示词生成。

#### Scenario: 分镜提示词生成包含角色/场景/道具引用
- **WHEN** 系统为 Shot 生成 `imagePrompt` 或 `videoPrompt`
- **THEN** 生成逻辑 MUST 同时考虑分镜已选择的角色、场景与道具
- **AND** 输出提示词 SHOULD 包含对这些资产的显式引用（使用 `@char_*` / `@scene_*` / `@prop_*`）
- **AND** 输出提示词 SHALL 仅描述可见客观画面，不复述剧情与背景设定

#### Scenario: 分镜提示词中的 @mentions 可解析与回写
- **GIVEN** 分镜提示词中包含 `@char_*` / `@scene_*` / `@prop_*`
- **WHEN** 系统解析提示词进行资产同步
- **THEN** 解析结果 MUST 能与项目资产的 ID 对齐并回写到分镜的资产选择（characters/scenes/props）

