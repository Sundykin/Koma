# Delta: script-processing/spec.md

## ADDED Requirements

### Requirement: Episode Auto-Split
系统 SHALL 支持 LLM 自动剧集。

#### Scenario: 自动剧集
- **WHEN** 用户触发「自动剧集」且剧本字数超过阈值
- **THEN** 系统调用 LLM 分析剧本结构
- **AND** 根据项目设置的集数自动划分边界
- **AND** 返回剧集建议列表

#### Scenario: 剧集建议预览
- **WHEN** LLM 返回剧集建议
- **THEN** 显示每集的起止位置和摘要
- **AND** 用户可手动调整剧集边界
- **AND** 确认后创建剧集结构

#### Scenario: 手动剧集
- **WHEN** 用户选择手动剧集
- **THEN** 提供拖拽界面划分剧本段落
- **AND** 支持预览每集内容

### Requirement: Theme-Aware Script Generation
系统 SHALL 在剧本生成时考虑项目主题。

#### Scenario: 主题影响剧本生成
- **WHEN** 从创意生成剧本
- **THEN** 在 System Prompt 中包含项目主题描述
- **AND** 生成的剧本风格与主题一致

#### Scenario: 主题影响分镜提示词
- **WHEN** 生成分镜 TTI 提示词
- **THEN** 在提示词前添加主题风格前缀
- **AND** 例如："cyberpunk style, neon lights, " + 原始描述

### Requirement: Character Asset Generation Entry
系统 SHALL 在角色提取后提供资产生成入口。

#### Scenario: 角色提取后生成定妆照
- **WHEN** 角色提取步骤完成
- **THEN** 显示「生成定妆照」按钮
- **AND** 可选择批量生成或单独生成
- **AND** 生成过程显示进度

#### Scenario: 定妆照生成后生成三视图
- **WHEN** 定妆照生成完成
- **THEN** 显示「生成三视图」按钮
- **AND** 基于定妆照风格生成一致的三视图

#### Scenario: 三视图生成后生成预览视频
- **WHEN** 三视图生成完成
- **THEN** 显示「生成预览视频」按钮
- **AND** 使用定妆照 + ITV Provider 生成短视频

#### Scenario: 预览视频后提取角色
- **WHEN** 预览视频生成完成
- **THEN** 显示「提取角色」按钮
- **AND** 调用 sora2 角色提取 API
- **AND** 保存返回的 characterId

### Requirement: Scene/Prop Asset Generation
系统 SHALL 在场景/道具提取后支持图片生成。

#### Scenario: 场景图片生成
- **WHEN** 场景提取步骤完成
- **THEN** 每个场景显示「生成预览图」按钮
- **AND** 使用场景描述 + 主题风格生成图片

#### Scenario: 道具图片生成
- **WHEN** 道具提取步骤完成
- **THEN** 每个道具显示「生成参考图」按钮
- **AND** 使用道具描述 + 主题风格生成图片

### Requirement: Asset Manual Upload
系统 SHALL 支持手动上传替代生成资产。

#### Scenario: 手动上传角色定妆照
- **WHEN** 用户点击「上传图片」
- **THEN** 打开文件选择器
- **AND** 支持 jpg/png/webp 格式
- **AND** 保存到角色资产目录

#### Scenario: 手动上传场景/道具图片
- **WHEN** 用户为场景/道具上传图片
- **THEN** 保存到对应资产目录
- **AND** 更新数据中的 imagePath

### Requirement: Asset Regeneration
系统 SHALL 支持单个资产重新生成。

#### Scenario: 重新生成定妆照
- **WHEN** 用户点击角色定妆照的「重新生成」
- **THEN** 使用当前角色描述重新生成
- **AND** 可选择覆盖或保存为新版本

#### Scenario: 重新生成三视图单张
- **WHEN** 用户点击某个视图的「重新生成」
- **THEN** 只重新生成该视图（front/side/back）
- **AND** 保持其他视图不变
