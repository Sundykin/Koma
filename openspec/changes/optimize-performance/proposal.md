# Change: 全面性能优化 (Super Optimization)

## Why
Koma Studio 当前存在多个性能瓶颈：前端无代码分割导致首屏加载慢、大型组件未拆分导致渲染开销大、Vite 构建未优化、Electron 启动流程串行阻塞、媒体资源无 LRU 缓存策略导致内存泄漏风险、IPC 调用无批处理和去重机制。这些问题在项目规模增长后会显著影响用户体验。

## What Changes

### 1. 前端构建优化 (Vite Build)
- 配置 `manualChunks` 实现依赖分包（antd、react、codemirror、xgplayer 独立 chunk）
- 启用 CSS code splitting
- 配置 `build.rollupOptions.output` 优化产物结构
- 添加 `vite-plugin-compression` 支持 gzip 预压缩
- 配置 `build.target` 为 `esnext`（Electron 环境无需兼容旧浏览器）

### 2. React 懒加载与代码分割
- App.tsx 中 SettingsPage、PluginManager、ChatPage、EditorView 改为 `React.lazy` + `Suspense`
- EditorView 内部的 AssetManager、Storyboard、SimpleEditor 改为懒加载
- 大型 Modal 组件（CharacterDetailModal、PropDetailModal）改为动态导入

### 3. 大型组件拆分
- Storyboard.tsx (1320行) → 拆分为 StoryboardCanvas、StoryboardControls、StoryboardState
- SimpleTimeline.tsx (1100行) → 拆分为 TimelineTracks、TimelineRuler、TimelineControls
- SimplePropertiesPanel.tsx (759行) → 拆分为 PropertySections 子组件

### 4. 状态管理优化
- Zustand store 添加 `selector` 精细订阅，避免不必要的重渲染
- 为 projectStore 和 globalStore 的高频读取路径添加 `shallow` 比较
- taskQueueStore 适配层标记 `@deprecated`，推动直接使用 TaskManager

### 5. 媒体与渲染引擎优化
- VideoRenderer.mediaCache 改为 LRU 缓存（限制最大条目数）
- SimpleExportRenderer 添加缓存大小上限和自动清理
- 图片/视频预加载添加并发控制（最多 4 个并行加载）
- Canvas 渲染添加 `requestAnimationFrame` 节流

### 6. Electron 启动优化
- `initServices()` 中非关键服务改为并行初始化
- 插件初始化从串行改为分组并行（按类型分组）
- IPC 路由注册延迟到窗口创建后
- 配置管理器初始化与窗口创建并行

### 7. IPC 通信优化
- 添加 IPC 请求批处理（合并短时间内的多次同类调用）
- 添加 IPC 响应缓存（对 config:get、plugin:list 等只读调用缓存）
- 文件操作添加请求去重（相同路径的并发读取合并为一次）

### 8. 前端启动流程优化
- `bootstrap()` 中 cleanupDuplicateChannels 和 initializeProviderPlugins 并行执行
- 工作流委托注册延迟到首次使用时
- Ant Design 按需加载（已使用 tree-shaking，确认无全量导入）

## Impact
- Affected specs: `ui-layout`, `media-playback`, `electron-integration`, `timeline-editing`, `export`
- Affected code:
  - `frontend/vite.config.ts` — 构建配置
  - `frontend/src/App.tsx` — 懒加载入口
  - `frontend/src/index.tsx` — 启动流程
  - `frontend/src/components/editor/EditorView.tsx` — 懒加载
  - `frontend/src/components/storyboard/Storyboard.tsx` — 组件拆分
  - `frontend/src/components/editor/SimpleTimeline.tsx` — 组件拆分
  - `frontend/src/engine/VideoRenderer.ts` — LRU 缓存
  - `frontend/src/services/simpleExportRenderer.ts` — 缓存优化
  - `electron/src/main.ts` — 启动并行化
  - `frontend/src/services/plugin/PluginInitializer.ts` — 并行初始化
  - `frontend/src/utils/ipcRenderer.ts` — IPC 批处理
