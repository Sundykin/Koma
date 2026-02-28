## MODIFIED Requirements

### Requirement: Electron-egg Framework Base
系统 SHALL 基于 Electron-egg 核心运行时构建桌面应用，并以一次性切换后的新运行时作为唯一执行路径。

#### Scenario: 框架结构
- **WHEN** 构建 Electron 主进程时
- **THEN** 遵循 electron-egg 标准目录结构并由 runtime bootstrap 统一装配：
```
electron/
├── main.ts            # 主进程入口（仅挂载新 runtime）
├── bootstrap/         # 运行时引导与依赖装配
├── lifecycle/         # 应用生命周期
├── preload/           # IPC 暴露脚本
├── ipc/               # 类型化 contract + router
├── controller/        # 业务控制器
└── service/           # 服务层
```
- **AND** 复用 electron-egg 的控制器-服务分层架构
- **AND** 不保留 legacy 入口分支或兼容注入路径

#### Scenario: 前端服务封装
- **WHEN** 前端需要调用 Electron 功能
- **THEN** 通过统一桥接服务（如 `electronService` 与各 domain bridge）访问
- **AND** 所有请求经由类型化 IPC contract
- **AND** 不再调用旧版通道别名

## ADDED Requirements

### Requirement: Core Three-page Renderer Shell
系统 SHALL 将渲染进程顶层 UI 收敛为核心三页，以匹配重构后的运行时主流程。

#### Scenario: 顶层导航收敛
- **WHEN** 用户进入应用主界面
- **THEN** 顶层导航仅展示项目总览、创作工作台、系统设置三个入口
- **AND** 其他能力作为三页内二级功能承载

#### Scenario: 路由与状态一致性
- **WHEN** 用户在三页之间切换
- **THEN** 页面状态通过统一 store 与 IPC 事件保持一致
- **AND** 不依赖已移除的 legacy 页面路由

### Requirement: Runtime Cutover Without Compatibility Layer
系统 SHALL 以一次性切换方式完成运行时替换，不保留兼容层。

#### Scenario: 冷启动切换
- **WHEN** 用户启动新版本应用
- **THEN** 系统直接进入新 runtime 初始化流程
- **AND** 不执行旧 runtime 的兜底分支

#### Scenario: 失败处理
- **WHEN** 切换过程出现不可恢复错误
- **THEN** 返回结构化错误并中止启动
- **AND** 提供明确的修复指引而非回退到旧运行时