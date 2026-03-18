## Context
当前风格系统存在三个问题：
- 风格来源不唯一：项目级字段、全局自定义预设、遗留全局 stylePrompts 并存
- 运行时读源不一致：不同工作流分别从项目、设置、静态预设中读取
- 注入时机不一致：有些在提示词生成阶段注入，有些在渲染阶段再次注入

这使得风格链路不稳定，也无法保证项目在后续生成中的结果一致性。

## Goals / Non-Goals
- Goals:
  - 将风格来源统一为单一“全局风格目录”
  - 项目仅保存所选风格的不可变快照
  - 后续所有 LLM/TTI/ITV 工作流只读项目快照
  - 消除 `settings.stylePrompts` 在项目生成主链路中的作用
  - 明确风格注入边界，避免重复追加
- Non-Goals:
  - 不处理历史项目迁移或兼容
  - 不保留项目级自由文本风格输入作为长期模型
  - 不重算历史已生成资源

## Decisions
- Decision: 项目风格只允许从全局风格目录选择
  - Why: 这样才能保证来源统一，避免“项目临时文本风格”和“全局预设风格”两条链并行
  - Alternatives considered:
    - 保留项目级 `stylePrompt` 自由输入: 实现快，但来源继续分叉
    - 让项目直接引用全局 preset 而不快照: 预设后续被修改时会破坏项目结果复现

- Decision: 项目保存 `styleSnapshot`
  - Snapshot 应至少包含：
    - `id`
    - `name`
    - `description`
    - `ttiStylePrefix`
    - `llmPromptSuffix`
    - `sourceType` (`builtin` | `custom`)
    - `sourcePresetId`
    - `createdAt`
  - Why: 项目后续生成只读快照，不再依赖全局设置的实时值

- Decision: 建立统一风格解析入口
  - 新增 `resolveProjectStyleSnapshot(project)` 或等价 helper
  - 所有工作流只消费解析结果，不直接读取 `THEME_PRESETS`、`customThemePresets`、`settings.stylePrompts`

- Decision: 风格注入采用“两阶段单次注入”
  - LLM 阶段:
    - 剧本生成/润色/解析/分镜拆解使用 `llmPromptSuffix`
    - 分镜提示词生成使用 `ttiStylePrefix` 作为视觉风格输入
  - 渲染阶段:
    - 如果镜头已有 `imagePrompt/videoPrompt`，直接使用，不重复加风格
    - 只有 fallback 到自动拼 prompt 时，才从项目快照注入 `ttiStylePrefix`
  - Why: 这样可避免“提示词生成一次 + 媒体渲染再来一次”的双重风格问题

## Risks / Trade-offs
- 全局自定义风格需要先在设置页创建，再在项目里选择，减少了项目创建时的随手输入自由度
  - Mitigation: 保证项目创建与项目设置里都能快速打开全局风格管理
- 项目快照与全局预设脱钩后，更新全局预设不会自动影响既有项目
  - Mitigation: 项目显式重新选择风格时刷新快照，这是预期行为
- 去掉 `settings.stylePrompts` 后，分镜页相关调用点较多
  - Mitigation: 先引入统一 helper，再批量替换调用点

## Migration Plan
本次变更不做历史项目兼容和迁移。

仅约束：
- 新创建项目必须带有合法 `styleSnapshot`
- 更新风格后的项目必须覆盖 `styleSnapshot`
- 未带快照的旧项目不在本次支持范围内

## Open Questions
- 项目风格修改入口放在 `ProjectOverview` 还是单独项目设置面板，需结合现有 UI 选一个最小改动落点
