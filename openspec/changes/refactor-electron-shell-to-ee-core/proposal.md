# Proposal: refactor-electron-shell-to-ee-core

## Why

Koma 当前 Electron 壳层仍然是手写启动模式：
- 根命令通过 `concurrently` 分别启动前端和主进程
- 主进程把窗口创建、服务初始化、协议注册、CSP、IPC 注册集中在一个入口文件
- IPC 同时混合了通用 invoke、控制器分发、流式事件广播三种模型

项目现有 `electron-integration` 规范已经要求基于 Electron-egg 框架组织桌面端能力，但当前实现只吸收了少量目录命名，没有真正接入 `ee-core` / `ee-bin` 的生命周期、命令编排和约定式结构。

本次变更的目标不是把 Koma 改造成 Electron-egg 示例应用，而是把 Koma 的 Electron 壳层迁移到 `ee-core` / `ee-bin` 托管模式，同时保留 Koma 已有的 React 前端、自定义安全模型、插件系统、Chat/MCP 流式通信能力。

## What Changes

- 引入 `ee-core` 和 `ee-bin`，将 Electron 启动、开发、构建链路切换为框架托管模式
- 重构 Electron 目录，形成 `main/config/preload/controller/service` 的约定式结构
- 将当前主进程入口中的职责拆分为：
  - 生命周期管理
  - 窗口与配置管理
  - 自定义协议与安全策略注册
  - 控制器型 IPC
  - 自定义流式/广播型 IPC
- 将普通请求型 IPC 逐步迁移为 `controller/<domain>/<method>` 路由
- 保留并显式定义 Koma 的自定义通道：
  - `chat:stream:*`
  - `chat:tool:*`
  - 其他不适合 controller 路由的事件型通道
- 保留 Koma 的安全边界：
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - 自定义 preload bridge
  - `koma-local://` 协议
  - 路径白名单与 CSP
- 为前端 `electronService` 增加迁移兼容层，避免一次性切断现有调用

## Non-Goals

- 不更换前端技术栈，不将 React 改为 Vue
- 不照搬 Electron-egg 示例中的宽松安全配置
- 不重写 Koma 的 Chat、Plugin、MCP 业务逻辑本身
- 不在本次变更中引入新的业务功能

## Impact

- Affected specs:
  - `electron-integration`
- Affected code:
  - `package.json`
  - `electron/`
  - `frontend/src/services/electronService.ts`
  - 打包与构建配置

## Risks

- `ee-core` 默认窗口配置与 Koma 当前安全模型不一致，若直接套用会带来安全回退
- 主进程目录迁移会影响 preload 输出路径、生产构建产物路径和打包配置
- Chat/MCP 流式通信不适合被粗暴收敛成单一 controller 路由，迁移时需要保留双通道模型
- 启动链路从 `concurrently` 切到 `ee-bin` 后，React dev server 端口、热更新时序、产物落点都需要重新校准

## Success Criteria

1. `dev` / `start` / `build` 命令由 `ee-bin` 驱动，且本地开发与生产启动均可用
2. Electron 主进程不再依赖单一巨型入口文件承担全部职责
3. 普通请求型 IPC 拥有清晰的 controller/service 分层与命名约定
4. Chat/MCP 流式事件、插件运行时能力与 `koma-local://` 媒体协议在新架构下保持可用
5. 整体安全边界不低于当前实现
