# timeline-editing Specification

## Purpose
定义时间线编辑器的片段操作和交互需求。

## ADDED Requirements

### Requirement: REQ-CLIP-MENU-001 Clip Context Menu
系统 MUST 支持片段右键菜单，提供常用操作快捷入口。

#### Scenario: 打开片段右键菜单
Given 时间线上有一个片段
When 用户右键点击片段
Then 显示右键菜单
And 菜单包含：删除、复制、添加关键帧、分割

#### Scenario: 右键菜单删除片段
Given 右键菜单已打开
When 用户点击"删除"
Then 片段被删除
And 菜单关闭

#### Scenario: 右键菜单添加关键帧
Given 右键菜单已打开
And 播放头在片段范围内
When 用户点击"添加关键帧"
Then 在播放头位置添加关键帧
And 菜单关闭

### Requirement: REQ-CLIP-COPY-001 Clip Copy Paste
系统 MUST 支持片段复制粘贴功能。

#### Scenario: 复制片段 (Ctrl+C)
Given 用户选中一个片段
When 用户按下 Ctrl+C
Then 片段数据被复制到剪贴板
And 显示"已复制"提示

#### Scenario: 粘贴片段 (Ctrl+V)
Given 剪贴板中有片段数据
And 用户选中目标轨道
When 用户按下 Ctrl+V
Then 在播放头位置创建片段副本
And 新片段被选中

#### Scenario: 快速复制 (Ctrl+D)
Given 用户选中一个片段
When 用户按下 Ctrl+D
Then 在原片段右侧创建副本
And 新片段被选中

### Requirement: REQ-TRACK-DROP-001 Cross Track Drag Highlight
系统 SHALL 在跨轨道拖拽时高亮目标轨道。

#### Scenario: 拖拽片段到其他轨道
Given 用户正在拖拽片段
When 鼠标移动到另一个轨道上方
Then 目标轨道显示高亮边框（青色）
And 原轨道不高亮

#### Scenario: 跨轨道拖拽完成
Given 用户拖拽片段到目标轨道
When 用户释放鼠标
Then 片段移动到目标轨道
And 验证轨道类型兼容（视频不能放音频轨道）

### Requirement: REQ-HISTORY-001 Reliable Undo Redo
系统 MUST 提供可靠的撤销/重做功能。

#### Scenario: 撤销片段操作
Given 用户刚删除一个片段
When 用户按下 Ctrl+Z
Then 片段被恢复
And 撤销计数器减 1

#### Scenario: 重做片段操作
Given 用户刚撤销删除操作
When 用户按下 Ctrl+Shift+Z
Then 片段再次被删除
And 重做计数器减 1

#### Scenario: 新操作清除重做栈
Given 用户已撤销多次操作
When 用户执行新的编辑操作
Then 重做栈被清空

## MODIFIED Requirements

### Requirement: REQ-TL-TOOLBAR-001 Timeline Toolbar (Modified)
系统 MUST 提供完整的时间线工具栏。

#### Scenario: 工具栏包含播放控制
Given 时间线工具栏可见
Then 工具栏包含播放/暂停按钮
And 工具栏包含跳到开头/结尾按钮
And 显示当前时间和总时长

#### Scenario: 工具栏包含撤销重做
Given 时间线工具栏可见
Then 工具栏包含撤销按钮
And 工具栏包含重做按钮
And 按钮根据历史状态启用/禁用
