import { ReferenceNode } from './ReferenceNode';
import type { NodeTypes } from '@xyflow/react';
import { ImageNode } from './ImageNode';
import { VideoNode } from './VideoNode';
import { StoryboardShotNode } from './StoryboardShotNode';
import { StoryboardGroupNode } from './StoryboardGroupNode';
import { CanvasGroupNode } from './CanvasGroupNode';

export const linghuiNodeTypes: NodeTypes = {
  group: CanvasGroupNode,
  'linghui-reference': ReferenceNode,
  'linghui-image': ImageNode,
  'linghui-video': VideoNode,
  'linghui-storyboard-shot': StoryboardShotNode,
  'linghui-storyboard-group': StoryboardGroupNode,
};

export {
  LinghuiNodeRunsContext,
  LinghuiConnectionErrorContext,
  LinghuiNodeMutationContext,
  LinghuiNodeInteractionContext,
} from './LinghuiNodeRunsContext';
