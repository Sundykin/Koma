## MODIFIED Requirements

### Requirement: Theme Preset Selection in Project

用户 SHALL 能在分镜工作台中的风格面板直接选择项目风格，而不必跳转到独立设置页。

#### Scenario: 工作台内切换风格

- **WHEN** 用户在分镜工作台打开风格面板
- **THEN** 系统 SHALL 展示统一风格目录
- **AND** 用户 SHALL 可以直接将选中风格应用到当前项目

## ADDED Requirements

### Requirement: 风格影响评估与重推理计划

系统 SHALL 在应用风格时给出面向分镜的影响评估和后续处理建议。

#### Scenario: 生成影响计划

- **WHEN** 用户选择一个新的风格预设
- **THEN** 系统 SHALL 生成受影响范围、受影响分镜数量和建议模板级别
- **AND** 用户 SHALL 能基于该计划继续执行章节推理

#### Scenario: 传递重推理上下文

- **WHEN** 用户选择基于新风格继续推理
- **THEN** 系统 SHALL 将风格影响计划写入推理面板会话
- **AND** 推理面板 SHALL 自动带入相关范围和级别
