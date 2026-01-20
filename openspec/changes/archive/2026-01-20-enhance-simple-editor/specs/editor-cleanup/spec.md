## ADDED Requirements

### Requirement: Audio Playback
系统 SHALL 支持视频和音频素材的声音播放。

#### Scenario: 视频音频播放
- **WHEN** 时间线播放且当前时间范围内有视频片段
- **THEN** 播放视频片段的音轨
- **AND** 音频与画面同步

#### Scenario: 音频素材播放
- **WHEN** 时间线播放且当前时间范围内有音频片段
- **THEN** 播放音频素材
- **AND** 支持多轨道音频混合

#### Scenario: 播放同步
- **WHEN** 用户拖拽播放头 seek 到新位置
- **THEN** 音频同步跳转到对应位置
- **AND** 暂停时音频也暂停

### Requirement: Preview Transform Control
系统 SHALL 在预览区域支持素材变换操作。

#### Scenario: 选中显示控制框
- **WHEN** 用户在时间线选中一个视频/图片片段
- **THEN** 预览区域显示该素材的变换控制框
- **AND** 控制框包含 8 个控制点（4 角 + 4 边中点）
- **AND** 顶部显示旋转手柄

#### Scenario: 拖拽移动
- **WHEN** 用户在控制框内部拖拽
- **THEN** 素材位置 (x, y) 实时更新
- **AND** 预览画面实时反映位置变化

#### Scenario: 角点等比缩放
- **WHEN** 用户拖拽角点控制点
- **THEN** 素材等比缩放
- **AND** scale 属性实时更新

#### Scenario: 旋转操作
- **WHEN** 用户拖拽旋转手柄
- **THEN** 素材绕中心旋转
- **AND** rotation 属性实时更新

### Requirement: Video Aspect Ratio
系统 SHALL 支持预览视频比例选择。

#### Scenario: 比例选择
- **WHEN** 用户点击比例选择器
- **THEN** 显示预设比例选项：16:9、9:16、4:3、1:1
- **AND** 可选择自定义比例

#### Scenario: 比例应用
- **WHEN** 用户选择新的比例
- **THEN** 预览画布调整为对应比例
- **AND** 素材按新比例重新渲染

### Requirement: Subtitle Editing
系统 SHALL 提供字幕编辑功能。

#### Scenario: 添加字幕
- **WHEN** 用户在字幕轨道添加字幕片段
- **THEN** 可编辑字幕文本内容
- **AND** 可设置字幕时长

#### Scenario: 字幕样式设置
- **WHEN** 用户选中字幕片段
- **THEN** 属性面板显示字幕样式编辑器
- **AND** 可设置字号、字体、颜色
- **AND** 可设置背景色
- **AND** 可选择预设位置（顶部、中部、底部）

#### Scenario: 字幕预览渲染
- **WHEN** 预览当前时间范围内有字幕
- **THEN** 在预览画布上渲染字幕
- **AND** 应用字幕样式设置
- **AND** 支持多行自动换行

### Requirement: Asset Upload
系统 SHALL 支持用户上传自定义素材。

#### Scenario: 上传入口
- **WHEN** 用户查看素材面板
- **THEN** 显示「上传」按钮
- **AND** 支持点击触发文件选择
- **AND** 支持拖拽文件到面板

#### Scenario: 上传处理
- **WHEN** 用户选择文件上传
- **THEN** 检测文件类型（视频、图片、音频）
- **AND** 复制文件到项目 assets 目录
- **AND** 生成缩略图
- **AND** 提取媒体元数据

#### Scenario: 上传素材管理
- **WHEN** 素材上传成功
- **THEN** 素材出现在素材列表中
- **AND** 可拖拽到时间线使用
- **AND** 支持删除已上传的素材

### Requirement: Editor Cleanup
系统 SHALL 使用统一的编辑器组件。

#### Scenario: 删除冗余组件
- **WHEN** 代码重构完成后
- **THEN** VideoEditor 组件已删除
- **AND** 相关的 Player、Sidebar、EnhancedPlayer 组件已删除
- **AND** 统一使用 SimpleEditor

#### Scenario: 无遗留引用
- **WHEN** 编译项目时
- **THEN** 无 VideoEditor 相关的导入错误
- **AND** 所有编辑功能正常工作
