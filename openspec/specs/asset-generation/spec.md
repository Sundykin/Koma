# asset-generation Specification

## Purpose
TBD - created by archiving change add-antd-timeline-editor. Update Purpose after archive.
## Requirements
### Requirement: Shot Confirmation
系统 SHALL 支持分镜确认状态管理。

#### Scenario: 确认分镜
- **WHEN** 用户在分镜列表中点击「确认」按钮
- **THEN** 该分镜状态变为 confirmed: true
- **AND** 显示确认状态视觉标识（绿色勾选）

#### Scenario: 取消确认
- **WHEN** 用户对已确认的分镜点击「取消确认」
- **THEN** 该分镜状态变为 confirmed: false
- **AND** 从时间线移除对应片段

#### Scenario: 批量确认
- **WHEN** 用户选择多个分镜并点击「批量确认」
- **THEN** 所有选中分镜状态变为 confirmed

### Requirement: Auto Track Population
系统 SHALL 自动将确认的分镜填充到时间线。

#### Scenario: 自动入轨
- **WHEN** 分镜被确认时
- **THEN** 系统自动在主轨道创建对应的视频片段
- **AND** 片段按分镜顺序排列
- **AND** 如果有配音，同时创建音频轨道片段

#### Scenario: 时序计算
- **WHEN** 多个分镜被确认
- **THEN** 片段按分镜列表顺序依次排列
- **AND** 每个片段的开始时间为前一片段的结束时间
- **AND** 自动扩展 duration 以容纳所有片段

### Requirement: Shot Version Control
系统 SHALL 支持分镜的版本管理。

#### Scenario: 保存 Seed
- **WHEN** 用户对某次生成结果满意
- **THEN** 可以锁定该次生成的 seed 值
- **AND** 后续重新生成时使用相同 seed

#### Scenario: 版本历史
- **WHEN** 分镜多次生成后
- **THEN** 系统保留每次生成的结果历史
- **AND** 用户可以切换回历史版本

### Requirement: Manju-DSL Protocol
系统 SHALL 使用 Manju-DSL 作为项目数据协议。

#### Scenario: DSL 结构
- **WHEN** 导出项目数据
- **THEN** 输出符合 Manju-DSL 规范的 JSON
- **AND** 包含 projectId, shots, timeline 字段
- **AND** timeline 包含 layers 数组（main_shot, overlay_char 等）

#### Scenario: DSL 导入
- **WHEN** 导入 Manju-DSL JSON 文件
- **THEN** 系统解析并恢复项目状态
- **AND** 重建时间线轨道和片段
- **AND** 恢复关键帧动画数据

#### Scenario: DSL Schema 验证
- **WHEN** 导入 DSL 文件时
- **THEN** 系统验证 JSON 结构符合 Schema
- **AND** 无效数据显示具体错误

### Requirement: Shot Rendering Workflow
系统 SHALL 支持分镜的渲染工作流。

#### Scenario: 单镜头渲染
- **WHEN** 用户触发单个分镜的渲染
- **THEN** 按顺序执行：图片生成 → 配音生成 → 视频化
- **AND** 每步完成后更新进度

#### Scenario: 批量渲染
- **WHEN** 用户触发批量渲染
- **THEN** 并行或串行处理多个分镜
- **AND** 显示整体进度和单镜进度

#### Scenario: 渲染进度回调
- **WHEN** 渲染进行中
- **THEN** WorkflowManager 调用 onProgress 回调
- **AND** 包含 stage, progress, message 信息

