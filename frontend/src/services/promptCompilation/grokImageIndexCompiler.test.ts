import { describe, expect, it } from 'vitest';
import { compileGrokITV, compileGrokTTI } from './grokImageIndexCompiler';

describe('grok-image-index compiler', () => {
  it('TTI: replaces @char/@scene/@prop mentions with @imageN based on selected asset order', () => {
    const selectedAssets = [
      { type: 'char' as const, assetId: 'char_1774162760773_0', source: 'https://a.example/c.png' },
      { type: 'scene' as const, assetId: 'scene_abc', source: 'https://a.example/s.png' },
      { type: 'prop' as const, assetId: 'prop_999', source: 'https://a.example/p.png' },
    ];

    const prompt = '画面中有 @char_1774162760773_0 站在 @scene_abc 旁边，手持 @prop_999。';
    const { compiledPrompt, compiledReferences, debug } = compileGrokTTI({ prompt, selectedAssets });

    expect(compiledPrompt).toContain('@image1');
    expect(compiledPrompt).toContain('@image2');
    expect(compiledPrompt).toContain('@image3');
    expect(compiledPrompt).not.toContain('@char_');
    expect(compiledPrompt).not.toContain('@scene_');
    expect(compiledPrompt).not.toContain('@prop_');

    expect(compiledReferences).toEqual([
      'https://a.example/c.png',
      'https://a.example/s.png',
      'https://a.example/p.png',
    ]);

    expect(debug.assetToImageIndex).toEqual([
      { type: 'char', assetId: 'char_1774162760773_0', image: '@image1' },
      { type: 'scene', assetId: 'scene_abc', image: '@image2' },
      { type: 'prop', assetId: 'prop_999', image: '@image3' },
    ]);
  });

  it('ITV: reserves @image1 for primary image and shifts other assets to @image2..', () => {
    const selectedAssets = [
      { type: 'char' as const, assetId: 'char_1774162760773_0', source: 'https://a.example/c.png' },
      { type: 'scene' as const, assetId: 'scene_abc', source: 'https://a.example/s.png' },
    ];

    const prompt = '让 @char_1774162760773_0 缓慢转头，背景是 @scene_abc。';
    const { compiledPrompt, compiledAdditionalReferences, debug } = compileGrokITV({
      prompt,
      primaryImage: 'https://a.example/shot.png',
      selectedAssets,
    });

    expect(compiledPrompt.startsWith('@image1')).toBe(true);
    expect(compiledPrompt).toContain('@image2');
    expect(compiledPrompt).toContain('@image3');

    expect(compiledAdditionalReferences).toEqual([
      'https://a.example/c.png',
      'https://a.example/s.png',
    ]);

    // Primary image is included in debug mapping as @image1
    expect(debug.assetToImageIndex[0]?.image).toBe('@image1');
    expect(debug.assetToImageIndex[1]?.image).toBe('@image2');
    expect(debug.assetToImageIndex[2]?.image).toBe('@image3');
  });
});

