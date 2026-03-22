## MODIFIED Requirements
### Requirement: Character Detail Modal
系统 SHALL 提供角色详情弹窗，支持查看和编辑角色信息。

#### Scenario: 打开角色详情
- **WHEN** 用户点击角色卡片
- **THEN** 打开角色详情弹窗
- **AND** 显示角色基础信息（名称、类型、年龄、性别、视觉提示词）
- **AND** 显示角色资产状态（定妆照、三视图、预览视频、Sora2绑定）

#### Scenario: 编辑角色信息
- **WHEN** 用户在详情弹窗中修改角色信息
- **AND** 点击"保存"按钮
- **THEN** 更新角色数据到存储
- **AND** 年龄与性别字段必须被结构化保存
- **AND** 刷新卡片列表显示

### Requirement: Character Creation
系统 SHALL 支持手动创建新角色。

#### Scenario: 提交创建
- **WHEN** 用户填写角色信息并提交
- **THEN** 验证名称必填
- **AND** 支持录入并保存年龄、性别与视觉提示词
- **AND** 创建角色记录
- **AND** 关闭创建弹窗
- **AND** 自动打开新角色的详情弹窗
