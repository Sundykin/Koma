## MODIFIED Requirements

### Requirement: Timeline Persistence
系统 SHALL 完整持久化时间线编辑状态，包括轨道级转场关系数据。

#### Scenario: Save track-level transitions in new projects
- **GIVEN** 一个项目在编辑态中包含同一轨道相邻 clip 之间的 `fade` 转场
- **WHEN** 用户保存项目
- **THEN** 系统 SHALL 将转场作为 `Track.transitions[]` 持久化
- **AND** 系统 SHALL NOT 依赖 `Clip.transition` 作为新的持久化输出结构

#### Scenario: Reload project with track-level transitions
- **GIVEN** 一个项目文件包含 `Track.transitions[]`
- **WHEN** 系统加载该项目
- **THEN** 系统 SHALL 恢复相同的轨道级转场关系
- **AND** 编辑态 SHALL 将其作为唯一转场真值

### Requirement: Storage Migration
系统 SHALL 支持转场存储格式迁移。

#### Scenario: Load legacy clip-owned transition data
- **GIVEN** 一个旧项目文件仅在 `Clip.transition` 中保存转场信息
- **WHEN** 系统加载该项目
- **THEN** 系统 SHALL 兼容读取旧数据
- **AND** 系统 SHALL 将可恢复的转场关系归一化为 `Track.transitions[]` 编辑态结构
- **AND** 系统 SHALL NOT 在编辑态中持续保留双写真值

#### Scenario: Ignore invalid legacy transition relation inputs
- **GIVEN** 一个旧项目中的 `Clip.transition` 无法映射为同轨相邻 clip 的合法 cut-point 关系
- **WHEN** 系统加载该项目
- **THEN** 系统 SHALL 丢弃该非法转场输入
- **AND** 系统 SHALL 保持时间线其余内容可继续加载

### Requirement: Overlap-Aware Timeline Duration
系统 SHALL 使用转场 overlap 语义计算时间线时长。

#### Scenario: Compute track duration with overlap semantics
- **GIVEN** 一个轨道包含多个 clip 且存在合法 `fade` 转场
- **WHEN** 系统计算轨道或项目总时长
- **THEN** 系统 SHALL 以 clip 总时长减去 transition overlap 总和为基础计算可播放时长
- **AND** SHALL NOT 继续以纯硬切 end-max 逻辑作为唯一时长真值
