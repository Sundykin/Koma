## MODIFIED Requirements

### Requirement: Jianying Export
系统 SHALL 支持导出剪映草稿格式，并正确处理 Phase 1 转场语义。

#### Scenario: Export fade transition from track-level relations
- **GIVEN** 一个项目在同一轨道相邻 clip 之间包含合法的 `fade` 转场关系
- **WHEN** 用户导出剪映草稿
- **THEN** 系统 SHALL 从 `Track.transitions[]` 读取转场信息
- **AND** 系统 SHALL 按统一 overlap 语义映射该 `fade` 转场
- **AND** 导出结果 SHALL 保持与已解析时间布局一致的 clip/transition 关系

#### Scenario: Do not require legacy clip-owned transition writes for export
- **GIVEN** 一个新项目仅使用 `Track.transitions[]` 保存转场
- **WHEN** 用户导出剪映草稿
- **THEN** 系统 SHALL 正确导出转场
- **AND** 系统 SHALL NOT 依赖 `Clip.transition` 作为导出前提

### ADDED Requirements

### Requirement: Transition Capability Feedback
系统 SHALL 基于轨道级转场真值输出明确的导出能力反馈。

#### Scenario: Report supported fade export
- **GIVEN** 一个项目只包含 Phase 1 支持范围内的 `fade` 转场
- **WHEN** 系统执行剪映草稿导出路径的能力检查
- **THEN** 系统 SHALL 将剪映草稿导出路径标记为支持
- **AND** 支持结果 SHALL 与真实导出行为一致

#### Scenario: Report unsupported transition scenario without silent fallback
- **GIVEN** 一个项目包含当前导出路径不支持的转场场景或非法转场关系
- **WHEN** 系统执行导出能力检查或导出请求
- **THEN** 系统 SHALL 明确反馈不支持
- **AND** 系统 SHALL NOT 以 silent fallback 方式假装已正确支持该转场场景
