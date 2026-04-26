import { describe, expect, it } from 'vitest';
import {
  generateImageDrawCandidates,
  getImageDrawVariation,
  type AssetImageDrawIdentitySpec,
  type AssetImageDrawVariation,
} from './AssetImageDrawModal';

const IDENTITY_SPEC_SHAPE = {
  faceShape: expect.any(String),
  eyes: expect.any(String),
  browsNoseMouth: expect.any(String),
  jawline: expect.any(String),
  apparentAge: expect.any(String),
  temperament: expect.any(String),
  hairlineAndSilhouette: expect.any(String),
};

function expectCharacterIdentityVariation(variation: AssetImageDrawVariation): void {
  expect(variation.identityDirection).toBeTruthy();
  expect(variation.identitySpec).toEqual(expect.objectContaining(IDENTITY_SPEC_SHAPE));
  expect(variation.prompt).toContain('Character identity direction candidate');
  expect(variation.prompt).toContain('Keep the exact same story role');
  expect(variation.prompt).toContain('structured gender and age lock');
  expect(variation.prompt).toContain('must stay inside the locked gender and age class');
  expect(variation.prompt).toContain('Do not change the profession');
}

describe('asset image draw character identity metadata', () => {
  it('defines 9 distinct character identity directions with identity specs', () => {
    const variations = Array.from({ length: 9 }, (_, index) => getImageDrawVariation('character', index));

    expect(new Set(variations.map((variation) => variation.label)).size).toBe(9);
    expect(new Set(variations.map((variation) => variation.identityDirection)).size).toBe(9);

    for (const variation of variations) {
      expectCharacterIdentityVariation(variation);
    }
  });

  it('persists variation prompt and identity metadata on generated candidates', async () => {
    const identitySpec: AssetImageDrawIdentitySpec = {
      faceShape: 'oval test face',
      eyes: 'sharp test eyes',
      browsNoseMouth: 'test brows nose mouth',
      jawline: 'test jawline',
      apparentAge: 'test age range',
      temperament: 'test temperament',
      hairlineAndSilhouette: 'test hairline silhouette',
    };

    const result = await generateImageDrawCandidates({
      count: 1,
      sessionId: 'draw_character_char-1_session',
      ownerType: 'character',
      ownerId: 'char-1',
      projectId: 'project-1',
      getCandidatePath: async (seed, index) => `/tmp/candidate-${index}-${seed}.png`,
      getVariation: () => ({
        label: 'Test Direction',
        prompt: 'Test variation prompt',
        identityDirection: 'test_direction',
        identitySpec,
        metadata: { candidateKind: 'characterIdentityDirection' },
      }),
      generate: async (_seed, _index, destPath) => ({
        success: true,
        path: destPath,
      }),
    });

    expect(result.failed).toBe(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual(expect.objectContaining({
      variationLabel: 'Test Direction',
      variationPrompt: 'Test variation prompt',
      identityDirection: 'test_direction',
      identitySpec,
      metadata: { candidateKind: 'characterIdentityDirection' },
    }));
  });
});
