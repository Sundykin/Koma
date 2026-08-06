import { describe, expect, it } from 'vitest';
import { computeShotScriptHash, isShotPromptStale } from './shotFreshness';
import type { ShotScriptLine } from '../types/scene-character';

const line = (text: string, role?: ShotScriptLine['role'], characterId?: string): ShotScriptLine => ({
  id: Math.random().toString(36),
  text,
  role,
  characterId,
});

describe('computeShotScriptHash', () => {
  it('同内容指纹相同；内容/角色/说话人变化指纹不同', () => {
    const a = computeShotScriptHash([line('你好', 'dialogue', 'c1')]);
    const b = computeShotScriptHash([line('你好', 'dialogue', 'c1')]);
    expect(a).toBe(b);

    expect(computeShotScriptHash([line('你好!', 'dialogue', 'c1')])).not.toBe(a);
    expect(computeShotScriptHash([line('你好', 'narration')])).not.toBe(a);
    expect(computeShotScriptHash([line('你好', 'dialogue', 'c2')])).not.toBe(a);
  });

  it('空列表与 undefined 指纹一致；首尾空白不影响', () => {
    expect(computeShotScriptHash(undefined)).toBe(computeShotScriptHash([]));
    expect(computeShotScriptHash([line('  你好  ')])).toBe(computeShotScriptHash([line('你好')]));
  });
});

describe('isShotPromptStale', () => {
  const scriptLines = [line('第一段', 'description')];

  it('无提示词 → 不滞后（属于"还没生成"）', () => {
    expect(isShotPromptStale({ scriptLines })).toBe(false);
  });

  it('有提示词但无指纹（旧数据）→ 不滞后', () => {
    expect(isShotPromptStale({ scriptLines, imagePrompt: 'prompt' })).toBe(false);
  });

  it('指纹一致 → 不滞后；脚本改了 → 滞后', () => {
    const hash = computeShotScriptHash(scriptLines);
    expect(isShotPromptStale({ scriptLines, imagePrompt: 'p', promptScriptHash: hash })).toBe(false);
    const changed = [line('第一段改', 'description')];
    expect(isShotPromptStale({ scriptLines: changed, imagePrompt: 'p', promptScriptHash: hash })).toBe(true);
  });
});
