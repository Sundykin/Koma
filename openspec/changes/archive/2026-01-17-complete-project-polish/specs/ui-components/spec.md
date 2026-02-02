## ADDED Requirements

### Requirement: 失败任务重试按钮
系统 SHALL 在任务通知中为失败的任务显示重试按钮，允许用户一键重试失败的操作。

#### Scenario: 显示重试按钮
- **WHEN** 异步任务执行失败
- **THEN** 通知组件显示该任务的重试按钮
- **AND** 点击重试按钮触发任务重新执行

#### Scenario: 重试成功
- **WHEN** 用户点击重试按钮
- **AND** 任务重新执行成功
- **THEN** 显示成功通知
- **AND** 移除失败通知

### Requirement: ScriptEditor 组件集成
系统 SHALL 在剧本编辑和分镜提示词编辑场景中使用 ScriptEditor 组件，提供语法高亮和增强编辑体验。

#### Scenario: 剧本编辑使用 ScriptEditor
- **WHEN** 用户编辑剧本内容
- **THEN** 使用 ScriptEditor 组件替代普通 textarea
- **AND** 提供剧本格式的语法高亮

#### Scenario: 分镜提示词编辑使用 ScriptEditor
- **WHEN** 用户编辑分镜提示词
- **THEN** 使用 ScriptEditor 组件
- **AND** 提供适合提示词的编辑体验
