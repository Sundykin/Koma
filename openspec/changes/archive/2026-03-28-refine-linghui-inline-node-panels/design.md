## Context

灵绘当前使用 LiteGraph.js（`@litegraph-ts/core`）在 `<canvas>` 上渲染节点，节点内嵌多个自定义 widget（TextareaWidget、TextInputWidget、ReferenceWidget、ResultPreviewWidget）。选中节点后，一个 React 浮动面板 (`LinghuiNodeInspectorPanel`) 出现在节点旁边，使用 Ant Design 组件提供属性编辑。

这形成了"canvas widget 编辑 + React 面板编辑"的双入口，且面板在视觉上与节点分离。

## Goals / Non-Goals

- Goals:
  - 将节点从"始终展开全部 widget"改为"折叠/展开"双态
  - 折叠态只展示标题、状态、产物缩略图，显著减少画布信息密度
  - 展开态将属性编辑器直接集成到节点卡片内，消除浮动面板
  - 保留工作区信息面板和执行日志面板不变
- Non-Goals:
  - 不替换 LiteGraph.js 画布引擎
  - 不改变节点类型定义、连线逻辑或执行引擎
  - 不影响分组管理和画布操作

## Decisions

### Decision: 使用 LiteGraph widget 显隐控制实现折叠/展开，而非 React overlay

在 LiteGraph.js 架构下有三种方案：

| 方案 | 优点 | 缺点 |
|------|------|------|
| A: React overlay 卡片覆盖在 canvas 上 | 全面使用 React 组件，交互丰富 | 需要同步 canvas 坐标变换，拖拽/缩放时 overlay 易出现延迟漂移 |
| B: 增强 LiteGraph widget 显隐切换 | 利用现有 widget 系统，无坐标同步问题，节点渲染自然跟随画布变换 | widget 表现力有限，复杂控件需用 canvas 绘制 |
| C: 替换为 React Flow | 完全 React 化，组件能力最强 | 重写量巨大，偏离 MVP 增量优化目标 |

**选择方案 B**：在现有 LiteGraph widget 体系上实现折叠/展开。

**Why**

- 折叠态只需标题 + 状态 badge + 缩略图，canvas 绘制完全胜任
- 展开态的属性编辑器在 canvas widget 中已经存在（TextareaWidget、TextInputWidget 等），只需按激活状态控制显隐
- 避免 React overlay 与 canvas 坐标同步的复杂度和性能问题
- 增量修改，风险可控

**Alternatives considered**

- React overlay（方案 A）：未来若需要非常复杂的表单交互可以考虑，但当前 widget 能力已满足需求
- React Flow 替换（方案 C）：代价过大，后续大版本可评估

### Decision: 折叠态展示产物缩略图作为节点"名片"

折叠态节点除了标题和状态外，如果节点已有运行结果，应展示一个小尺寸的缩略图（约 160×90px）。

**Why**

- 用户在画布上浏览时，能快速识别每个节点产出了什么内容
- 对比 ComfyUI 等工具，折叠节点展示缩略图是被广泛验证的交互模式
- 缩略图来自现有 `ResultPreviewWidget`，只需调整渲染尺寸

### Decision: 展开态复用现有 canvas widget 编辑器，移除 React 浮动面板

展开态不再使用 React 浮动面板，而是直接利用 LiteGraph 节点内的 widget 编辑器。当节点激活时：

1. 所有属性 widget 变为可见
2. ResultPreviewWidget 切换为全尺寸预览
3. 节点尺寸自动扩展以容纳所有 widget

当节点取消激活时：

1. 属性 widget 隐藏
2. ResultPreviewWidget 切换为缩略图模式
3. 节点尺寸收缩为折叠态

**Why**

- 消除了 canvas widget 与 React 面板的双重编辑入口
- 编辑器与节点在空间上完全一体，不存在"跟随定位"问题
- 减少了 React 组件渲染开销

### Decision: 保留工作区面板和日志面板作为全局信息区

工作区统计面板（右上）和执行日志面板（右下）不受此次重构影响，继续作为固定浮动面板存在。

**Why**

- 这两个面板展示的是全局信息，不绑定特定节点
- 它们已经有清晰的定位和用途

## Implementation Approach

### 节点激活状态管理

在 `LinghuiCanvas.tsx` 中引入 `activeNodeId` 状态：
- 选中节点时设为该节点 ID
- 点击画布空白处或选中其他节点时清除旧的激活
- 通过 LiteGraph node 自定义属性 `__linghuiActive` 传递状态到 widget 层

### Widget 显隐逻辑

在 `linghuiNodes.ts` 中修改各 widget 的 `computeSize` 和绘制方法：
- 检查 `node.__linghuiActive` 标志
- 非激活节点：属性编辑 widget 高度返回 0 且不绘制；ResultPreviewWidget 切换为缩略图模式
- 激活节点：所有 widget 正常渲染，节点自动调整尺寸

### 节点尺寸动态调整

- LiteGraph 支持通过 `node.size` 和 `node.computeSize()` 控制节点尺寸
- 折叠态：固定为紧凑尺寸（约 200×80，有缩略图时约 200×160）
- 展开态：根据 widget 数量动态计算，与当前全展开尺寸一致

### 过渡动效

- LiteGraph canvas 不直接支持 CSS 动画
- 可通过在 `requestAnimationFrame` 循环中逐帧插值 `node.size` 实现平滑展开/折叠
- 或在首版简化为即时切换，后续再补动效

## Risks / Trade-offs

- LiteGraph canvas widget 的表现力不如 React 组件，复杂表单交互（如下拉选择、文件上传）在 canvas 内体验略逊
  - Mitigation: 当前 widget 已实现这些交互并可用；后续可评估 React overlay 方案做增强
- 折叠态节点尺寸变小，大量节点时连线可能更密集
  - Mitigation: 节点自动吸附和网格对齐可缓解
- 修改 widget 显隐可能影响 LiteGraph 的尺寸计算和序列化
  - Mitigation: 使用运行时标志控制渲染，不修改序列化数据
