## 1. Vite 构建优化
- [x] 1.1 配置 `build.rollupOptions.output.manualChunks` 分包（react/antd/codemirror/xgplayer）
- [x] 1.2 设置 `build.target: 'esnext'` 和 `build.cssCodeSplit: true`
- [x] 1.3 添加 `build.reportCompressedSize: false` 加速构建
- [x] 1.4 配置 `build.chunkSizeWarningLimit: 1000` 并验证产物大小
- [x] 1.5 验证构建产物：确认分包正确、无重复依赖

## 2. React 懒加载
- [x] 2.1 App.tsx: 将 SettingsPage、PluginManager、ChatPage 改为 `React.lazy` 动态导入
- [x] 2.2 App.tsx: 将 EditorView 改为 `React.lazy` 动态导入
- [x] 2.3 App.tsx: 添加 `Suspense` 包裹，配置加载骨架屏 fallback
- [x] 2.4 EditorView.tsx: 将 AssetManager、Storyboard、SimpleEditor 改为 `React.lazy`
- [x] 2.5 EditorView.tsx: 添加 `Suspense` 包裹各步骤内容
- [x] 2.6 验证：切换视图时懒加载正常工作，无白屏

## 3. Electron 启动优化
- [x] 3.1 main.ts: `initServices()` 中 configManager.init 后，project/ffmpeg/plugin/chat 改为 `Promise.allSettled` 并行
- [x] 3.2 main.ts: IPC 路由注册与窗口创建并行（registerIpcRoutes 不依赖 mainWindow）
- [x] 3.3 PluginInitializer.ts: 将插件初始化从串行 for 循环改为按类型分组并行（同类型内串行，不同类型间并行）
- [x] 3.4 验证：应用启动正常，所有服务初始化成功

## 4. 前端启动优化
- [x] 4.1 index.tsx: `bootstrap()` 中 cleanupDuplicateChannels 和 initializeProviderPlugins 改为并行
- [x] 4.2 index.tsx: initWorkflowDelegates 保留调用但标注可延迟
- [x] 4.3 验证：前端启动正常，插件和渠道配置正确加载

## 5. IPC 通信优化
- [x] 5.1 创建 `frontend/src/utils/ipcCache.ts`：实现只读 IPC 调用缓存（TTL 5s）+ 请求去重
- [x] 5.2 ipcRenderer.ts: 集成缓存包装器，对可缓存通道自动缓存
- [x] 5.3 添加文件读取请求去重（相同路径并发读取合并）
- [x] 5.4 验证：IPC 调用正常，缓存命中率合理

## 6. 媒体缓存优化
- [x] 6.1 创建 `frontend/src/utils/LRUCache.ts`：通用 LRU 缓存实现（支持 dispose 回调）
- [x] 6.2 VideoRenderer.ts: mediaCache 改为 LRU 缓存（上限 50 条），添加 dispose 回调清理 video 元素
- [x] 6.3 simpleExportRenderer.ts: mediaCache 改为 LRU 缓存（上限 30 条）
- [x] 6.4 添加媒体预加载并发控制（最多 4 个并行）
- [x] 6.5 验证：视频播放和导出正常，内存占用可控

## 7. 大型组件拆分
- [x] 7.1 Storyboard.tsx: 拆分为 useStoryboardState hook（状态+逻辑）+ Storyboard（纯渲染）
- [x] 7.2 SimpleTimeline.tsx: 拆分为 useTimelineState hook（状态+逻辑）+ SimpleTimeline（纯渲染）
- [x] 7.3 SimplePropertiesPanel.tsx: 拆分为 usePropertiesPanelState hook（状态+逻辑）+ SimplePropertiesPanel（纯渲染）
- [x] 7.4 CharacterDetailModal.tsx → useCharacterDetailState hook + 纯渲染；PropDetailModal.tsx → usePropDetailState hook + 纯渲染
- [x] 7.5 验证：拆分后所有文件诊断通过，导入引用正常，无回归问题

## 8. 状态管理优化
- [x] 8.1 KeyframeEditor、PropertiesPanel、ExportDialog、useEditorShortcuts 添加 `useShallow` selector
- [x] 8.2 高频更新的 store 消费者添加 `useShallow` 比较
- [x] 8.3 为 App.tsx 中的 useMemo/useCallback 检查依赖数组完整性
- [x] 8.4 验证：React DevTools Profiler 确认不必要的重渲染减少
