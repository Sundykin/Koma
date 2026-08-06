import { describe, expect, it } from 'vitest';
import { computeShotScriptHash, isShotPromptStale, computeShotVoiceHash, isShotVoiceStale, estimateShotSpeechDuration, isShotSpeechOverDuration, isShotSpeechUnderused } from './shotFreshness';
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

describe('computeShotVoiceHash / isShotVoiceStale', () => {
  const dlg = (text: string, characterId?: string): ShotScriptLine => ({
    id: Math.random().toString(36), text, role: 'dialogue', characterId,
  });
  const desc = (text: string): ShotScriptLine => ({
    id: Math.random().toString(36), text, role: 'description',
  });

  it('只依赖可配音内容：台词/引号台词变则指纹变，画面文本变不变', () => {
    const base = [desc('中景，平视，昏暗山洞。'), dlg('你们来了', 'c1')];
    const hashBase = computeShotVoiceHash({ scriptLines: base });
    // 画面描述改动（非台词）→ 指纹不变
    const descChanged = computeShotVoiceHash({ scriptLines: [desc('近景，仰视，灯火通明。'), dlg('你们来了', 'c1')] });
    expect(descChanged).toBe(hashBase);
    // 台词改动 → 指纹变
    const dlgChanged = computeShotVoiceHash({ scriptLines: [desc('中景，平视。'), dlg('我来了', 'c1')] });
    expect(dlgChanged).not.toBe(hashBase);
  });

  it('description 里的引号台词参与指纹', () => {
    const withQuote = computeShotVoiceHash({ scriptLines: [desc('叶赎："你们来了。"')] });
    const withoutQuote = computeShotVoiceHash({ scriptLines: [desc('叶赎抬眼。')] });
    expect(withQuote).not.toBe(withoutQuote);
  });

  it('有配音 + 指纹不一致 → 滞后；无配音/无指纹不报', () => {
    const scriptLines = [dlg('你们来了', 'c1')];
    const hash = computeShotVoiceHash({ scriptLines });
    expect(isShotVoiceStale({ media: { audios: [{}] }, scriptLines, voiceScriptHash: hash })).toBe(false);
    expect(isShotVoiceStale({
      media: { audios: [{}] },
      scriptLines: [dlg('改过了', 'c1')],
      voiceScriptHash: hash,
    })).toBe(true);
    // 无配音
    expect(isShotVoiceStale({ scriptLines, voiceScriptHash: hash })).toBe(false);
    // 有配音无指纹（旧数据）
    expect(isShotVoiceStale({ media: { audios: [{}] }, scriptLines })).toBe(false);
  });
});

describe('时长 vs 台词量合理性', () => {
  const dlg = (text: string): ShotScriptLine => ({
    id: Math.random().toString(36), text, role: 'dialogue',
  });

  it('估算朗读时长：90 字台词 ≈ 20 秒', () => {
    const dur = estimateShotSpeechDuration({ scriptLines: [dlg('字'.repeat(90))] });
    expect(dur).toBeGreaterThan(18);
    expect(dur).toBeLessThan(22);
  });

  it('台词超时长判定：120 字台词配 10 秒 → 超配', () => {
    const shot = { duration: 10, scriptLines: [dlg('字'.repeat(120))] };
    expect(estimateShotSpeechDuration(shot)).toBeGreaterThan(10 * 1.3);
    expect(isShotSpeechOverDuration(shot)).toBe(true);
  });

  it('台词够时长的镜不误报', () => {
    const shot = { duration: 30, scriptLines: [dlg('字'.repeat(100))] };
    expect(isShotSpeechOverDuration(shot)).toBe(false);
  });

  it('无台词的长镜 → 判拖沓；短镜不判', () => {
    expect(isShotSpeechUnderused({ duration: 16, scriptLines: [dlg('')] })).toBe(true);
    expect(isShotSpeechUnderused({ duration: 4, scriptLines: [dlg('')] })).toBe(false);
  });

  it('description 引号台词计入估算', () => {
    const shot = { scriptLines: [{ id: 'l', text: '叶赎："' + '字'.repeat(50) + '"', role: 'description' as const }] };
    expect(estimateShotSpeechDuration(shot)).toBeGreaterThan(10);
  });
});
