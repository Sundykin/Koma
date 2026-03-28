import type { NodeTypes } from '@xyflow/react';
import { TextNode } from './TextNode';
import { ImageNode } from './ImageNode';
import { VideoNode } from './VideoNode';
import { AudioNode } from './AudioNode';
import { ScriptNode } from './ScriptNode';
import { CanvasGroupNode } from './CanvasGroupNode';

export const linghuiNodeTypes: NodeTypes = {
  group: CanvasGroupNode,
  'linghui-text': TextNode,
  'linghui-image': ImageNode,
  'linghui-video': VideoNode,
  'linghui-audio': AudioNode,
  'linghui-script': ScriptNode,
};

export {
  LinghuiNodeRunsContext,
  LinghuiGroupRunsContext,
  LinghuiConnectionErrorContext,
  LinghuiExecutionTraceContext,
  LinghuiNodeMutationContext,
  LinghuiNodeInteractionContext,
} from './LinghuiNodeRunsContext';
