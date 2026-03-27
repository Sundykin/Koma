## ADDED Requirements

### Requirement: Grid Shot Prompt Generation
`ShotPromptService` MUST 提供 `generateGridShotPrompt()` 方法，在九宫格模式下将单个 Shot 的剧本内容扩展为 9 个连续画面的 imagePrompt。

该方法接收单个 Shot + 项目资产信息，使用 `grid_shot_prompt_generation` 模板调用 LLM。LLM 将该 Shot 的 `scriptContent` 展开为 9 个具有叙事推进关系的连续画面（镜头01~镜头09），包含景别变化、视角切换、角色连续动作。结果整体写回该 Shot 的 `imagePrompt` 字段。

#### Scenario: 九宫格提示词生成
- **WHEN** 对 `imageMode === 'grid'` 的 Shot 触发提示词生成
- **THEN** 调用 `generateGridShotPrompt()` 将该 Shot 的 scriptContent 扩展为 9 条连续画面描述
- **THEN** 9 条画面之间有叙事推进关系和景别变化
- **THEN** 结果整体写入该 Shot 的 `imagePrompt`

#### Scenario: 批量生成时按 imageMode 分流
- **WHEN** `batchGenerateShotPrompts()` 处理 `imageMode === 'grid'` 的 Shot
- **THEN** 调用 `generateGridShotPrompt()` 而非 `generateDualShotPrompts()`
- **THEN** `imageMode === 'normal'` 的 Shot 仍走原流程不变

#### Scenario: 九宫格视频提示词不变
- **WHEN** 九宫格模式下的 Shot 需要生成 videoPrompt
- **THEN** 仍使用现有 `shot_video_prompt_generation` 模板生成 videoPrompt
- **THEN** 视频提示词生成流程不受 imageMode 影响

### Requirement: Storyboard Image Mode Switch
分镜页面 MUST 提供「普通模式」和「九宫格模式」的切换入口。

支持批量切换所有 Shot 的 `imageMode`，也支持单个 Shot 独立切换。已生成的媒体资产（图片、视频）MUST NOT 被清除。

#### Scenario: 批量切换到九宫格模式
- **WHEN** 用户在分镜工具栏点击「九宫格模式」
- **THEN** 所有 Shot 的 `imageMode` 更新为 `'grid'`
- **THEN** 已生成的单镜头图片和视频保留不丢失

#### Scenario: 批量切换到普通模式
- **WHEN** 用户在分镜工具栏点击「普通模式」
- **THEN** 所有 Shot 的 `imageMode` 更新为 `'normal'`
- **THEN** 已生成的九宫格图片保留在 `media.gridImage` 不丢失

#### Scenario: 单个 Shot 独立切换模式
- **WHEN** 用户在单个 ShotCard 上切换 imageMode
- **THEN** 仅该 Shot 的 `imageMode` 更新
- **THEN** 其他 Shot 不受影响
