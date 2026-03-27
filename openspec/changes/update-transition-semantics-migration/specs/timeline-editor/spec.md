## ADDED Requirements

### Requirement: Transition Cut-Point Affordance
系统 SHALL 在时间线中提供最小 cut-point-first 转场入口与状态呈现。

#### Scenario: Show transition presence at a cut point
- **GIVEN** 两个相邻 clip 之间存在合法 `fade` 转场
- **WHEN** 用户查看时间线
- **THEN** 系统 SHALL 在对应 cut point 呈现可感知的转场接缝、标记或占位

#### Scenario: Select existing transition from timeline
- **GIVEN** 时间线 cut point 上存在转场
- **WHEN** 用户选择该 cut point 的转场
- **THEN** 系统 SHALL 允许用户进入该转场的最小编辑状态

### Requirement: Minimum Transition Editing Flow
系统 SHALL 支持 Phase 1 所需的最小转场操作路径。

#### Scenario: Add transition from timeline cut point
- **GIVEN** 同一轨道上两个相邻 clip 共享一个合法 cut point 且当前不存在转场
- **WHEN** 用户在该 cut point 执行添加转场操作
- **THEN** 系统 SHALL 创建该 cut point 对应的轨道级 `fade` 转场关系
- **AND** 时间线状态 SHALL 更新为有转场状态

#### Scenario: Remove transition from timeline flow
- **GIVEN** 一个 cut point 上存在转场
- **WHEN** 用户执行删除操作
- **THEN** 系统 SHALL 删除该轨道级转场关系
- **AND** 时间线状态 SHALL 恢复为无转场状态

#### Scenario: Edit transition duration from minimum UI
- **GIVEN** 一个合法 `fade` 转场已存在
- **WHEN** 用户通过时间线中的最小编辑入口修改 duration
- **THEN** 系统 SHALL 更新该转场 relation 的 duration
- **AND** 系统 SHALL NOT 引入 clip-owned transition truth

### Requirement: Phase 1 UI Scope Limit
系统 SHALL 将时间线转场 UI 限制在 Phase 1 最小范围内。

#### Scenario: Exclude Phase 2 workflow controls
- **GIVEN** 当前系统处于 Phase 1 转场能力范围
- **WHEN** 定义时间线转场 UI 需求
- **THEN** 系统 SHALL NOT 要求 default transition、quick add、batch apply 或多选批量编辑能力作为本次变更范围
