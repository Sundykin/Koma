## ADDED Requirements

### Requirement: Storyboard Studio 主工作台

系统 SHALL 在打开剧集后直接进入以分镜为中心的三栏工作台，而不是步骤式主内容。

#### Scenario: 打开剧集进入工作台

- **WHEN** 用户从项目中打开一个 Episode
- **THEN** 系统 SHALL 默认显示 Storyboard Studio 工作台
- **AND** 工作台由分镜导航区、当前分镜舞台区和当前分镜检视区组成

#### Scenario: 空分镜剧集

- **WHEN** 当前 Episode 还没有分镜
- **THEN** 系统 SHALL 显示空状态引导
- **AND** 提供从剧本工作流开始或手动添加分镜的入口

### Requirement: 分镜导航区

系统 SHALL 提供稳定的分镜导航区，用于定位、选择和批量操作准备。

#### Scenario: 导航区显示分镜摘要

- **WHEN** 导航区渲染分镜列表
- **THEN** 每个条目 SHALL 显示缩略图、分镜序号、时长和文案摘要
- **AND** 显示当前分镜的图片数、视频数和已确认状态

#### Scenario: 导航区支持多选

- **WHEN** 用户在导航区勾选一个或多个分镜
- **THEN** 系统 SHALL 记录 `selectedShotIds`
- **AND** 这些选择 SHALL 可供章节推理、导出和批量操作复用

### Requirement: 当前分镜舞台区

系统 SHALL 提供大画面舞台区，以放大显示当前分镜的图片、视频和参考素材。

#### Scenario: 优先显示视频结果

- **WHEN** 当前分镜包含已选视频
- **THEN** 舞台区 SHALL 优先显示视频播放器
- **AND** 若同时存在图片，则图片 SHALL 作为视频 poster 或候选素材显示

#### Scenario: 显示图片与参考素材候选

- **WHEN** 当前分镜存在图片或参考素材
- **THEN** 舞台区 SHALL 提供候选列表用于切换当前图片、视频和参考图
- **AND** 主显示区高度 SHALL 足够承担主要预览职责

### Requirement: 当前分镜检视区

系统 SHALL 在右侧检视区提供大提示词输入区和文案编辑区。

#### Scenario: 提示词编辑区

- **WHEN** 用户编辑当前分镜提示词
- **THEN** 系统 SHALL 提供图片提示词与视频提示词切换
- **AND** 提示词输入区 SHALL 以大文本编辑器呈现
- **AND** 用户 SHALL 能直接推理、优化并触发生成图片/视频

#### Scenario: 文案与镜头参数编辑

- **WHEN** 用户编辑当前分镜元数据
- **THEN** 检视区 SHALL 提供文案、台词、情绪、景别、运镜和时长编辑能力
- **AND** 保留插入、移动、删除和确认分镜等操作
