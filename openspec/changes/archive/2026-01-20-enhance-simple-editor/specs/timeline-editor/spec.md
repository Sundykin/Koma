## MODIFIED Requirements

### Requirement: Multi-Track Timeline
系统 SHALL 提供多轨道时间线编辑器，支持动态时长刻度和缩放。

#### Scenario: 轨道显示
- **WHEN** 用户进入剪辑视图
- **THEN** 显示包含视频轨、音频轨、字幕轨的时间线
- **AND** 每个轨道有独立的头部区域显示类型和控制按钮
- **AND** 轨道按 order 排序（正数在上，负数在下）

#### Scenario: 主轨道标识
- **WHEN** 存在主视频轨道时
- **THEN** 主轨道应有明显的视觉标识
- **AND** 主轨道 order 为 0
- **AND** 主轨道不可删除

#### Scenario: 动态时长刻度
- **WHEN** 时间线有内容时
- **THEN** 刻度范围根据实际内容时长自动调整
- **AND** 添加 10 秒或 20% 的缓冲区
- **AND** 无内容时显示最小刻度范围

### Requirement: Time Ruler
系统 SHALL 在时间线顶部显示动态时间刻度尺。

#### Scenario: 刻度显示
- **WHEN** 时间线渲染时
- **THEN** 显示以秒为单位的时间刻度
- **AND** 包含主刻度和次刻度
- **AND** 刻度间隔根据缩放级别自动调整

#### Scenario: 缩放级别刻度适配
- **WHEN** 缩放级别变化时
- **THEN** zoom < 0.5 时每 10 秒一个主刻度
- **AND** 0.5 <= zoom < 1 时每 5 秒一个主刻度
- **AND** 1 <= zoom < 2 时每 1 秒一个主刻度
- **AND** zoom >= 2 时每 0.5 秒一个主刻度

## ADDED Requirements

### Requirement: Timeline Zoom
系统 SHALL 支持时间线缩放功能。

#### Scenario: 缩放控制 UI
- **WHEN** 用户查看时间线工具栏
- **THEN** 显示缩放滑块控件（范围 0.1x - 5x）
- **AND** 显示当前缩放百分比
- **AND** 提供缩放重置按钮

#### Scenario: 滚轮缩放
- **WHEN** 用户在时间线上按住 Ctrl 并滚动滚轮
- **THEN** 时间线以鼠标位置为中心进行缩放
- **AND** 向上滚动放大，向下滚动缩小

#### Scenario: 快捷键缩放
- **WHEN** 用户按下 + 键
- **THEN** 时间线放大一档
- **WHEN** 用户按下 - 键
- **THEN** 时间线缩小一档

### Requirement: Collision Detection Enhancement
系统 SHALL 提供完善的同轨道素材碰撞检测。

#### Scenario: 实时碰撞警告
- **WHEN** 用户拖拽片段到会发生碰撞的位置
- **THEN** 显示红色警告边框
- **AND** 片段不应用新位置

#### Scenario: 碰撞回退
- **WHEN** 用户释放片段且检测到碰撞
- **THEN** 片段回退到原位置
- **AND** 显示碰撞提示信息

### Requirement: Snap Alignment
系统 SHALL 支持时间线吸附对齐功能。

#### Scenario: 吸附点检测
- **WHEN** 用户拖拽片段接近吸附点
- **THEN** 在 10px 阈值内自动吸附
- **AND** 显示垂直对齐辅助线

#### Scenario: 吸附点类型
- **WHEN** 进行吸附检测时
- **THEN** 检测播放头位置
- **AND** 检测其他片段的开始和结束点
- **AND** 检测时间刻度标记

#### Scenario: 吸附开关
- **WHEN** 用户在设置中关闭吸附功能
- **THEN** 拖拽时不进行吸附检测
- **AND** 不显示对齐辅助线

### Requirement: Timeline Persistence
系统 SHALL 完整持久化时间线编辑状态。

#### Scenario: 保存编辑状态
- **WHEN** 用户编辑时间线后
- **THEN** 自动保存轨道数据到 timeline.json
- **AND** 保存缩放级别
- **AND** 保存滚动位置
- **AND** 使用防抖机制（1秒延迟）

#### Scenario: 恢复编辑状态
- **WHEN** 用户重新进入项目的编辑器
- **THEN** 从 timeline.json 恢复轨道数据
- **AND** 恢复缩放级别
- **AND** 恢复滚动位置

#### Scenario: 初始化回退
- **WHEN** timeline.json 不存在或无效
- **THEN** 从 shots 数据初始化时间线
- **AND** 使用默认缩放级别和滚动位置
