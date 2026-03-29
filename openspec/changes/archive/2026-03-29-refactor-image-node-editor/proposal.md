## Why

图片节点编辑弹窗当前布局臃肿、操作入口分散，导致用户认知负担大。主图预览和结果集合在 MainSurface 中重复展示（节点本身已能查看），导入/生成双模式需要用户理解并手动切换，工具预设面板点击展开后挤占提示词空间，底部工具栏控件过多且与 TopBar 功能重复。需要将图片操作回归节点本身，精简编辑器为纯编辑职能。

## What Changes

- **删除导入模式 UI 及模式切换 tabs**：图片节点编辑器不再有显式的 import/generate 模式切换，导入通过拖图到画布或右键上传完成，编辑器根据节点模式隐式渲染不同内容
- **删除 MainSurface 内的主图预览和结果集合**：所有图片查看、设为主图、下载操作在节点卡片展开态完成
- **导入节点限制为单张图片**：不再支持多图导入到同一节点
- **导入节点编辑器精简为单行 toolbar**：只有 [替换图片] [清空] [运行]
- **TopBar 工具改为 hover 悬浮下拉**：多角度/扩图/打光/重绘的预设面板通过鼠标悬浮触发，不再在 MainSurface 内展开
- **宫格切分 UI 移到节点本身**：网格 overlay 渲染在节点图片上，TopBar hover 下拉面板只展示已选格子摘要和执行按钮，删除全选按钮
- **删除 Bottom Toolbar 宫格按钮**：宫格入口只在 TopBar
- **比例和分辨率拆分为两个独立下拉**：取代当前的合并选择器
- **定位调整**：MainSurface 顶边贴节点底边 (0px gap)，TopBar 远离节点 (~22px)，两个面板永不遮挡节点
- **展开态阻止编辑框弹出**：节点展开状态下点击不触发 openNodeEditor，防止误操作

## Capabilities

### New Capabilities

_(无新增能力，所有改动是对已有能力的重构)_

### Modified Capabilities

- `linghui-studio`: 图片节点编辑器交互模型重构 — 删除导入模式 UI、主图预览、结果集合；TopBar hover 下拉；宫格操作移到节点本身；导入节点单图限制和精简编辑器；定位逻辑调整；展开态阻止编辑框

## Impact

- **前端组件**：`ImageNodeEditor.tsx`（大幅精简）、`LinghuiNodeEditor.tsx`（hover 下拉机制 + 定位）、`ImageNode.tsx`（宫格 overlay + 展开态行为）、`useLinghuiCanvasNodeInteractions.ts`（点击守卫）
- **样式**：`LinghuiPage.css` 新增 hover dropdown 和宫格 overlay 样式
- **类型**：`linghuiCanvasShared.ts` 可能需要宫格选择状态类型
- **无 API 变更，无数据迁移，无新依赖**
