# Resource Management Capability

## ADDED Requirements

### Requirement: REQ-RES-001 Resource Import
系统 MUST 支持用户导入视频、音频、图片资源到项目中。

#### Scenario: 通过文件选择器导入视频
Given 用户点击「导入」按钮
When 用户选择一个 MP4 视频文件
Then 系统复制文件到项目目录
And 系统提取视频元数据（分辨率、帧率、时长）
And 系统生成缩略图
And 资源显示在资源库中

#### Scenario: 通过拖拽导入音频
Given 用户拖拽一个 MP3 文件到资源库区域
When 文件被释放
Then 系统复制文件到项目目录
And 系统提取音频元数据（时长、采样率）
And 系统生成波形图
And 资源显示在资源库中

### Requirement: REQ-RES-002 Resource Preview
系统 MUST 支持用户在资源库中预览资源。

#### Scenario: 预览视频资源
Given 资源库中有一个视频资源
When 用户悬浮在资源上
Then 显示放大的缩略图
And 显示视频元数据（分辨率、时长、大小）

#### Scenario: 预览音频资源
Given 资源库中有一个音频资源
When 用户悬浮在资源上
Then 显示波形缩略图
And 显示音频元数据（时长、格式、大小）

### Requirement: REQ-RES-003 Resource Drag to Timeline
系统 MUST 支持用户将资源拖拽到时间线。

#### Scenario: 拖拽视频到时间线
Given 资源库中有一个视频资源
When 用户拖拽该资源到时间线空白位置
Then 在对应位置创建视频片段
And 片段时长等于资源时长
And 自动创建视频轨道（如果不存在）

### Requirement: REQ-RES-004 Resource Management
系统 SHALL 支持用户管理资源（删除、重命名）。

#### Scenario: 删除资源
Given 资源库中有一个未使用的资源
When 用户右键点击并选择「删除」
Then 资源从资源库中移除
And 资源文件从项目目录删除

#### Scenario: 删除已使用的资源
Given 资源库中有一个已在时间线使用的资源
When 用户右键点击并选择「删除」
Then 显示警告「该资源正在使用中」
And 用户可以选择强制删除或取消
