# Change: Refactor to Electron-egg Runtime and Streamline Core Creation Flow

## Why
当前项目仍处于运行时改造中，底层框架、IPC 路由、Provider 体系和创作流程存在分叉，且 Sora2 依赖影响主流程稳定性。需要一次性明确新基线：迁移到 electron-egg 架构、完成 IPC 适配、移除 Sora2，并保障最小漫剧创作主流程可用。

## What Changes
- **BREAKING** 将 Electron 主进程统一到 electron-egg 运行时装配（main/lifecycle/controller/service）。
- **BREAKING** IPC 统一到 controller 路由语义，并通过 preload 适配层保持前端 `window.electronAPI` 接口稳定。
- **BREAKING** 移除 Sora2 Provider 及其相关 UI/流程入口，不再作为 ITV 默认或可选依赖。
- 保留并强化非 Sora2 的 ITV 主路径（如 Kling / Runway），确保分镜视频化可用。
- 优化漫剧创作最小主流程（剧本→分镜→资产→渲染）中的冗余操作与阻塞 bug。
- 持久层继续执行一次性迁移策略，切换后只写入新结构。

## Impact
- Affected specs:
  - `electron-integration`
  - `model-providers`
  - `itv`
  - `storage`
  - `ui-components`
- Affected code (expected):
  - `electron/src/main.ts`
  - `electron/src/lifecycle/**`
  - `electron/src/controller/**`
  - `electron/src/preload/**`
  - `electron/src/service/provider/**`
  - `electron/src/service/persistence/**`
  - `frontend/src/providers/itv/**`
  - `frontend/src/components/storyboard/**`
  - `frontend/src/components/asset/**`
  - `frontend/src/services/**`
  - `frontend/src/workflow/**`

## Validation Plan
- OpenSpec: `openspec validate refactor-electron-egg-core-runtime --strict`
- Runtime checks:
  - 冷启动与主窗口初始化
  - IPC 调用成功率（前后端路由对齐）
  - 非 Sora2 的 ITV 渲染链路可用
  - 最小创作主流程 E2E（剧本→分镜→资产→渲染）
