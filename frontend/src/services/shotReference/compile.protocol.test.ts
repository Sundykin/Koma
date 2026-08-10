import { describe, expect, it } from 'vitest';
import { compileShotPromptToBundle } from './compile';
import type { ShotReferenceBundle } from './types';

const BUNDLE: ShotReferenceBundle = {
  items: [
    {
      kind: 'character',
      id: 'c1',
      label: '角色：叶赎',
      source: 'https://example.com/yeshu.png',
      mentionToken: '@char_c1',
      priority: 70,
    },
  ],
  mentionFallbacks: [],
  hasGridAnchor: false,
  gridCellCount: undefined,
  hasShotImage: false,
  capacity: { maxRefs: 9, truncatedCount: 0, truncatedKinds: [] },
} as ShotReferenceBundle;

describe('分镜提示词编译按渠道协议渲染图片占位符', () => {
  it.each([
    ['grok-image-index', '@Image 1'],
    ['minimax-image-tag', '<图片 1>'],
    ['koma-jimeng', '@image_file_1'],
  ])('%s → %s', (protocol, expected) => {
    const { compiledPrompt } = compileShotPromptToBundle({
      prompt: '画面描述：@char_c1 叶赎 抬头。',
      bundle: BUNDLE,
      promptProtocol: protocol,
    });
    expect(compiledPrompt).toContain(expected);
  });

  it('不传协议时按 grok 风格兜底，保持历史行为', () => {
    const { compiledPrompt } = compileShotPromptToBundle({
      prompt: '@char_c1 叶赎',
      bundle: BUNDLE,
    });
    expect(compiledPrompt).toContain('@Image 1');
  });

  it('越界位置编号按当前协议归一化后剥离', () => {
    const { compiledPrompt, debug } = compileShotPromptToBundle({
      prompt: '@char_c1 叶赎 与 @Image 5 同框',
      bundle: BUNDLE,
      promptProtocol: 'koma-jimeng',
    });
    expect(compiledPrompt).toContain('@image_file_1');
    expect(compiledPrompt).not.toContain('@Image 5');
    expect(debug.overflowImageNumbers).toEqual([5]);
  });
});
