# Tasks

## 1. 节点折叠态渲染

- [x] 1.1 在 `linghuiNodes.ts` 中为每个 widget 添加 `__linghuiActive` 检查，非激活时属性编辑 widget 返回零高度且不绘制
- [x] 1.2 修改 `ResultPreviewWidget` 支持双态：非激活时渲染为紧凑缩略图（≤160px 宽），激活时渲染完整预览
- [x] 1.3 实现节点 `computeSize()` 重写，根据激活状态动态返回折叠/展开尺寸
- [x] 1.4 折叠态节点绘制状态徽标（idle/running/succeeded/failed/stale 对应色点或小图标）

## 2. 节点激活状态管理

- [x] 2.1 在 `LinghuiCanvas.tsx` 中引入 `activeNodeId` 追踪，选中节点时设置 `node.__linghuiActive = true`，取消选中/选中其他时清除旧节点标志
- [x] 2.2 激活状态变化时调用 `setDirty` 触发重绘，并更新节点尺寸
- [x] 2.3 确保画布平移/缩放时展开态节点内容正确跟随

## 3. 移除浮动节点检查面板

- [x] 3.1 从 `LinghuiPropertiesPanel.tsx` 中移除 `linghuiNodeInspectorPanel` 渲染逻辑，保留工作区面板和日志面板
- [x] 3.2 从 `LinghuiCanvas.tsx` 的 `LinghuiCanvasSelection` 中移除 `anchor` 定位计算（简化为仅传递节点引用）
- [x] 3.3 从 `LinghuiPage.css` 中移除 `linghuiNodeInspectorPanel` 相关样式
- [x] 3.4 更新 `LinghuiPage.tsx` 中 `selection` 使用方式，移除不再需要的状态和函数

## 4. 折叠/展开视觉效果

- [x] 4.1 在 `LinghuiPage.css` 中为折叠态节点添加紧凑样式（`.isCollapsed` 减少内边距）
- [x] 4.2 为展开态节点添加扩展样式（完整编辑区布局保持不变）
- [x] 4.3 首版使用即时切换（后续可添加 requestAnimationFrame 插值动画）

## 5. 验证与修复

- [x] 5.1 验证折叠态节点连线端口正确可见、可连接（LiteGraph 框架保证，不受 widget 显隐影响）
- [x] 5.2 验证展开态属性编辑器修改正确触发 stale 标记和图变更（通过 `requestNodeMutation` → `_linghuiNotifyNodeMutation` → `handleNodeMutate` → `markNodesAsStale` 链路）
- [x] 5.3 验证节点序列化/反序列化不受激活状态影响（`serialize_widgets = false` + `__linghuiActive` 不在 `properties` 中）
- [x] 5.4 验证无新增 TypeScript 编译错误（仅保留 2 个 pre-existing `@litegraph-ts/core` 类型错误）
