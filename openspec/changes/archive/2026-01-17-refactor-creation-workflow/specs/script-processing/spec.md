## MODIFIED Requirements

### Requirement: Script Analysis Service
系统 SHALL 提供剧本解析服务，支持后台执行和结果持久化。

#### Scenario: 触发解析
- **WHEN** 用户在剧本步骤点击「AI解析」按钮
- **THEN** 系统创建后台解析任务
- **AND** 返回任务ID
- **AND** 用户可继续编辑或切换步骤

#### Scenario: 解析进度更新
- **WHEN** 解析任务执行中
- **THEN** 系统定期更新任务进度
- **AND** UI显示当前解析阶段（角色/场景/道具/分镜）

#### Scenario: 解析完成持久化
- **WHEN** 解析任务完成
- **THEN** 系统将结果保存到项目存储
- **AND** 更新任务状态为 completed
- **AND** 触发完成通知

#### Scenario: 解析失败处理
- **WHEN** 解析任务失败
- **THEN** 系统记录错误信息
- **AND** 更新任务状态为 failed
- **AND** 用户可选择重试

## ADDED Requirements

### Requirement: Asset Generation Service
系统 SHALL 提供资产图片生成服务，支持后台执行。

#### Scenario: 生成角色定妆照
- **WHEN** 用户点击角色的「生成定妆照」按钮
- **THEN** 系统创建 TTI 生成任务
- **AND** 使用角色外貌描述作为提示词
- **AND** 生成结果保存到角色资产目录

#### Scenario: 生成场景参考图
- **WHEN** 用户点击场景的「生成参考图」按钮
- **THEN** 系统创建 TTI 生成任务
- **AND** 使用场景描述作为提示词
- **AND** 生成结果保存到场景资产目录

#### Scenario: 生成道具参考图
- **WHEN** 用户点击道具的「生成参考图」按钮
- **THEN** 系统创建 TTI 生成任务
- **AND** 使用道具描述作为提示词
- **AND** 生成结果保存到道具资产目录

#### Scenario: 批量生成
- **WHEN** 用户选择多个资产并点击「批量生成」
- **THEN** 系统为每个资产创建独立的生成任务
- **AND** 任务并行或串行执行（根据配置）
