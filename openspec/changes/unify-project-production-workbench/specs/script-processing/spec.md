## MODIFIED Requirements

### Requirement: Progress Feedback

系统 SHALL 在 LLM 处理时显示进度，并将任务状态同步到统一项目生产工作台。

#### Scenario: 分镜生成进度

- **WHEN** 分镜拆解进行中
- **THEN** 显示处理阶段（角色提取/场景提取/道具提取/分镜生成）
- **AND** 显示当前步骤的等待确认状态
- **AND** 支持取消操作
- **AND** 错误时显示具体原因并支持重试
- **AND** 项目工作台显示该剧集的运行中状态

#### Scenario: 工作台任务完成

- **WHEN** 剧本分析任务从活动状态转换为 completed
- **THEN** 项目工作台重新加载剧集分析和资产引用
- **AND** 工作台更新资产与分镜阶段的下一步建议

#### Scenario: 工作台任务失败

- **WHEN** 剧本分析任务从活动状态转换为 failed 或 cancelled
- **THEN** 项目工作台保留已保存的用户内容
- **AND** 显示任务错误原因
- **AND** 提供重新提交任务的入口
