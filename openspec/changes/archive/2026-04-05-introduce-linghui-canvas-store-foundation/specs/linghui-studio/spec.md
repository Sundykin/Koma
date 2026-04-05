## ADDED Requirements

### Requirement: Shared Canvas Interaction State

灵绘画布 SHALL 通过共享状态容器提供编辑选中、工具态与临时交互状态，确保不同交互模块读取到一致的当前画布状态。

#### Scenario: 编辑选中与工具态保持一致

- **WHEN** 用户在画布中打开某个节点编辑器或切换节点工具面板
- **THEN** 选择状态与当前激活工具 MUST 来自同一份共享画布状态
- **AND** 当节点不再处于当前编辑选中时，相关工具态 MUST 被清理

#### Scenario: 重置临时画布状态

- **WHEN** 画布执行本地 UI 重置
- **THEN** 系统 MUST 清理编辑选中、工具态、分组框与 grid-split 临时选择
- **AND** 当前画布模式和其他持久的本地偏好 MUST 保持不变
