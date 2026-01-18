## ADDED Requirements

### Requirement: Task Persistence
系统 SHALL 将后台任务状态持久化到项目目录，支持任务恢复。

#### Scenario: 任务文件结构
- **WHEN** 项目中有后台任务
- **THEN** 任务状态保存在 `{projectPath}/tasks.json`
- **AND** 包含任务列表数组

#### Scenario: 任务记录格式
- **WHEN** 保存任务记录
- **THEN** 每条记录包含：id, type, status, progress, targetType, targetId, result, error, createdAt, updatedAt
- **AND** type 为 "script-analysis" | "asset-generation" | "shot-render"
- **AND** status 为 "pending" | "running" | "completed" | "failed"

#### Scenario: 任务清理
- **WHEN** 任务完成超过7天
- **THEN** 系统在下次启动时自动清理过期任务记录

### Requirement: Asset Data Persistence
系统 SHALL 在剧本解析完成后将资产数据持久化到项目存储。

#### Scenario: 解析结果保存
- **WHEN** 剧本解析任务完成
- **THEN** 角色数据保存到 `characters.json`
- **AND** 场景数据保存到 `scenes.json`
- **AND** 道具数据保存到 `props.json`
- **AND** 分镜数据保存到 `episodes/{id}/analysis.json`

#### Scenario: 资产加载
- **WHEN** 进入资产管理步骤
- **THEN** 系统从项目存储加载已保存的资产数据
- **AND** 显示在资产列表中

#### Scenario: 资产图片保存
- **WHEN** 资产图片生成完成
- **THEN** 图片保存到 `assets/{type}/{id}/` 目录
- **AND** 更新资产记录的图片路径字段
