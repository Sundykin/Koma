## Why

当前灵绘视频节点的轻编辑态承载了过多常驻说明文字、模式切换和结果预览，用户在“生成视频”“导入输出”“查看结果”之间频繁切换，心智负担明显高于图片节点。尤其是视频结果已经可以在节点语义内表达时，仍然被放进编辑框中重复预览，导致编辑框过长、信息密度失衡，也让播放按钮与打开编辑框的交互发生冲突。

现在需要把视频节点重新收口为“节点即结果、编辑框只负责必要配置”的结构：说明文案最小化并改为 Tooltip，结果预览回到节点卡片本身，导入到画布的视频直接成为可给下游复用的透传节点，不再通过显式模式切换让用户自行判断。

## What Changes

- 简化灵绘视频节点编辑框，删除常驻的大段说明文案和难以理解的描述性块，将必要解释统一改为 Ant Design `Tooltip`
- 删除视频编辑框中的结果预览区域，把视频生成结果预览收口到节点卡片本身
- 为视频节点卡片增加内联播放交互，点击播放按钮只控制播放，不再触发编辑框弹出
- 移除视频节点编辑框中的“导入输出”显式切换；从画布导入的视频直接创建为可下游复用的透传视频节点
- 让视频节点的比例、分辨率、时长改为三个独立选择器，而不是混合在同一组复合表达里
- 保持视频能力驱动的生成编辑结构，但只保留真正影响生成的输入、提示词和参数
- **BREAKING**：不再考虑旧视频节点编辑态和旧数据兼容；新规范以当前未上线项目的彻底重构为准

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 调整视频节点的编辑、预览、播放与导入交互，收口为“节点结果内联 + 编辑框轻量参数化”的新结构

## Impact

- Affected specs: `linghui-studio`
- Affected code:
  - `frontend/src/components/linghui/VideoNodeEditor.tsx`
  - `frontend/src/components/linghui/VideoNodeEditorPanels.tsx`
  - `frontend/src/components/linghui/nodes/VideoNode.tsx`
  - `frontend/src/components/linghui/LinghuiNodeEditor.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasMediaImport.ts`
  - `frontend/src/components/linghui/LinghuiPage.css`
  - `frontend/src/components/linghui/videoNodeEditorShared.ts`
