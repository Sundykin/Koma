## Context

灵绘图片节点编辑器当前采用双层浮动面板（TopBar + MainSurface），MainSurface 内堆叠了模式切换 tabs、主图预览、结果集合、工具预设面板、提示词编辑器和底部工具栏。TopBar 中的工具按钮通过 click 在 MainSurface 内展开预设面板，导致面板高度膨胀、遮挡核心编辑区域。导入和生成两种模式通过显式 tabs 切换，但用户实际上不需要感知这个概念。

相关文件：
- `LinghuiNodeEditor.tsx` — 编辑器容器、TopBar、定位逻辑
- `ImageNodeEditor.tsx` — 图片编辑器主体（968 行）
- `ImageNode.tsx` — 节点卡片组件
- `useLinghuiCanvasNodeInteractions.ts` — 节点点击/交互处理
- `LinghuiPage.css` — 所有样式

## Goals / Non-Goals

**Goals:**
- 将图片查看、主图选择等操作回归节点卡片本身，编辑器只负责编辑职能
- TopBar 工具通过 hover 悬浮下拉完成二级操作，不占用 MainSurface 空间
- 导入节点和生成节点根据模式隐式渲染不同编辑器，无需用户切换
- 导入节点限制为单张图片，编辑器精简为单行 toolbar
- 宫格操作在节点本身完成（网格 overlay），悬浮面板只展示摘要
- 面板永不遮挡节点

**Non-Goals:**
- 不改动视频/音频/文本/脚本节点的编辑器
- 不改动右键菜单
- 不改动节点的 React Flow 注册机制或数据模型
- 不涉及后端或 API 变更

## Decisions

### D1: TopBar 工具 hover 下拉替代 click 展开

当前 TopBar 工具按钮 click 后在 MainSurface 内渲染 `linghuiEditorToolSection`。改为：每个工具按钮 `onMouseEnter` 时在按钮正下方渲染 `position: absolute` 的悬浮面板，`onMouseLeave`（按钮 + 面板整体区域）时收起。

实现方式：在 `LinghuiNodeEditor.tsx` 中新增 `hoveredTool` state，TopBar 工具按钮和对应下拉面板共用一个容器元素以实现 hover 区域合并。`ImageNodeEditor.tsx` 中删除 `linghuiEditorToolSection` 相关渲染。

替代方案考虑：click toggle 模式 — 需要额外处理外部点击关闭，且与"点击节点弹编辑框"的交互产生冲突。hover 更轻量，符合工具面板的"预览/快选"定位。

### D2: 宫格 overlay 渲染在 ImageNode.tsx 内

当前宫格切分 UI 完全在 `ImageNodeEditor.tsx` 内渲染（大预览 + 网格 + 全选/清空）。改为：

- `ImageNode.tsx` 负责渲染网格 overlay（叠加在节点图片上），用户直接在节点上点选格子
- TopBar 宫格 hover 下拉只展示：宫格类型选择器 + 已选格子编号列表 + 清空按钮 + 执行按钮
- 删除全选按钮

宫格选择状态通过 `LinghuiNodeToolState` 扩展传递：当 `activeTool = { kind: 'image', nodeId, tool: 'grid-split' }` 时，`ImageNode.tsx` 读取此状态渲染 overlay。选中的格子通过 `LinghuiNodeEditor` 或共享 context 在 TopBar 下拉和 ImageNode 之间同步。

### D3: 导入节点单图 + 极简编辑器

导入节点 (`mode === 'import'`) 限制为单张图片。`ImageNodeEditor.tsx` 根据 `mode` 判断渲染内容：

- `import`: 只渲染一行 toolbar — [替换图片] [清空] [运行]
- `generate`: 渲染上游输入 + 提示词 + 底部工具栏

不再渲染 mode tabs、Header、主图预览、结果集合。

### D4: 比例和分辨率拆分

当前 `${aspectRatio}·${resolution}` 合并为一个 Select。拆为两个独立的 Select：
- `[3:4▾]` — 只选比例
- `[2K▾]` — 只选分辨率

数据源不变（`IMAGE_ASPECT_RATIOS` 和 `IMAGE_RESOLUTIONS`），只是 UI 分开。

### D5: 定位逻辑调整

```
TOOLBAR_STANDOFF = 22  (TopBar 距节点上方间距，当前 TOOLBAR_GAP = 10)
PANEL_GAP = 0          (MainSurface 贴节点底边，当前 TOOLBAR_GAP = 10)
```

核心约束：`toolbarBottom <= nodeTop` 且 `panelTop >= nodeBottom`。当节点滚出可视区时，面板跟着被裁剪而不是覆盖节点。

### D6: 展开态阻止编辑框

`useLinghuiCanvasNodeInteractions.ts` 中 `handleNodeClick` 增加判断：如果节点处于 `isExpanded` 状态，不调用 `openNodeEditor()`。

实现方式：`ImageNode.tsx` 需要将 `isExpanded` 状态暴露出来。可通过在节点 data 中存储 `viewExpanded` flag，或通过 `LinghuiNodeInteractionContext` 注册。优选后者以避免触发 React Flow 的节点数据更新。

## Risks / Trade-offs

- **Hover 交互在触摸设备上不可用** → 当前灵绘是桌面应用（Electron），触摸不是目标场景。如果未来支持，可增加 click 降级。
- **导入节点单图限制是 breaking change** → 现有多图导入节点在打开编辑器时只展示第一张，数据不丢失但用户需手动处理。实际上目前多图导入使用率极低，风险可控。
- **宫格状态在 TopBar 下拉和 ImageNode 间同步** → 需要共享状态通道。当前 `activeTool` 已经通过 props 从 `LinghuiCanvasStage` 传到两边，复用此通道加上一个 `selectedCells` state 即可。
