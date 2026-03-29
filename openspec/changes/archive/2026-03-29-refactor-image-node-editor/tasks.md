## 1. 定位逻辑与基础结构调整

- [x] 1.1 修改 `LinghuiNodeEditor.tsx` 定位常量：`TOOLBAR_STANDOFF = 22`，MainSurface gap 改为 0，确保面板永不遮挡节点
- [x] 1.2 修改 `LinghuiNodeEditor.tsx` 定位计算：TopBar 使用 `localNodeTop - toolbarHeight - TOOLBAR_STANDOFF`，MainSurface 使用 `localNodeTop + nodeHeight`，节点滚出可视区时面板被裁剪而非覆盖

## 2. TopBar hover 悬浮下拉

- [x] 2.1 在 `LinghuiNodeEditor.tsx` 中新增 `hoveredTool` state，工具按钮 `onMouseEnter` 设置、`onMouseLeave` 清除（按钮 + 下拉面板共用容器）
- [x] 2.2 渲染 hover 下拉面板：普通工具（多角度/扩图/打光/重绘）展示标题 + 描述 + 预设列表（含应用按钮），从 `IMAGE_TOOL_PRESETS` 读取数据
- [x] 2.3 渲染宫格工具 hover 下拉面板：宫格类型选择器（4/9/16/25格）+ 已选格子编号列表 + 清空按钮 + 生成图片节点按钮
- [x] 2.4 在 `LinghuiPage.css` 中新增 hover dropdown 样式（position absolute、背景模糊、圆角、阴影）

## 3. 宫格 overlay 移到节点卡片

- [x] 3.1 在 `ImageNode.tsx` 中增加宫格网格 overlay 渲染逻辑：当 `activeTool` 为 `grid-split` 且指向当前节点时，在节点图片上叠加可点击的网格
- [x] 3.2 宫格格子点击切换选中/取消状态，选中状态通过共享 state（提升到 LinghuiNodeEditor 或 context）与 TopBar 下拉面板同步
- [x] 3.3 在 `LinghuiPage.css` 中新增宫格 overlay 样式（网格线、选中高亮、格子编号）
- [x] 3.4 将 `ImageNodeEditor.tsx` 中的 `handleExecuteGridSplit` 逻辑迁移到 `LinghuiNodeEditor.tsx` 或新建 hook，由 TopBar 下拉面板触发

## 4. ImageNodeEditor 精简

- [x] 4.1 删除 Header 区域（`linghuiEditorHeader`）— TopBar 已承担标题职责
- [x] 4.2 删除 mode tabs（`linghuiEditorRefModes` 中的生成图片/导入输出切换）
- [x] 4.3 删除 MainSurface 内的 tool panel 渲染（`linghuiEditorToolSection` 及相关代码）— 已移到 TopBar hover 下拉
- [x] 4.4 删除主图预览区和结果集合网格（`linghuiEditorImageCollection` 在生成模式中的渲染）— 图片展示在节点本身完成
- [x] 4.5 删除 Bottom Toolbar 中的宫格按钮 — 入口只在 TopBar
- [x] 4.6 拆分比例+分辨率合并下拉为两个独立 Select：`[3:4▾]` 使用 `IMAGE_ASPECT_RATIOS`，`[2K▾]` 使用 `IMAGE_RESOLUTIONS`
- [x] 4.7 导入模式渲染极简 toolbar：只有 [替换图片] [清空] [运行] 三个按钮，删除拖拽上传区、已导入图片集合等 UI

## 5. 导入节点单图限制

- [x] 5.1 修改导入节点的图片添加逻辑：替换而非追加，`appendImportedImages` 改为覆盖行为（只保留最新一张）
- [x] 5.2 `ImageNode.tsx` 导入节点不显示展开按钮和计数 badge（只有一张图）

## 6. 展开态阻止编辑框

- [x] 6.1 `ImageNode.tsx` 将 `isExpanded` 状态暴露出来（通过 context 或 data attribute）
- [x] 6.2 `useLinghuiCanvasNodeInteractions.ts` 的 `handleNodeClick` 增加判断：如果目标节点处于展开态，不调用 `openNodeEditor()`

## 7. 清理与样式

- [x] 7.1 删除 `LinghuiPage.css` 中不再使用的样式类（`linghuiEditorGridTool` 等 MainSurface 内的宫格面板样式，工具面板样式保留供 VideoNodeEditor 使用）
- [x] 7.2 删除 `ImageNodeEditor.tsx` 中不再使用的 import/state/util（`splitGridType`、`selectedSplitCells`、`isSplittingGrid`、`handleDropImage`、`handleSelectImage` 等导入模式和宫格相关代码）
- [x] 7.3 验证所有改动后的交互流程：收起点击弹编辑框、展开态阻止编辑框、hover 工具下拉、宫格 overlay 选择和执行、导入节点极简编辑器
