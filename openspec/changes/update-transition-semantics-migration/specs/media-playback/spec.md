## ADDED Requirements

### Requirement: Transition-Aware Preview Playback
系统 SHALL 在预览播放中识别并消费 Phase 1 转场语义。

#### Scenario: Detect active fade transition during overlap
- **GIVEN** 同一轨道两个相邻 clip 之间存在合法 `fade` 转场
- **AND** 当前播放时间落在该转场的 overlap 区间内
- **WHEN** 预览播放器计算当前活跃内容
- **THEN** 系统 SHALL 将该转场识别为 active transition
- **AND** SHALL 同时识别 from/to clip 的最小过渡消费关系

#### Scenario: Ignore transition outside overlap interval
- **GIVEN** 一个合法 `fade` 转场存在
- **WHEN** 当前播放时间位于该转场 overlap 区间之外
- **THEN** 系统 SHALL NOT 将该转场视为 active transition

### Requirement: Minimum Fade Preview Behavior
系统 SHALL 在预览中提供最小可用的 `fade` 渲染行为。

#### Scenario: Render minimum fade effect in preview
- **GIVEN** 当前播放时间位于一个合法 `fade` 转场的 overlap 区间
- **WHEN** 预览播放器渲染当前帧
- **THEN** 系统 SHALL 呈现最小可感知的 fade 过渡效果
- **AND** 该效果 SHALL 基于统一 transition 时间语义而非独立硬切推断逻辑

### Requirement: Shared Timing Semantics Across Preview and Export
系统 SHALL 让预览与导出共享转场时间语义。

#### Scenario: Keep preview timing aligned with export semantics
- **GIVEN** 一个项目包含 Phase 1 合法 `fade` 转场
- **WHEN** 预览与受支持导出路径分别消费该转场
- **THEN** 两者 SHALL 基于同一 overlap 语义解释 transition duration 与活跃区间
- **AND** 系统 SHALL NOT 为预览与导出分别维护彼此冲突的时间真值
