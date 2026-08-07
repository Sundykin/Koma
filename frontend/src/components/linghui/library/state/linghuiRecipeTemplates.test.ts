import { describe, expect, it } from 'vitest';
import { listBuiltinLinghuiRecipeTemplates } from './linghuiRecipeTemplates';

describe('listBuiltinLinghuiRecipeTemplates', () => {
  it('提供一个可从工作流抽屉一次创建的一体化制作台', () => {
    const templates = listBuiltinLinghuiRecipeTemplates();
    const storyboardFlow = templates.find(template => template.recipeKey === 'storyboard-creation-flow');

    expect(storyboardFlow).toBeDefined();
    expect(storyboardFlow?.snapshot.nodes).toHaveLength(1);
    expect(storyboardFlow?.snapshot.nodes[0]).toMatchObject({
      type: 'linghui-storyboard',
      data: {
        label: '剧本到分镜一体化制作台',
        linghuiType: 'linghui/storyboard',
        properties: {
          productionStage: 'script',
          productionAssets: [],
        },
      },
    });
  });
});
