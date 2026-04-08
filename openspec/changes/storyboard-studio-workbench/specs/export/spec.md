## MODIFIED Requirements

### Requirement: Export Framework

系统 SHALL 在保留原有导出框架的同时，提供以分镜工作台为入口的快速导出路径。

#### Scenario: 在分镜工作台选择导出方式

- **WHEN** 用户打开分镜工作台中的导出中心
- **THEN** 系统 SHALL 提供快速视频、剪映草稿、图片序列和高级编辑器等导出路径
- **AND** 用户 SHALL 不必先进入时间线编辑器

#### Scenario: 保留导出配置

- **WHEN** 用户切换导出方式或关闭导出中心后重新打开
- **THEN** 当前导出配置、模板和历史 SHALL 在工作区会话中保留

## ADDED Requirements

### Requirement: 导出模板资产

系统 SHALL 支持将当前导出配置保存为可复用模板。

#### Scenario: 保存当前导出配置

- **WHEN** 用户在导出中心配置好某一种导出方式
- **THEN** 系统 SHALL 允许将当前配置保存为模板资产
- **AND** 模板 SHALL 记录导出类型与相关参数

#### Scenario: 套用导出模板

- **WHEN** 用户在导出中心选择一个已有模板
- **THEN** 系统 SHALL 恢复其导出类型和配置参数

### Requirement: 导出历史记录

系统 SHALL 记录分镜工作台内的导出执行历史。

#### Scenario: 展示导出历史

- **WHEN** 用户在导出中心完成一次导出
- **THEN** 系统 SHALL 记录导出类型、路径、条目数量和使用模板
- **AND** 桌面端 SHALL 支持直接打开输出目录
