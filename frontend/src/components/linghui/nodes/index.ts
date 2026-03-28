import { ReferenceNode } from './ReferenceNode';
import type { NodeTypes } from '@xyflow/react';
import { TextNode } from './TextNode';
import { ImageNode } from './ImageNode';
import { VideoNode } from './VideoNode';
import { AudioNode } from './AudioNode';
import { StoryboardShotNode } from './StoryboardShotNode';
import { StoryboardGroupNode } from './StoryboardGroupNode';
import { CanvasGroupNode } from './CanvasGroupNode';

export const linghuiNodeTypes: NodeTypes = {
  group: CanvasGroupNode,
  'linghui-reference': ReferenceNode,
  'linghui-text': TextNode,
  'linghui-image': ImageNode,
  'linghui-video': VideoNode,
  'linghui-audio': AudioNode,
  'linghui-storyboard-shot': StoryboardShotNode,
  'linghui-storyboard-group': StoryboardGroupNode,
};

export {
  LinghuiNodeRunsContext,
  LinghuiGroupRunsContext,
  LinghuiConnectionErrorContext,
  LinghuiNodeMutationContext,
  LinghuiNodeInteractionContext,
} from './LinghuiNodeRunsContext';
