## MODIFIED Requirements

### Requirement: 分镜编辑器布局

分镜编辑器 SHALL 提供以“导航 + 舞台 + 检视器”为核心的工作台布局，而不是线性步骤或密集列表。

#### Scenario: 工作台列结构

- **WHEN** 用户进入分镜工作区
- **THEN** 系统 SHALL 使用三栏布局
- **AND** 左侧导航区宽度 SHALL 适合连续浏览分镜列表
- **AND** 中间舞台区 SHALL 占据最大视觉面积
- **AND** 右侧检视区 SHALL 提供更大的提示词编辑空间

#### Scenario: 舞台区优先级

- **WHEN** 当前分镜存在图片或视频
- **THEN** 中间舞台区 SHALL 以大预览方式显示当前结果
- **AND** 舞台区的可视面积 SHALL 高于传统卡片式图片格子

## ADDED Requirements

### Requirement: 右侧工作流抽屉布局

系统 SHALL 允许工作流以右侧抽屉形式覆盖主内容，而不是挤压分镜工作台。

#### Scenario: 打开工作流面板

- **WHEN** 用户打开右侧工作流
- **THEN** 抽屉 SHALL 覆盖在主工作台之上
- **AND** 分镜导航、舞台和检视器的布局宽度 SHALL 保持稳定
