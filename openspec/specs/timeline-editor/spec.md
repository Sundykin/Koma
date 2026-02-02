# timeline-editor Specification

## Purpose
TBD - created by archiving change add-antd-timeline-editor. Update Purpose after archive.
## Requirements
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

### Requirement: Playhead Control
系统 SHALL 提供可拖拽的播放头。

#### Scenario: 播放头拖拽
- **WHEN** 用户拖拽播放头
- **THEN** 当前时间随播放头位置实时更新
- **AND** 预览画面同步更新
- **AND** Player 组件接收 onTimeUpdate 回调

#### Scenario: 点击定位
- **WHEN** 用户点击刻度尺或空白轨道区域
- **THEN** 播放头跳转到点击位置

### Requirement: Clip Manipulation
系统 SHALL 支持片段的拖拽和缩放操作。

#### Scenario: 片段拖拽移动
- **WHEN** 用户拖拽轨道上的片段
- **THEN** 片段在时间轴上水平移动
- **AND** 可跨轨道移动至兼容类型的轨道
- **AND** 碰撞检测阻止重叠

#### Scenario: 片段缩放
- **WHEN** 用户拖拽片段左右边缘
- **THEN** 片段的开始时间或持续时长相应调整
- **AND** 提供视觉反馈（手柄高亮）
- **AND** 碰撞检测阻止重叠

#### Scenario: 片段选中状态
- **WHEN** 用户点击片段
- **THEN** 片段显示选中状态（边框高亮）
- **AND** 显示缩放手柄
- **AND** PropertiesPanel 显示该片段属性

### Requirement: Keyframe System
系统 SHALL 支持关键帧标记和编辑（迁移 keyframe.ts 引擎）。

#### Scenario: 关键帧显示
- **WHEN** 片段包含关键帧时
- **THEN** 在片段上以菱形标记显示关键帧位置

#### Scenario: 添加关键帧
- **WHEN** 用户在当前时间添加关键帧
- **THEN** 保存当前属性快照（x, y, scale, rotation, opacity）
- **AND** 按时间排序插入关键帧列表

#### Scenario: 关键帧缓动
- **WHEN** 播放或预览时
- **THEN** 使用 easingFunctions 在关键帧之间插值属性
- **AND** 支持 Linear、Ease In、Ease Out、Ease In-Out 等曲线

### Requirement: Context Menu
系统 SHALL 提供右键上下文菜单。

#### Scenario: 片段右键菜单
- **WHEN** 用户右键点击片段
- **THEN** 显示包含「添加关键帧」「复制」「删除」的菜单

#### Scenario: 关键帧右键菜单
- **WHEN** 用户右键点击关键帧
- **THEN** 显示包含「缓动曲线」「删除关键帧」的菜单

### Requirement: Asset Drop
系统 SHALL 支持从素材库拖入片段到时间线。

#### Scenario: 素材拖入轨道
- **WHEN** 用户从 Sidebar 拖拽素材到轨道
- **THEN** 在释放位置创建新片段
- **AND** 目标轨道高亮显示
- **AND** 类型不兼容的轨道不接受拖放

#### Scenario: 素材拖入间隙
- **WHEN** 用户拖拽素材到轨道之间的间隙
- **THEN** 自动创建新轨道并添加片段
- **AND** 调整其他轨道的 order

### Requirement: Track Operations
系统 SHALL 支持轨道的插入和删除。

#### Scenario: 插入轨道
- **WHEN** 用户选择在指定轨道上方或下方插入
- **THEN** 创建新轨道并调整 order
- **AND** 其他轨道 order 相应位移

#### Scenario: 删除轨道
- **WHEN** 用户删除非主轨道
- **THEN** 移除该轨道及其所有片段
- **AND** 不允许删除主轨道

### Requirement: Player Integration
系统 SHALL 集成 Canvas 预览播放器。

#### Scenario: 视频渲染
- **WHEN** 时间线有内容时
- **THEN** VideoRenderer 将当前帧渲染到 Canvas
- **AND** 应用关键帧插值的变换属性

#### Scenario: 播放控制
- **WHEN** 用户点击播放按钮
- **THEN** MediaEngine 启动帧循环
- **AND** 时间线播放头跟随移动
- **AND** 到达结尾时自动暂停

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

