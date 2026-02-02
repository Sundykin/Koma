## ADDED Requirements

### Requirement: 剧集拆分模式
ScriptAnalysisService SHALL 支持剧集拆分模式，允许按单集或全剧本两种方式进行剧本分析。

#### Scenario: 单集分析模式
- **WHEN** 提供 episodeId 和 episodeScript 参数
- **THEN** 仅分析指定剧集的内容
- **AND** 提取结果标记为属于该剧集

#### Scenario: 全剧本分析模式
- **WHEN** 未提供剧集参数
- **THEN** 分析完整剧本内容
- **AND** 提取所有角色、场景、道具

### Requirement: 角色提取后生成定妆照入口
系统 SHALL 在角色提取完成后提供生成定妆照的快捷入口。

#### Scenario: 显示生成定妆照入口
- **WHEN** 角色提取步骤完成
- **THEN** ScriptAnalysisWizard 显示"生成定妆照"按钮
- **AND** 点击后可进入资产生成流程
