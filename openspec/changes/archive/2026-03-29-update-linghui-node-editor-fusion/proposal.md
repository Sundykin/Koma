# Change: 重构灵绘节点编辑弹窗为画布融合式双区编辑态

## Why

当前灵绘节点编辑弹窗仍然是“单块悬浮卡片”形态，常常直接挡住被编辑节点；图片、视频节点又把上传区、提示词、工具预设和生成参数全部堆在同一个面板里，导致编辑噪音很高，也不符合“生成依赖上游、导入用于给下游复用”的实际使用方式。

用户希望灵绘的节点编辑态更像画布的一部分，而不是悬在节点上的独立窗口：围绕节点形成上方紧凑工具条和下方主编辑区，保留节点本体可见；同时按节点模式裁剪内容，弱化无关表单，并让提示词编辑器在视觉上与弹窗背景融为一体。

## What Changes

- 将灵绘轻编辑态改为围绕节点的双区布局：上方紧凑工具条，下方主编辑面板，中间保留节点主体可见
- 为图片节点和视频节点引入按模式裁剪的编辑结构
- 让图片节点生成模式以“上游输入 + 提示词 + 生成参数”为主，不再默认突出大上传区
- 让图片节点和视频节点的导入模式聚焦素材预览、上传、清空，不再展示无效的提示词和生成参数
- 将多角度、扩图、打光、重绘、高清、解析、合成等工具从主表单中拆出，改为独立的工具入口和次级工具面板
- 重写提示词编辑器在节点弹窗内的视觉层级，减少嵌套卡片感，同时保留 `@` 引用能力
- 定义节点编辑浮层在视口边缘的避让和降级策略，避免遮挡当前节点

## Impact

- Affected specs: `linghui-studio`
- Affected code:
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/ImageNodeEditor.tsx`
  - `frontend/src/components/linghui/VideoNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiPromptEditor.tsx`
  - `frontend/src/components/linghui/LinghuiPage.css`
