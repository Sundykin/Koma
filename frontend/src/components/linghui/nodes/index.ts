import type { NodeTypes } from '@xyflow/react';
import { TextNode } from './components/TextNode';
import { AgentNode } from './components/AgentNode';
import { ImageNode } from './components/ImageNode';
import { VideoNode } from './components/VideoNode';
import { AudioNode } from './components/AudioNode';
import { ScriptNode } from './components/ScriptNode';
import { Director3DNode } from './components/Director3DNode';
import { CanvasGroupNode } from './components/CanvasGroupNode';

export const linghuiNodeTypes: NodeTypes = {
  group: CanvasGroupNode,
  'linghui-text': TextNode,
  'linghui-agent': AgentNode,
  'linghui-image': ImageNode,
  // 全景节点视觉与图片节点完全一致（外观就是一张宽幅图），rendering 复用 ImageNode；
  // 编辑器 / 执行器 / 提示词模板侧通过 linghuiType === 'linghui/panorama' 分支区分。
  'linghui-panorama': ImageNode,
  'linghui-video': VideoNode,
  'linghui-audio': AudioNode,
  'linghui-script': ScriptNode,
  // 故事板节点视觉与脚本节点完全一致，节点壳直接复用 ScriptNode；
  // 编辑器/执行器侧通过 linghuiType === 'linghui/storyboard' 分支区分。
  'linghui-storyboard': ScriptNode,
  'linghui-director3d': Director3DNode,
};

export {
  LinghuiCanvasModeContext,
  LinghuiCanvasZoomContext,
  LinghuiNodeRunsContext,
  LinghuiGroupRunsContext,
  LinghuiConnectionErrorContext,
  LinghuiExecutionTraceContext,
  LinghuiNodeMutationContext,
  LinghuiNodeInteractionContext,
  LinghuiGridSplitContext,
  LinghuiNodeEditorContext,
} from './state/LinghuiNodeRunsContext';
