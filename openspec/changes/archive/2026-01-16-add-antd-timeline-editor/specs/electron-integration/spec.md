## ADDED Requirements

### Requirement: Electron-egg Framework Base
系统 SHALL 基于 Electron-egg 框架构建桌面应用。

**参考实现**: `E:\Workspace\2025\代码备份\electron-egg`

#### Scenario: 框架结构
- **WHEN** 构建 Electron 主进程时
- **THEN** 遵循 electron-egg 标准目录结构：
```
electron/
├── main.js           # 主进程入口（继承 electron-egg 模式）
├── preload/          # IPC 暴露脚本
│   └── index.js
├── controller/       # 业务控制器
│   ├── file.js       # 文件操作
│   ├── media.js      # 媒体处理
│   └── storage.js    # 存储管理
└── service/          # 服务层
    └── ffmpeg.js     # FFmpeg 调用封装
```
- **AND** 复用 electron-egg 的 IPC 通信模式
- **AND** 复用 electron-egg 的控制器-服务分层架构

#### Scenario: 前端服务封装
- **WHEN** 前端需要调用 Electron 功能
- **THEN** 通过 `src/services/electronService.ts` 统一封装
- **AND** 参考 electron-egg 的 `electronService.ts` 实现模式

### Requirement: IPC Communication
系统 SHALL 通过 Electron IPC 实现渲染进程与主进程通信。

#### Scenario: IPC 暴露
- **WHEN** 渲染进程需要调用主进程功能
- **THEN** 通过 preload 脚本暴露的 window.electron API 调用
- **AND** 使用 invoke 进行双向通信

#### Scenario: 错误处理
- **WHEN** IPC 调用失败时
- **THEN** 返回包含错误信息的 rejected Promise
- **AND** 前端显示友好的错误提示

### Requirement: File Operations
系统 SHALL 支持本地文件选择和操作。

#### Scenario: 选择媒体文件
- **WHEN** 用户点击「导入媒体」按钮
- **THEN** 打开系统文件选择对话框
- **AND** 根据类型过滤文件（视频、音频、图片、字幕）
- **AND** 支持多选

#### Scenario: 选择导出路径
- **WHEN** 用户触发导出操作
- **THEN** 打开系统保存对话框
- **AND** 提供默认文件名

### Requirement: Media Processing
系统 SHALL 支持媒体文件信息获取和处理。

#### Scenario: 获取媒体信息
- **WHEN** 导入媒体文件后
- **THEN** 调用 FFprobe 获取时长、分辨率、帧率等信息
- **AND** 返回结构化的 MediaInfo 对象

#### Scenario: 解析 SRT 字幕
- **WHEN** 导入 SRT 字幕文件
- **THEN** 解析文件内容为 Subtitle 数组
- **AND** 包含开始时间、结束时间、文本内容

#### Scenario: 生成缩略图
- **WHEN** 导入视频文件后
- **THEN** 使用 FFmpeg 提取指定时间点的帧
- **AND** 保存为缩略图文件

### Requirement: Export Pipeline
系统 SHALL 支持项目导出为视频文件。

#### Scenario: 开始导出
- **WHEN** 用户确认导出设置后
- **THEN** 系统开始 FFmpeg 渲染流程
- **AND** 实时报告进度百分比

#### Scenario: 进度更新
- **WHEN** 导出进行中
- **THEN** 主进程通过 IPC 发送进度事件
- **AND** 渲染进程更新进度条显示

#### Scenario: 取消导出
- **WHEN** 用户点击取消按钮
- **THEN** 终止 FFmpeg 进程
- **AND** 清理临时文件

### Requirement: FFmpeg Integration
系统 SHALL 集成本地 FFmpeg 进行媒体处理。

#### Scenario: FFmpeg 检测
- **WHEN** 应用启动时
- **THEN** 检测系统是否安装 FFmpeg
- **AND** 显示安装状态

#### Scenario: FFmpeg 调用
- **WHEN** 执行媒体处理操作
- **THEN** 通过子进程调用 FFmpeg
- **AND** 捕获标准输出和错误输出
- **AND** 解析进度信息
