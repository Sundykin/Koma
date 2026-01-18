## ADDED Requirements

### Requirement: Episode Asset Filtering
系统 SHALL 支持按分集筛选显示资产。

#### Scenario: 默认筛选模式
- **WHEN** 用户进入某分集的资产管理页面
- **THEN** 默认只显示该分集关联的角色/场景/道具
- **AND** 关联关系来自 `EpisodeAnalysis.characterRefs/sceneRefs/propRefs`

#### Scenario: 显示全部资产
- **WHEN** 用户开启「显示全部项目资产」开关
- **THEN** 显示项目下所有资产
- **AND** 未关联当前分集的资产显示为半透明

#### Scenario: 添加资产到分集
- **WHEN** 用户点击未关联的资产
- **THEN** 提供「添加到当前分集」选项
- **AND** 添加后更新分集的 refs 列表

## ADDED Requirements

### Requirement: Character Detail Modal
系统 SHALL 提供角色详情编辑弹窗。

#### Scenario: 定妆照显示
- **WHEN** 打开角色详情弹窗
- **THEN** 显示完整定妆照（包含三视图）
- **AND** 不再显示三视图分别编辑区域

#### Scenario: 提示词编辑
- **WHEN** 用户编辑角色生成提示词
- **THEN** 只允许编辑外貌描述部分
- **AND** 显示完整模板预览（只读）
