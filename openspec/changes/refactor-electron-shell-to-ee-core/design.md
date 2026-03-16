# Design: refactor-electron-shell-to-ee-core

## Context

Koma 当前已经具备较完整的 Electron 能力层，但实现方式仍然偏“单入口脚本化”：
- 窗口配置、`koma-local://` 协议、CSP、服务初始化、IPC 注册集中在一个入口文件
- preload 同时承担白名单校验、bridge 暴露和若干业务 API 聚合
- Chat/MCP/插件等复杂能力通过大量自定义 IPC 通道运行

Electron-egg 提供的价值主要在于：
- `ee-bin` 统一管理开发、构建和启动命令
- `ee-core` 提供生命周期、配置读取、窗口启动与目录约定
- controller / service / preload / config 的结构化组织方式

但 Electron-egg 示例项目的默认安全模型并不适合 Koma，尤其是：
- `contextIsolation: false`
- `nodeIntegration: true`
- 渲染进程直接读取 `ipcRenderer`

因此本设计采用“框架托管 + Koma 安全与通信模型保留”的混合方案。

## Goals

- 让 Electron 启动和构建链路由 `ee-bin` / `ee-core` 托管
- 拆解 Koma 当前主进程入口的职责边界
- 建立稳定的 controller/service IPC 约定
- 为 Chat/MCP/插件流式通道保留自定义扩展点
- 保持现有 React/Vite 前端与安全模型不变

## Non-Goals

- 不追求与 Electron-egg 示例项目一字不差的目录和代码风格
- 不把所有 IPC 强制改成同一种路由模型
- 不在本次迁移中重写业务服务内部实现

## Current vs Target

### Current

- 根命令：
  - `dev`: `concurrently` 并行启动前端和 Electron
  - `build`: 手工串联前后端构建
- 主进程：
  - `electron/src/main.ts` 负责窗口、协议、CSP、IPC、服务初始化
- 目录：
  - `electron/src/controller/*`
  - `electron/src/service/*`
  - `electron/src/preload/index.ts`
- IPC：
  - 普通请求：`window:*`、`fs:*`、`plugin:*`、`controller + controller.xxx.method`
  - 事件流：`chat:stream:*`、`chat:tool:*`

### Target

```text
electron/
├── main.ts
├── config/
│   ├── config.default.ts
│   ├── config.local.ts
│   └── config.prod.ts
├── preload/
│   ├── index.ts
│   ├── bridge.ts
│   └── lifecycle.ts
├── controller/
│   ├── app.ts
│   ├── dialog.ts
│   ├── fs.ts
│   ├── project.ts
│   ├── ffmpeg.ts
│   ├── plugin.ts
│   └── window.ts
├── service/
│   └── ...
└── bootstrap/
    ├── protocol.ts
    ├── security.ts
    ├── services.ts
    └── ipc-chat.ts
```

说明：
- `main.ts` 只负责创建 `ElectronEgg`、注册 lifecycle/preload、启动 app
- 生命周期中完成协议、安全策略、服务初始化、窗口 ready 后行为
- 普通 controller 走约定式路由
- Chat 相关保留在独立 bootstrap 中注册自定义 IPC

## Command and Build Strategy

### Root Scripts

根脚本从手工命令切换为：
- `dev`: `ee-bin dev`
- `dev-frontend`: `ee-bin dev --serve=frontend`
- `dev-electron`: `ee-bin dev --serve=electron`
- `build`: `ee-bin build --cmds=frontend` + Electron build
- `start`: `ee-bin start`

### ee-bin Config

新增 `cmd/bin.js`，约束：
- frontend 目录仍为 `./frontend`
- frontend dev 端口固定为 `5173`
- Electron 开发命令从仓库根启动
- TypeScript 主进程构建交由 `ee-bin build` 处理
- 前端产物仍落到 `public/dist`

### Packaging

打包阶段需要校准以下内容：
- Electron 主进程输出目录
- preload 输出目录
- `public/dist` 的复制或引用路径
- `electron-builder` 的主入口与 `files/extraResources`

是否继续使用代码混淆/加密，不作为本次迁移前置条件。

## Lifecycle Design

### `main.ts`

负责：
- new `ElectronEgg()`
- 注册：
  - `ready`
  - `electron-app-ready`
  - `window-ready`
  - `before-close`
  - `preload`

不负责：
- 直接创建窗口
- 直接注册所有 IPC
- 直接初始化所有业务服务

### `Lifecycle.ready`

负责：
- 注册 `koma-local://` 协议
- 注册 CSP / 安全头
- 初始化项目、FFmpeg、插件等服务
- 注册 Chat/MCP 自定义 IPC bootstrap

### `Lifecycle.electronAppReady`

负责：
- 单实例处理
- App 级事件绑定

### `Lifecycle.windowReady`

负责：
- 主窗口 ready-to-show 行为
- DevTools 打开策略
- F12 / 快捷键处理

## Security Model

这一部分必须显式覆盖 Electron-egg 示例默认值。

### Required Defaults

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox` 按 Koma 当前兼容性评估后决定，默认不降低现有边界
- preload 通过 `contextBridge.exposeInMainWorld` 暴露 API

### Preserved Security Features

- `koma-local://` 文件协议与 Range 支持
- 路径访问白名单
- CSP 限制 `script-src/style-src/connect-src/media-src`
- 渲染进程不使用 `window.require('electron')`
- preload 白名单校验 invoke/listen channel

## IPC Migration Strategy

## 1. Request/Response IPC

以下通道迁移为 controller 路由：
- `app`
- `window`
- `dialog`
- `fs`
- `project`
- `ffmpeg`
- 大部分 `plugin` 管理能力

目标命名：
- `controller/app/getPath`
- `controller/window/minimize`
- `controller/project/list`

前端侧通过统一 route helper 或 `electronService` 适配，不要求业务组件直接感知迁移。

## 2. Event/Stream IPC

以下通道保留自定义事件模型：
- `chat:stream:chunk`
- `chat:stream:tool`
- `chat:stream:done`
- `chat:stream:error`
- `chat:tool:pending`
- `chat:tool:approved`
- `chat:tool:rejected`

原因：
- 这些通道本质是主进程主动推送，而不是单次请求响应
- 强制改造成 controller 路由不会提升清晰度，反而会削弱语义

## 3. Compatibility Layer

迁移期间保留别名兼容：
- preload 中允许旧调用短期映射到新 controller 路由
- `frontend/src/services/electronService.ts` 先做适配，不要求前端业务代码同步大改

兼容层在迁移后期再收敛清理。

## Controller / Service Split

### Controller Responsibilities

- 参数校验和解包
- IPC event 上下文处理
- 调用 service
- 返回结构化结果

### Service Responsibilities

- 项目存储
- 文件系统操作
- FFmpeg 调度
- 插件运行时
- Chat/MCP/Agent 业务逻辑

说明：
- Chat 业务逻辑继续放在 service 层
- Chat IPC 注册不强行塞进普通 controller 目录扫描逻辑

## Migration Phases

### Phase 1: Shell Bootstrap

- 接入 `ee-core` / `ee-bin`
- 建立 `electron/main.ts`
- 建立 `config` / `preload` / `lifecycle`
- 跑通 dev/start/build 最小链路

### Phase 2: Static Capabilities

- 迁移窗口、对话框、文件系统、项目、FFmpeg 等请求型能力
- 前端 `electronService` 接入兼容层

### Phase 3: Advanced Channels

- 迁移插件运行时管理
- 抽离 Chat/MCP bootstrap
- 保持流式事件稳定

### Phase 4: Packaging and Cleanup

- 收敛旧入口和旧脚本
- 校准打包输出
- 清理不再需要的兼容代码

## Open Questions

- `ee-bin build` 对当前 Electron TypeScript 输出目录的具体约束，需要在实施阶段用最小样例验证
- `ee-core` 对 controller 自动发现的命名/导出约束，需要在第一阶段用最小集验证
- 打包产物是否继续采用当前 `electron-builder` 配置，还是同步迁入 `cmd/builder*.json` 形式，需要在实现前确定
