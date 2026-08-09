# Project Production Workbench Specification

## Purpose

为项目编辑器提供从剧本到可生产分镜的连续工作台，减少页面切换并让真实生产状态可见。

## ADDED Requirements

### Requirement: Unified project step

编辑器 SHALL 在主步骤导航中将剧本和角色/场景/道具资产管理归入一个“项目”步骤，并保留分镜和视频步骤；旧 `assets` 步骤定义 MUST 继续可解析但不得作为主导航节点显示。

#### Scenario: 新项目进入统一步骤

- **WHEN** 用户创建项目或从项目列表打开项目
- **THEN** 编辑器默认进入“项目”步骤
- **AND** 顶部导航显示“项目 → 分镜 → 视频”
- **AND** 当前剧集的剧本编辑和资产概览同时可见

#### Scenario: 旧资产步骤兼容

- **WHEN** 旧数据或深链接请求 `assets` 步骤
- **THEN** 系统 SHALL 保留该步骤组件并能打开完整资产编辑器
- **AND** `assets` 不出现在主导航列表
- **AND** 返回项目工作台时不丢失当前剧集选择

### Requirement: Readiness derived from production data

工作台 SHALL 从当前剧集剧本、`EpisodeAnalysis`、角色/场景/道具媒体和当前剧集 shots 派生剧本、资产、分镜三个阶段的状态；不得仅依据用户点击下一步或旧导航进度字段判定就绪。

#### Scenario: 未解析剧本

- **WHEN** 当前剧集有非空剧本但没有已完成分析阶段
- **THEN** 剧本阶段显示可解析
- **AND** 资产与分镜阶段显示等待剧本解析
- **AND** 建议下一步为“解析剧本”

#### Scenario: 资产存在缺失媒体

- **WHEN** 分析已提取当前剧集资产且至少一个引用资产缺少可用图片
- **THEN** 资产阶段显示缺口数量
- **AND** 建议下一步为“处理缺失素材”
- **AND** 分镜阶段可以打开但明确提示资产缺口

#### Scenario: 分镜已生成

- **WHEN** 当前剧集存在一个或多个 shots
- **THEN** 分镜阶段显示已生成镜数
- **AND** 工作台提供“打开分镜”动作
- **AND** 状态刷新不改变当前剧集

### Requirement: Actionable next step

工作台 SHALL 为当前剧集提供一个由 readiness 派生的主行动，并允许用户在原地启动可直接执行的剧本解析或分镜分析任务。

#### Scenario: 原地解析剧本

- **WHEN** 建议下一步为“解析剧本”且当前没有同类活动任务
- **THEN** 用户点击主行动后系统调用现有剧本分析任务客户端
- **AND** 卡片显示运行中状态并禁用重复提交
- **AND** 任务完成或失败后自动刷新状态并提供重试

#### Scenario: 原地生成分镜

- **WHEN** 当前剧集已完成分析且不存在 shots
- **THEN** 用户点击主行动后系统调用现有分镜分析任务客户端
- **AND** 用户无需先进入资产步骤
- **AND** 任务完成后显示生成镜数并提供“打开分镜”

#### Scenario: 明确的阻塞原因

- **WHEN** 缺少当前剧集或剧本为空，或任务被已有活动任务占用
- **THEN** 主行动显示禁用或运行中状态
- **AND** 工作台展示可操作的原因和下一步（选择剧集、输入剧本或等待任务）

### Requirement: Embedded asset and storyboard entry points

项目步骤 SHALL 提供进入完整资产编辑器和分镜编辑器的显式入口，并透传同一项目、剧集、风格和模型上下文。

#### Scenario: 打开资产管理

- **WHEN** 用户点击“打开资产管理”
- **THEN** 系统进入完整资产编辑器
- **AND** 当前剧集保持选中
- **AND** 资产编辑器可继续编辑、绑定和生成图片

#### Scenario: 打开分镜

- **WHEN** 用户点击“打开分镜”
- **THEN** 系统进入当前剧集分镜编辑器
- **AND** 分镜读取项目 `styleSnapshot` 和现有 shots
- **AND** 尾帧连续性及手动截取能力保持可用

### Requirement: Task-aware refresh

工作台 SHALL 订阅当前项目的剧本分析和分镜分析任务状态，并在边沿完成、失败或取消时重新加载权威数据。

#### Scenario: 任务完成刷新

- **WHEN** script-analysis 或 shot-analysis 从活动状态转换为 completed
- **THEN** 系统重新加载当前剧集分析和相关实体/shots
- **AND** 更新阶段计数和主行动

#### Scenario: 任务失败可重试

- **WHEN** 任一任务从活动状态转换为 failed
- **THEN** 工作台显示失败原因
- **AND** 主行动改为“重试”
- **AND** 已有用户编辑的数据保持不变

### Requirement: Cross-stage continuity

项目工作台 SHALL 将同一当前剧集上下文传递给剧本、资产和分镜动作，切换步骤不得清空脚本、分析或媒体状态。

#### Scenario: 切换步骤后返回

- **WHEN** 用户从项目步骤打开资产或分镜再返回
- **THEN** 当前剧集、剧本文本和 readiness 计数保持一致
- **AND** 工作台从持久化数据重新校准而非显示旧快照
