## MODIFIED Requirements

### Requirement: Electron-egg Framework Base
系统 SHALL 基于 Electron-egg 生态的 `ee-core` 与 `ee-bin` 构建和启动桌面端壳层，但必须保留 Koma 现有的 React 前端和自定义安全模型。

#### Scenario: 框架托管启动链路
- **WHEN** 开发者运行桌面端开发、构建或生产启动命令
- **THEN** 命令通过 `ee-bin` 编排 frontend 与 electron 的启动和构建流程
- **AND** Electron 主进程通过 `ElectronEgg` 生命周期启动
- **AND** 项目不得依赖手写单入口脚本承担全部启动职责

#### Scenario: 目录结构重组
- **WHEN** 组织 Electron 主进程代码时
- **THEN** 代码应按 `main/config/preload/controller/service` 分层组织
- **AND** 窗口启动、协议注册、安全配置、业务控制器和服务初始化应分离
- **AND** 不要求复制 Electron-egg 示例项目的前端技术栈或业务目录

#### Scenario: 保留 Koma 安全边界
- **WHEN** 接入 Electron-egg 生态能力时
- **THEN** 必须显式保持 `contextIsolation: true`
- **AND** 必须显式保持 `nodeIntegration: false`
- **AND** 必须继续使用 preload bridge 暴露渲染进程可访问能力

### Requirement: IPC Communication
系统 SHALL 将普通请求型 IPC 与事件流型 IPC 分层管理，以兼容 Electron-egg 控制器模式和 Koma 的实时流式能力。

#### Scenario: Controller 路由
- **WHEN** 渲染进程调用窗口、文件、项目、FFmpeg 或插件管理等请求型能力
- **THEN** 应优先通过 `controller/<domain>/<method>` 约定路由访问主进程
- **AND** 主进程应通过 controller/service 分层处理请求

#### Scenario: 流式事件保留
- **WHEN** 主进程需要向渲染进程主动推送流式或广播事件
- **THEN** 可继续使用自定义事件通道
- **AND** Chat 流式输出、工具审批等能力不得被强制降级为单次请求响应模型

#### Scenario: 迁移兼容
- **WHEN** Electron IPC 路由从旧实现迁移到新结构时
- **THEN** 前端应通过统一 `electronService` 适配
- **AND** 迁移期间可提供临时兼容映射，避免一次性破坏现有业务调用

### Requirement: Media Processing
系统 SHALL 在新壳层架构下继续支持本地媒体协议与媒体处理能力。

#### Scenario: 自定义本地协议
- **WHEN** 渲染进程访问本地图片、音频或视频资源
- **THEN** 系统继续通过 `koma-local://` 协议提供访问
- **AND** 视频与音频资源必须继续支持 Range 请求
- **AND** 协议处理必须维持路径白名单校验

### Requirement: Electron Security
系统 SHALL 在接入 Electron-egg 框架后维持不低于当前实现的桌面端安全策略。

#### Scenario: CSP 与访问限制
- **WHEN** 主窗口完成初始化
- **THEN** 系统应注册内容安全策略和必要的访问源限制
- **AND** 仅允许受控来源访问本地协议、网络连接和媒体资源

#### Scenario: Preload API 暴露
- **WHEN** 渲染进程需要调用 Electron 能力
- **THEN** API 应通过 preload 中的白名单 bridge 暴露
- **AND** 渲染进程不得依赖 `window.require('electron')` 直接获取 Electron 原生对象
