# Change: 为灵绘图片节点补齐多图集合与宫格切分能力

## Why

当前灵绘图片节点仍然是“单图输入 / 单图输出”模型，无法同时承载多张导入图片、多张生成结果和主图切换，也缺少把当前图片拆成 4/9/16/25 宫格并继续送回画布的后处理能力。这直接限制了图片节点在选图、拼图拆图、局部放大和下游复用上的工作流表达力。

用户希望图片节点可以像一个轻量图片集合容器：
- 最多承载 4 张同一比例的图片
- 支持多张导入输出与多张生成
- 节点本体直接展示当前图片，多张时可以展开平铺
- 只有被设为主图的图片才能继续作为下游输入

同时，用户希望把“宫格操作”升级为图片节点内的真实工作流工具：在放大图上看到分割线，选择若干宫格后，通过 IPC 调用 FFmpeg 做高清化处理，再自动生成对应数量的导入图片节点。

## What Changes

- 为图片节点增加最多 4 张图片的集合能力，支持导入集合与生成集合
- 为图片节点增加“主图”概念，下游引用、提示词编译和执行只消费当前主图
- 要求同一图片节点中的多张图片保持相同比例，不允许混放不同宽高比的图片
- 重构图片节点卡片和编辑器，让节点本体直接展示图片；当存在多张图片时支持展开平铺与过渡动画
- 将图片节点的多图选择与主图切换接入现有提示词引用和执行链路
- 为图片节点增加宫格切分工具，支持 4 / 9 / 16 / 25 宫格
- 在宫格工具中提供放大预览、网格叠加、多选宫格和批量执行入口
- 通过 IPC + FFmpeg 对选中的宫格执行切分与高清化，并自动在当前画布生成导入图片节点

## Impact

- Affected specs: `linghui-studio`
- Affected code:
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/ImageNodeEditor.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/nodes/ImageNode.tsx`
  - `frontend/src/components/linghui/linghuiPromptReferences.ts`
  - `frontend/src/components/linghui/linghuiExecutionShared.ts`
  - `frontend/src/components/linghui/linghuiExecutionNodeExecutors.ts`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasDocumentOps.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasImperativeHandle.ts`
  - `frontend/src/components/linghui/linghuiCanvasTypes.ts`
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `electron/service/ffmpeg.ts`
  - `electron/controller/ffmpeg.ts`
