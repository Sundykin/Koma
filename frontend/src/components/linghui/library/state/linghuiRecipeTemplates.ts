import type {
  LinghuiSubgraphSnapshot,
} from '../../../../types/linghui';
import { createNewNodeData } from './linghuiNodeDefs';

export type LinghuiRecipeTemplateKey =
  | 'character-design-flow'
  | 'storyboard-creation-flow'
  | 'voiceover-workflow';

export interface LinghuiBuiltinRecipeTemplateDefinition {
  id: string;
  recipeKey: LinghuiRecipeTemplateKey;
  name: string;
  description: string;
  sortOrder: number;
  snapshot: LinghuiSubgraphSnapshot;
}

export function listBuiltinLinghuiRecipeTemplates(): LinghuiBuiltinRecipeTemplateDefinition[] {
  const productionNodeData = createNewNodeData('linghui/storyboard', {
    label: '剧本到分镜一体化制作台',
  });

  return [{
    id: 'builtin-storyboard-production-flow',
    recipeKey: 'storyboard-creation-flow',
    name: '剧本到分镜一体化制作台',
    description: '在一个节点内完成剧本生成、角色/场景/道具资产确认，以及分镜图和视频流程派生。',
    sortOrder: 1,
    snapshot: {
      nodes: [{
        id: 'builtin-storyboard-production-node',
        type: 'linghui-storyboard',
        position: { x: 0, y: 0 },
        data: {
          ...productionNodeData,
          properties: {
            ...productionNodeData.properties,
            productionStage: 'script',
            productionAssets: [],
          },
        },
        width: 236,
        height: 368,
      }],
      edges: [],
      groups: [],
    },
  }];
}

export function resolveLinghuiRecipeTemplateLabel(recipeKey?: LinghuiRecipeTemplateKey): string | null {
  switch (recipeKey) {
    case 'character-design-flow':
      return '角色设计流';
    case 'storyboard-creation-flow':
      return '分镜创作流';
    case 'voiceover-workflow':
      return '配音工作流';
    default:
      return null;
  }
}
