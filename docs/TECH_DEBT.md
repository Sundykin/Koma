# Koma 技术债务分析 (2026-02-03)

## 架构与依赖
- 结构: frontend (React/Vite) / electron (main+preload) / packages (plugin-sdk + plugins) / examples。
- 循环依赖检测结果（frontend/src）：
  - services/plugin/PluginInitializer.ts -> services/plugin/PluginLoader.ts -> services/plugin/PluginInitializer.ts
  - chat/ChatSession.ts -> chat/plugins/PluginManager.ts -> chat/plugins/types.ts -> chat/ChatSession.ts
- electron/src 与 packages 未发现循环依赖。

## 类型安全与错误处理概览
- TypeScript strict: frontend/tsconfig.json 未开启 strict；electron 与 packages/plugin-sdk 已开启 strict。
- any 使用统计（仅代码文件 ts/tsx/js/jsx）：
  - frontend/src: 109/287 文件含 any，any=438，as any=131
  - electron/src: 26/42 文件含 any，any=119，as any=10
  - packages: 11/18 文件含 any，any=50，as any=9
- 未发现空 catch 块；发现至少 1 处未处理 Promise（frontend/src/App.tsx: loadEpisodeShots.then 无 catch）。

## 技术债务清单（按优先级）
- P0 循环依赖（插件加载）: frontend/src/services/plugin/PluginInitializer.ts <-> frontend/src/services/plugin/PluginLoader.ts — 影响范围: 插件加载与初始化顺序、构建时 Tree-shaking/缓存异常、运行时未定义风险 — 修复建议: 抽离共享类型/工具到独立模块，反转依赖（Initializer 只接收 Loader 接口），仅保留 type import — 估算工时: 0.5-1 天
- P0 循环依赖（聊天插件）: frontend/src/chat/ChatSession.ts -> chat/plugins/PluginManager.ts -> chat/plugins/types.ts -> ChatSession.ts — 影响范围: ChatSession 初始化与插件扩展点、热更新/测试不稳定 — 修复建议: 将 types.ts 下沉为纯类型模块或移到 chat/types，插件管理与 Session 解耦 — 估算工时: 0.5-1 天
- P1 前端未开启 strict + any 分布广: frontend/src 109/287 文件含 any（any=438, as any=131）— 影响范围: 运行时类型错误、重构风险高 — 修复建议: 分阶段开启 noImplicitAny/strict，优先替换 IPC/插件边界 any 为 unknown + schema 校验（zod/valibot），建立类型基线 — 估算工时: 5-10 天
- P1 IPC/插件边界类型弱: electron/preload 与 frontend services 中大量 any（IPC args、window.electronAPI）— 影响范围: 进程间契约不一致导致崩溃、难以回归测试 — 修复建议: 建立共享 IPC contract（types + runtime 校验），封装统一的 invoke/handle 层并落日志 — 估算工时: 3-5 天
- P1 未处理 Promise / 弱错误反馈: frontend/src/App.tsx 的 loadEpisodeShots.then 无 catch；多处仅 console.error — 影响范围: 失败静默、用户无感知 — 修复建议: 统一 errorHandler，关键链路全部 try/await+catch 并上报 UI 提示 — 估算工时: 0.5-1 天
- P2 大型组件与渲染复杂度: Storyboard.tsx(≈49KB)、SimpleTimeline.tsx(≈44KB)、SimplePropertiesPanel.tsx(≈31KB) — 影响范围: 维护成本高、渲染性能与回归风险上升 — 修复建议: 拆分子组件+memo、按需懒加载、时间线数据虚拟化 — 估算工时: 3-6 天
- P2 导出/FFmpeg/上传封装重复: simpleExportRenderer.ts、ffmpegManager.ts、uploadService.ts、electronService.ts 等存在重复分支 — 影响范围: 行为不一致、修复重复劳动 — 修复建议: 合并为单一服务层，抽取共享 helper 与统一错误策略 — 估算工时: 2-4 天
- P2 插件运行时强依赖 window 动态注入: PluginSandbox/PluginLoader 大量动态属性访问 — 影响范围: 隐性错误难排查、安全边界不清晰 — 修复建议: 明确 Plugin API contract + capability registry，限制动态字段 — 估算工时: 2-3 天
