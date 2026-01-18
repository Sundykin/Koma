# character-management Specification

## Purpose
TBD - created by archiving change enhance-character-management. Update Purpose after archive.
## Requirements
### Requirement: Character Detail Modal
系统 SHALL 提供角色详情弹窗，支持查看和编辑角色信息。

#### Scenario: 打开角色详情
- **WHEN** 用户点击角色卡片
- **THEN** 打开角色详情弹窗
- **AND** 显示角色基础信息（名称、类型、年龄、描述、外貌）
- **AND** 显示角色资产状态（定妆照、三视图、预览视频、Sora2绑定）

#### Scenario: 编辑角色信息
- **WHEN** 用户在详情弹窗中修改角色信息
- **AND** 点击"保存"按钮
- **THEN** 更新角色数据到存储
- **AND** 刷新卡片列表显示

#### Scenario: 删除角色
- **WHEN** 用户点击"删除角色"按钮
- **THEN** 显示确认对话框
- **AND** 确认后从项目中移除角色
- **AND** 删除关联的资产文件

### Requirement: Character Creation
系统 SHALL 支持手动创建新角色。

#### Scenario: 新建角色
- **WHEN** 用户点击"新建角色"卡片
- **THEN** 打开创建角色弹窗
- **AND** 显示基础信息表单

#### Scenario: 提交创建
- **WHEN** 用户填写角色信息并提交
- **THEN** 验证名称必填
- **AND** 创建角色记录
- **AND** 关闭创建弹窗
- **AND** 自动打开新角色的详情弹窗

### Requirement: Prompt Preview and Customization
系统 SHALL 支持生成前预览和自定义提示词。

#### Scenario: 预览提示词
- **WHEN** 用户在角色详情弹窗中
- **THEN** 显示自动生成的定妆照提示词
- **AND** 基于项目主题和角色外貌生成

#### Scenario: 自定义提示词
- **WHEN** 用户点击"编辑"按钮
- **THEN** 提示词变为可编辑状态
- **AND** 用户可修改提示词内容
- **AND** 修改后的提示词用于后续生成

#### Scenario: 保存自定义提示词
- **WHEN** 用户自定义提示词后保存
- **THEN** 将自定义提示词存储到角色的 `customPrompt` 字段
- **AND** 后续生成默认使用自定义提示词

### Requirement: Three View Generation
系统 SHALL 支持角色三视图的生成和管理。

#### Scenario: 一键生成三视图
- **WHEN** 用户点击"一键生成三视图"按钮
- **THEN** 依次生成正面、侧面、背面视图
- **AND** 显示生成进度
- **AND** 生成完成后显示三张图片

#### Scenario: 单视图重新生成
- **WHEN** 用户点击某个视图的"重新生成"按钮
- **THEN** 仅重新生成该视图
- **AND** 保留其他视图不变

#### Scenario: 上传替代
- **WHEN** 用户点击视图的"上传"按钮
- **THEN** 打开文件选择对话框
- **AND** 选择图片后复制到项目目录
- **AND** 更新视图路径

### Requirement: Preview Video Generation
系统 SHALL 支持角色预览视频的生成。

#### Scenario: 生成预览视频
- **GIVEN** 角色已有定妆照
- **WHEN** 用户点击"生成预览视频"按钮
- **THEN** 使用定妆照 + ITV 服务生成视频
- **AND** 显示生成进度
- **AND** 生成完成后可在弹窗中播放

#### Scenario: 预览视频前置条件
- **WHEN** 用户尝试生成预览视频但无定妆照
- **THEN** 提示"请先生成定妆照"
- **AND** 生成按钮禁用

### Requirement: Character Extraction (Sora2)
系统 SHALL 支持通过 Sora2 API 提取角色。

#### Scenario: 提取角色
- **GIVEN** 角色已有预览视频
- **AND** 配置了 Sora2 ITV 服务
- **WHEN** 用户点击"提取角色"按钮
- **THEN** 调用 `Sora2Provider.extractCharacter` API
- **AND** 保存返回的 characterId 到角色数据

#### Scenario: 显示绑定状态
- **WHEN** 角色已绑定 Sora2 Character ID
- **THEN** 显示"已绑定"状态和 ID
- **AND** 显示"重新提取"按钮

#### Scenario: 提取失败
- **WHEN** 角色提取失败
- **THEN** 显示错误信息
- **AND** 保留原有绑定状态（如有）

