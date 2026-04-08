import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_MODEL_PRESETS,
  OFFICIAL_PROMPT_ASSETS,
  getOfficialPromptAssetSummary,
} from './officialPromptAssets';

describe('officialPromptAssets', () => {
  it('builds a catalog summary for storyboard workflow defaults', () => {
    const summary = getOfficialPromptAssetSummary();

    expect(summary.totalPromptAssets).toBe(OFFICIAL_PROMPT_ASSETS.length);
    expect(summary.totalModelPresets).toBe(OFFICIAL_MODEL_PRESETS.length);
    expect(summary.categories.some((item) => item.category === 'script-conversion')).toBe(true);
    expect(summary.categories.some((item) => item.category === 'storyboard-inference')).toBe(true);
  });
});
