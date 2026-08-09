# Continuous Production Actions Specification

## Purpose

让项目工作台把资产补全和分镜生成变成可选择、可追踪的连续生产动作。

## ADDED Requirements

### Requirement: Direct missing-asset generation

项目工作台 SHALL 能直接启动当前剧集缺失角色、场景和道具参考图的批量生成，无需先进入完整资产编辑器。

#### Scenario: 原地补齐缺失素材

- **WHEN** 当前剧集存在缺失参考图且没有活动的资产生成任务
- **THEN** 用户点击项目工作台的补全动作
- **AND** 系统使用现有角色、场景、道具生成工作流按当前剧集引用集合执行
- **AND** 透传项目比例、风格快照、模型选择和用户参考图
- **AND** 工作台显示总进度及成功/失败数量

#### Scenario: 批量任务完成

- **WHEN** 批量素材任务完成
- **THEN** 系统重新加载项目资产和当前剧集 readiness
- **AND** 成功项从缺口中移除
- **AND** 失败项仍显示为可重试缺口

### Requirement: Asset task deduplication

系统 SHALL 防止同一项目和剧集同时启动多个缺失素材批量任务。

#### Scenario: 重复点击

- **WHEN** 当前项目/剧集已有 pending、running 或 processing 的资产生成任务
- **THEN** 新点击不得创建第二个任务
- **AND** 工作台显示已有任务正在进行
- **AND** 继续投影已有任务进度

### Requirement: Explicit skip to storyboard

当资产存在图片缺口时，项目工作台 SHALL 提供明确的“跳过素材，生成分镜”动作；缺失图片不得被实现为不可绕过的隐藏门槛。

#### Scenario: 用户选择跳过

- **WHEN** 当前剧本分析已完成且不存在 shots，即使仍有缺失资产图片
- **THEN** 用户可以点击“跳过素材，生成分镜”
- **AND** 系统调用现有 shot-analysis 任务
- **AND** 不提交资产生成任务
- **AND** 界面继续显示资产缺口，避免误报资产已就绪

### Requirement: Resumable progress projection

项目工作台 SHALL 从任务记录恢复资产批量任务的运行状态，并在任务边沿完成、失败或取消时刷新。

#### Scenario: 切换步骤回来

- **WHEN** 用户离开项目步骤后再返回且批量任务仍在运行
- **THEN** 工作台显示活动任务和当前进度
- **AND** 禁用重复启动按钮

#### Scenario: 失败后重试

- **WHEN** 批量任务失败或部分失败
- **THEN** 工作台显示失败原因或失败数量
- **AND** 允许用户再次执行补全
- **AND** 已成功生成的素材不重复进入待生成集合
