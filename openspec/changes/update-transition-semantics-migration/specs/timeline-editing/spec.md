## ADDED Requirements

### Requirement: Cut-Point Transition Semantics
系统 SHALL 将 Phase 1 转场限制为同一轨道相邻 clip 之间的 cut-point 关系。

#### Scenario: Add legal track transition
- **GIVEN** 同一轨道上两个相邻 clip 共享一个 cut point
- **WHEN** 用户添加转场
- **THEN** 系统 SHALL 创建一个指向这两个 clip 的轨道级转场关系
- **AND** 该关系 SHALL 使用 `Track.transitions[]` 作为编辑真值

#### Scenario: Reject non-adjacent or cross-track transition relation
- **GIVEN** 两个 clip 不相邻或不在同一轨道
- **WHEN** 用户尝试建立 Phase 1 转场
- **THEN** 系统 SHALL 拒绝创建该转场关系

### Requirement: Transition Lifecycle on Timeline Mutation
系统 SHALL 在时间线结构变化破坏邻接关系时使相关转场失效。

#### Scenario: Remove transition when referenced clip is deleted
- **GIVEN** 一个转场引用了某个 clip
- **WHEN** 该 clip 被删除
- **THEN** 系统 SHALL 删除关联的转场关系

#### Scenario: Remove transition when clip movement breaks adjacency
- **GIVEN** 一个转场存在于两个相邻 clip 之间
- **WHEN** 用户移动其中一个 clip 且原有相邻关系被破坏
- **THEN** 系统 SHALL 删除原转场关系
- **AND** 系统 SHALL NOT 自动重绑到新的邻接 clip

#### Scenario: Remove transition when insertion breaks cut point
- **GIVEN** 一个转场存在于某个 cut point
- **WHEN** 用户插入 clip 使该 cut point 不再存在
- **THEN** 系统 SHALL 删除原转场关系

#### Scenario: Preserve transition when clip content is replaced without identity change
- **GIVEN** 一个 clip 参与了合法转场关系
- **WHEN** 该 clip 的内容被替换但 clip identity 保持不变
- **THEN** 系统 MAY 保留原转场关系

### Requirement: Transition Duration Semantics
系统 SHALL 将 Phase 1 转场 duration 解释为 cut-point overlap 时长。

#### Scenario: Edit fade duration as overlap duration
- **GIVEN** 一个合法的 `fade` 转场已存在
- **WHEN** 用户修改该转场 duration
- **THEN** 系统 SHALL 将新的 duration 解释为两个相邻 clip 的 overlap 时长
- **AND** 后续 timeline、preview 与 export SHALL 基于该语义消费转场
