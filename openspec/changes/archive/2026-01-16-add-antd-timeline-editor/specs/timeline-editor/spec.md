## ADDED Requirements

### Requirement: Multi-Track Timeline
系统 SHALL 提供多轨道时间线编辑器（迁移自 electron-egg）。

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

### Requirement: Time Ruler
系统 SHALL 在时间线顶部显示时间刻度尺。

#### Scenario: 刻度显示
- **WHEN** 时间线渲染时
- **THEN** 显示以秒为单位的时间刻度
- **AND** 包含主刻度和次刻度
- **AND** 支持缩放级别调整

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
