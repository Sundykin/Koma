## ADDED Requirements

### Requirement: Grid Shot Prompt Generation Template
系统 MUST 提供 `grid_shot_prompt_generation` LLM 模板，用于在九宫格模式下将单个分镜的剧本内容扩展为 9 个具有叙事推进关系的连续画面提示词。

模板变量 MUST 包含：`scriptContent`（该分镜的剧本原文）、`characters`（角色列表及外观）、`scenes`（场景列表）、`props`（道具列表）、`stylePrefix`（风格前缀）、`emotion`（情绪氛围）、`characterRefs`（可用角色引用）、`sceneRefs`（可用场景引用）、`propRefs`（可用道具引用）。

模板 MUST 要求 LLM 将该分镜的剧情点展开为 9 个连续画面（镜头01~镜头09），画面之间 MUST 具有明确的前后承接关系（连续动作、视线变化、情绪推进），MUST 包含远景/中景/近景/特写等景别变化，人物外观/服装/体型比例 MUST 保持一致，每条 MUST 包含 `@char_`、`@scene_`、`@prop_` 引用。

#### Scenario: LLM 将单个分镜扩展为 9 个连续画面
- **WHEN** 用户对一个 `imageMode === 'grid'` 的 Shot 触发提示词生成
- **THEN** 系统使用 `grid_shot_prompt_generation` 模板调用 LLM
- **THEN** LLM 将该 Shot 的 scriptContent 扩展为 9 条编号连续画面提示词
- **THEN** 9 条提示词之间有叙事推进关系和景别变化
- **THEN** 结果整体写回该 Shot 的 `imagePrompt` 字段

### Requirement: Grid Shot Image TTI Template
系统 MUST 提供 `tti_grid_shot_image` TTI 模板，用于将一个 Shot 的 9 条连续画面提示词组装为一条完整的九宫格图片生成提示词。

模板变量 MUST 包含：`stylePrefix`（风格前缀）、`shotDescription`（该分镜的剧情概述）、`gridPrompt`（已组装的 9 条镜头描述）、`resolution`（分辨率，默认 8K）、`aspectRatio`（画幅，默认 16:9）。

模板 MUST 要求生成 3×3 网格图像，每个格子的画面比例 MUST 与整体图片比例保持一致，且 MUST 严格保持人物/物体、服装和光线的一致性。

#### Scenario: 组装九宫格 TTI 提示词
- **WHEN** 一个 `imageMode === 'grid'` 的 Shot 的 imagePrompt 已生成（包含 9 条镜头描述）
- **THEN** 系统使用 `tti_grid_shot_image` 模板将 9 条描述组装为一条九宫格 TTI 提示词
- **THEN** 提示词包含 3×3 网格指令、画面比例一致性要求、角色一致性要求、分辨率和画幅参数

## MODIFIED Requirements

### Requirement: TTI Prompt Templates
系统 MUST 提供以下 TTI 提示词模板：
- 角色定妆照模板 - `tti_character_costume`，变量：`stylePrefix`, `appearance`，含三视图规范
- 场景预览图模板 - `tti_scene_preview`，变量：`stylePrefix`, `description`, `location`, `time`, `mood`
- 道具参考图模板 - `tti_prop_reference`，变量：`stylePrefix`, `description`, `type`
- 分镜图片模板 - `tti_shot_image`，变量：`stylePrefix`, `description`, `shotType`, `emotion`
- 九宫格分镜图片模板 - `tti_grid_shot_image`，变量：`stylePrefix`, `shotDescription`, `gridPrompt`, `resolution`, `aspectRatio`

#### Scenario: 分镜图片模板
- **WHEN** 分镜为普通模式（`imageMode === 'normal'`）
- **THEN** 使用 `tti_shot_image` 模板生成单镜头图片提示词

#### Scenario: 九宫格分镜图片模板
- **WHEN** 分镜为九宫格模式（`imageMode === 'grid'`）
- **THEN** 使用 `tti_grid_shot_image` 模板生成九宫格图片提示词
