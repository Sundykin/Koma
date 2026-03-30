## MODIFIED Requirements
### Requirement: TTI Prompt Templates
系统 SHALL 提供可配置的 TTI 提示词模板。

#### Scenario: 角色定妆照模板
- **WHEN** 生成角色定妆照
- **THEN** 使用 `tti_character_costume` 模板
- **AND** 模板包含 `stylePrefix` 和 `appearance` 变量
- **AND** 模板 MUST 只描述角色的客观可见外观、服装、材质、配色与体态
- **AND** 模板 MUST NOT 包含剧情摘要、心理活动或因果解释

#### Scenario: 场景预览图模板
- **WHEN** 生成场景预览图
- **THEN** 使用 `tti_scene_preview` 模板
- **AND** 模板包含 `stylePrefix`, `description`, `location`, `time`, `mood` 变量
- **AND** 模板 MUST 将 `mood` 解释为可见光线、色调、天气或空间状态
- **AND** 模板 MUST NOT 直接复述剧情事件

#### Scenario: 道具参考图模板
- **WHEN** 生成道具参考图
- **THEN** 使用 `tti_prop_reference` 模板
- **AND** 模板包含 `stylePrefix`, `description`, `type` 变量
- **AND** 模板 MUST 只描述道具的形状、材质、结构、颜色与表面细节

#### Scenario: 分镜图片模板
- **WHEN** 生成分镜图片
- **THEN** 使用 `tti_shot_image` 模板
- **AND** 模板包含 `stylePrefix`, `description`, `shotType`, `emotion` 变量
- **AND** 模板 MUST 将 `description` 视为当前镜头的可见事实、人物行为、空间关系与物理细节
- **AND** 模板 MUST NOT 将剧情原文直接改写为画面描述

### Requirement: Prompt Template Variable Metadata
系统 MUST 为内置提示词模板提供结构化变量元数据。

#### Scenario: Prompt Studio renders variable metadata
- **WHEN** 用户在设置中查看任意内置模板
- **THEN** 系统 MUST 展示每个变量的名称、含义、数据格式与示例

#### Scenario: Template validation uses variable metadata
- **WHEN** 系统校验或解析模板
- **THEN** 系统 MUST 基于变量元数据中的变量名执行校验
- **AND** 额外的展示字段 MUST NOT 影响模板渲染结果

### Requirement: Objective Prompt Generation Templates
系统 MUST 为图片提示词生成和视频提示词生成提供客观视觉规则。

#### Scenario: Shot image prompt generation stays objective
- **WHEN** 系统使用 `shot_image_prompt_generation` 生成分镜图片提示词
- **THEN** 模板 MUST 要求输出只描述镜头内可直接观察到的角色外观、姿态、动作、构图、光线与环境
- **AND** 模板 MUST NOT 要求模型复述剧情、心理活动或事件因果

#### Scenario: Shot video prompt generation uses time slices
- **WHEN** 系统使用 `shot_video_prompt_generation` 或 `itv_shot_video` 生成分镜视频提示词
- **THEN** 模板 MUST 要求输出包含 `[start,end]秒` 格式的时间片段
- **AND** 每个时间片段 MUST 描述人物动作、镜头运动与环境变化
- **AND** 模板 MUST NOT 输出没有时间锚点的笼统动态描述
