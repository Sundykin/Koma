import type {
  LinghuiSubgraphSnapshot,
} from '../../../../types/linghui';

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
  return [];
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
