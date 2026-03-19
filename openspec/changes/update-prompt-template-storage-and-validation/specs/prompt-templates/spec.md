## ADDED Requirements

### Requirement: Prompt Template Persistence
系统 SHALL 将自定义 Prompt 模板 overrides 作为全局设置的一部分进行存储。

#### Scenario: Template overrides saved in settings
- **WHEN** 用户在设置页面保存自定义 Prompt 模板
- **THEN** 系统 MUST 将 override 保存到 `settings.json.promptTemplates`
- **AND** override SHALL 只保存自定义文本与必要元数据，不复制完整默认模板定义

### Requirement: Prompt Template Variable Validation
系统 SHALL 对 Prompt 模板执行严格的变量校验。

#### Scenario: Reject unknown variables on save
- **WHEN** 用户保存包含未声明变量的模板
- **THEN** 系统 MUST 拒绝保存
- **AND** 返回未知变量列表

#### Scenario: Reject missing required variables on save
- **WHEN** 用户保存缺失必需变量的模板
- **THEN** 系统 MUST 拒绝保存
- **AND** 返回缺失变量列表

#### Scenario: Fail runtime resolution when placeholders remain
- **WHEN** 系统解析模板后仍存在未替换的 `{{variable}}`
- **THEN** 系统 MUST 中断 AI 调用
- **AND** 日志中 MUST 记录模板 ID 与缺失变量信息

### Requirement: ITV Prompt Templates
系统 SHALL 为 ITV 生成链路提供可配置的 Prompt 模板。

#### Scenario: Character motion template
- **WHEN** 生成角色预览视频
- **THEN** 使用 `itv_character_motion` 模板
- **AND** 模板包含 `stylePrefix`, `characterName`, `action` 变量

#### Scenario: Prop motion template
- **WHEN** 生成道具预览视频
- **THEN** 使用 `itv_prop_motion` 模板
- **AND** 模板包含 `stylePrefix`, `description`, `motion` 变量

### Requirement: Runtime Template Coverage
系统 SHALL 在实际媒体生成链路中消费对应 Prompt 模板，而不是退回到硬编码提示词。

#### Scenario: Shot image fallback uses template
- **WHEN** 分镜图片渲染时不存在已定稿的 `shot.imagePrompt`
- **THEN** 系统 MUST 使用 `tti_shot_image` 模板构建 fallback prompt

#### Scenario: Finalized shot prompt remains source of truth
- **WHEN** 分镜已经保存 `shot.imagePrompt` 或 `shot.videoPrompt`
- **THEN** 渲染阶段 MUST 继续使用已保存的定稿 prompt
- **AND** 修改模板 SHALL 不自动重写历史分镜 prompt
