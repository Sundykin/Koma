import type { NodeTypes } from '@xyflow/react';
import { TextNode } from './components/TextNode';
import { AgentNode } from './components/AgentNode';
import { ImageNode } from './components/ImageNode';
import { VideoNode } from './components/VideoNode';
import { AudioNode } from './components/AudioNode';
import { ScriptNode } from './components/ScriptNode';
import { CanvasGroupNode } from './components/CanvasGroupNode';

export const linghuiNodeTypes: NodeTypes = {
  group: CanvasGroupNode,
  'linghui-text': TextNode,
  'linghui-agent': AgentNode,
  'linghui-image': ImageNode,
  'linghui-video': VideoNode,
  'linghui-audio': AudioNode,
  'linghui-script': ScriptNode,
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
