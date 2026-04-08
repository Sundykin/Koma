import { describe, expect, it } from 'vitest';
import { getWorkflowRecipe, getWorkflowRecipes } from './workflowRecipes';

describe('workflowRecipes', () => {
  it('exposes the official workflow recipes derived from template data', () => {
    const recipes = getWorkflowRecipes();

    expect(recipes.map((recipe) => recipe.sourceWorkflowId)).toEqual(['55', '56']);
    expect(recipes[0]?.recommendedPanelId).toBe('script');
    expect(recipes[1]?.recommendedPanelId).toBe('inference');
  });

  it('resolves a recipe by id with panel presets', () => {
    const recipe = getWorkflowRecipe('official-image-interrogate-flow');

    expect(recipe?.sessionPreset.inference?.scope).toBe('current-shot');
    expect(recipe?.steps.map((step) => step.panelId)).toEqual(['assets', 'inference', 'export']);
  });
});
