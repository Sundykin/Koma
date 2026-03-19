## ADDED Requirements

### Requirement: Template-Driven Preview Video Prompts
系统 SHALL 在角色与道具预览视频生成中统一使用 Prompt 模板。

#### Scenario: Character preview video uses template
- **Given** 当前项目包含 `styleSnapshot`
- **WHEN** 用户生成角色预览视频
- **THEN** 系统 MUST 使用 `itv_character_motion` 模板构建 prompt
- **AND** 系统 SHALL 将 `styleSnapshot.ttiStylePrefix` 作为 `stylePrefix` 变量输入
- **AND** 实现 MUST 不再使用硬编码角色预览 prompt

#### Scenario: Prop preview video uses template
- **Given** 当前项目包含 `styleSnapshot`
- **WHEN** 用户生成道具预览视频
- **THEN** 系统 MUST 使用 `itv_prop_motion` 模板构建 prompt
- **AND** 系统 SHALL 将项目风格与道具描述作为模板变量输入
- **AND** 实现 MUST 不再使用硬编码道具预览 prompt

### Requirement: Template-Driven Shot Image Fallback
系统 SHALL 在分镜图片渲染 fallback 中使用模板。

#### Scenario: Shot image render fallback uses template
- **Given** 分镜不存在已定稿的 `imagePrompt`
- **WHEN** 用户直接触发分镜文生图
- **THEN** 系统 MUST 使用 `tti_shot_image` 模板构建 fallback prompt
- **AND** 系统 SHALL 将项目 `styleSnapshot.ttiStylePrefix` 作为模板变量输入
