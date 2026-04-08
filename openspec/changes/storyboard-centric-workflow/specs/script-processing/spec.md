## MODIFIED Requirements

### Requirement: Script Input

系统 SHALL 在工具面板的剧本工作室中支持剧本文本输入和管理，替代原有独立步骤。

#### Scenario: 输入剧本

- **WHEN** 用户在剧本工作室面板中输入文本或粘贴剧本
- **THEN** 系统保存剧本内容到当前 Episode
- **AND** 支持分章节/分幕结构化输入
- **AND** 支持 Markdown 格式

#### Scenario: 导入剧本文件

- **WHEN** 用户在剧本工作室面板中导入 .txt / .md / .srt 剧本文件
- **THEN** 系统解析文件内容
- **AND** 自动识别角色、场景、对话结构
- **AND** 在面板内预览解析结果

### Requirement: Script to Shot List (核心)

系统 SHALL 在剧本工作室面板中完成分镜拆解，使用项目 `styleSnapshot` 生成分镜提示词。

#### Scenario: 面板内分镜拆解

- **WHEN** 用户在剧本工作室面板中导入文本后点击"拆分为分镜"
- **THEN** 系统 SHALL 调用 LLM 将文本拆分为分镜列表
- **AND** 在面板内显示拆分预览
- **AND** 用户可手动调整后确认写入 Episode

#### Scenario: 分镜提示词生成使用项目快照

- **WHEN** 系统为 Shot 生成图片或视频提示词
- **THEN** 系统 MUST 从项目 `styleSnapshot.ttiStylePrefix` 读取视觉风格
- **AND** 提示词生成 SHALL 不再依赖 `settings.stylePrompts`

## ADDED Requirements

### Requirement: 渐进式剧本处理流程

系统 SHALL 在剧本工作室面板中支持渐进式处理流程，引导用户从原始文本到完整分镜。

#### Scenario: 流程步骤指引

- **WHEN** 用户打开剧本工作室面板
- **THEN** 系统 SHALL 显示处理流程步骤指引：
  1. 导入文本
  2. 内容精炼（可选：浓缩/扩写/润色）
  3. 章节划分（可选）
  4. 拆分为分镜
  5. 确认并写入
- **AND** 当前步骤高亮显示，已完成步骤打勾

#### Scenario: 跳过可选步骤

- **WHEN** 用户不需要内容精炼或章节划分
- **THEN** 用户 SHALL 能直接跳到"拆分为分镜"步骤
- **AND** 系统不强制按顺序执行

#### Scenario: 处理中间结果预览

- **WHEN** 每个处理步骤完成后
- **THEN** 系统 SHALL 在面板内显示处理结果预览
- **AND** 用户可对结果进行手动编辑
- **AND** 编辑后的结果作为下一步的输入
