## Context
Koma Studio 是 Electron + React 桌面应用，核心流程涉及大量媒体资源处理和 AI 服务调用。
当前无代码分割、无懒加载、启动串行化、媒体缓存无上限，随着项目和插件增多，性能问题会加剧。

## Goals
- 首屏加载时间降低 40%+（通过代码分割 + 懒加载）
- 内存占用可控（LRU 缓存替代无限 Map）
- Electron 启动时间降低 30%+（并行初始化）
- IPC 通信开销降低（批处理 + 缓存）
- 大型组件可维护性提升（拆分到 300 行以内）

## Non-Goals
- 不改变现有功能行为
- 不引入新的状态管理库
- 不重构插件系统架构
- 不改变 IPC 通信协议

## Decisions

### 1. Vite manualChunks 分包策略
- **Decision**: 按依赖类型分包：`vendor-react`、`vendor-antd`、`vendor-editor`、`vendor-player`
- **Why**: antd (~800KB)、codemirror (~200KB)、xgplayer (~300KB) 是最大依赖，独立分包后可利用浏览器缓存
- **Alternative**: 使用 `splitVendorChunkPlugin` — 不够精细，无法控制分包粒度

### 2. React.lazy 懒加载边界
- **Decision**: 在 App.tsx 的视图切换层和 EditorView 的步骤切换层设置懒加载边界
- **Why**: 这两层是天然的代码分割点，用户不会同时使用所有视图
- **Alternative**: 路由级懒加载 — 项目未使用 React Router，视图切换基于 state

### 3. LRU 缓存策略
- **Decision**: VideoRenderer 和 SimpleExportRenderer 的 mediaCache 改为 LRU，上限 50 条
- **Why**: 大型项目可能有数百个媒体资源，无限缓存会导致内存溢出
- **Alternative**: WeakRef 缓存 — 不可控，GC 时机不确定

### 4. IPC 批处理实现
- **Decision**: 使用 microtask 队列合并同一 tick 内的 IPC 调用
- **Why**: 项目打开时会触发大量 config:get 和 fs:readFile 调用，合并可减少 IPC 开销
- **Alternative**: 手动 debounce — 增加延迟，不如 microtask 精确

### 5. Electron 启动并行化
- **Decision**: configManager.init 完成后，project/ffmpeg/plugin/chat 四个服务并行初始化
- **Why**: 这四个服务之间无依赖关系，串行等待浪费时间
- **Constraint**: configManager 必须最先完成（其他服务依赖配置）

### 6. 组件拆分策略
- **Decision**: 仅拆分超过 500 行的组件，使用 composition 模式而非 HOC
- **Why**: 保持代码风格一致，避免过度拆分增加文件数量
- **Alternative**: 使用 render props — 项目已统一使用 hooks 模式

## Risks / Trade-offs
- **懒加载闪烁**: 首次切换视图时可能出现 loading 状态 → 使用 Suspense fallback 显示骨架屏
- **LRU 缓存 miss**: 频繁切换大量资源时可能增加重新加载 → 50 条上限足够覆盖单集场景
- **IPC 批处理复杂度**: 错误处理需要逐个分发 → 使用 Promise.allSettled 模式
- **并行初始化错误隔离**: 单个服务失败不应阻塞其他服务 → 使用 Promise.allSettled + 错误日志

## Migration Plan
1. 先做 Vite 构建优化（零风险，纯配置变更）
2. 再做 React.lazy 懒加载（低风险，不改变组件逻辑）
3. 然后做 Electron 启动优化（中风险，需要测试启动流程）
4. 接着做 IPC 优化（中风险，需要回归测试 IPC 调用）
5. 最后做组件拆分（低风险但工作量大，逐个组件拆分验证）
6. 媒体缓存优化可与其他步骤并行

## Open Questions
- xgplayer 是否支持按需导入？需要验证 tree-shaking 效果
- Electron 39 的 V8 版本是否支持所有 ES2022 特性？（影响 build.target 配置）
