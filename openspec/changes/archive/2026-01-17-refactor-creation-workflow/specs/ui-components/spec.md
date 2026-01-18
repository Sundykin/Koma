## ADDED Requirements

### Requirement: Background Task Manager
系统 SHALL 提供后台任务管理服务，支持任务的创建、追踪、持久化和恢复。

#### Scenario: 创建后台任务
- **WHEN** 用户触发耗时操作（如剧本解析、资产生成）
- **THEN** 系统创建后台任务并返回任务ID
- **AND** 任务在后台异步执行
- **AND** 用户可以继续其他操作

#### Scenario: 任务持久化
- **WHEN** 任务状态发生变更
- **THEN** 系统将任务状态写入 `tasks.json`
- **AND** 包含任务ID、类型、状态、进度、结果

#### Scenario: 应用启动恢复
- **WHEN** 应用启动时
- **THEN** 系统从 `tasks.json` 加载未完成的任务
- **AND** 恢复任务轮询
- **AND** 更新任务状态

#### Scenario: 任务完成通知
- **WHEN** 后台任务完成
- **THEN** 系统触发完成回调
- **AND** 更新UI显示任务结果

### Requirement: Task Status Bar Component
系统 SHALL 在创作页面显示任务状态条，展示当前运行中的任务进度。

#### Scenario: 显示运行中任务
- **WHEN** 有后台任务正在执行
- **THEN** 状态条显示任务名称和进度百分比
- **AND** 显示进度条动画

#### Scenario: 展开任务详情
- **WHEN** 用户点击状态条
- **THEN** 展开显示所有任务列表
- **AND** 每个任务显示详细状态

#### Scenario: 隐藏空状态
- **WHEN** 没有运行中的任务
- **THEN** 状态条自动隐藏或显示空状态提示

## REMOVED Requirements

### Requirement: Script Analysis Wizard Component
**Reason**: 弹窗式向导与创作页面步骤导航职责重复，改为直接集成到剧本步骤中
**Migration**: 解析功能移至剧本步骤页面，使用后台任务执行
