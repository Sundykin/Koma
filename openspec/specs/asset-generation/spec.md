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

### Requirement: Character Costume Photo Generation
系统 SHALL 生成包含三视图的角色定妆照。

#### Scenario: 统一生成入口
- **WHEN** 从任何入口触发角色定妆照生成
- **THEN** 统一调用 `characterAssetWorkflow.generateCostumePhoto()`
- **AND** 不再使用 `AssetGenerationService.generateCharacterImage()`
- **AND** 所有入口生成的图片都包含三视图

#### Scenario: 项目风格应用
- **WHEN** 生成任何 TTI 图片
- **THEN** 从项目配置读取 `theme` 和 `stylePrompt`
- **AND** 调用 `getThemeStylePrefix()` 获取风格前缀
- **AND** 将风格前缀添加到提示词开头

### Requirement: Shot Image Style Application
系统 SHALL 在分镜图片生成时应用项目风格。

#### Scenario: ShotGenerationService 风格应用
- **WHEN** 通过 `ShotGenerationService` 生成分镜图片
- **THEN** 接受 `theme` 和 `stylePrompt` 参数
- **AND** 在 `buildShotPrompt()` 中调用 `getThemeStylePrefix()`
- **AND** 将风格前缀添加到分镜提示词开头

### Requirement: Deprecated Service Warning
系统 SHALL 对废弃服务提供警告。

#### Scenario: AssetGenerationService 废弃标记
- **WHEN** 开发者引用 `AssetGenerationService`
- **THEN** 文件顶部有 `@deprecated` 注释说明
- **AND** 注释指向替代方案 `characterAssetWorkflow`

