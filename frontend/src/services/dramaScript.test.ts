import { describe, expect, it } from 'vitest';
import { parseDramaScript, serializeDramaScript, dramaLineTypeToRole } from './dramaScript';
import { buildShotVoiceSegments } from '../types/shot-script';
import { resolveShotLineVoiceId } from './voiceLibrary/shotLineVoice';

describe('parseDramaScript', () => {
  it('parses marked lines into structured drama lines', () => {
    const lines = parseDramaScript([
      '[场景] 深夜 · 废弃戏台',
      '[旁白] 雨水顺着戏台边缘往下淌',
      '[台词·宁卓] 你们来了',
      '[台词·老者] 这出戏该收场了',
      '[旁白] 他没有回头',
    ].join('\n'));

    expect(lines).toEqual([
      { type: 'scene', text: '深夜 · 废弃戏台' },
      { type: 'narration', text: '雨水顺着戏台边缘往下淌' },
      { type: 'dialogue', speaker: '宁卓', text: '你们来了' },
      { type: 'dialogue', speaker: '老者', text: '这出戏该收场了' },
      { type: 'narration', text: '他没有回头' },
    ]);
  });

  it('treats unmarked lines as narration (user hand-edited / free text)', () => {
    const lines = parseDramaScript('[旁白] 有标记\n没标记的一行');
    expect(lines[1]).toEqual({ type: 'narration', text: '没标记的一行' });
  });

  it('handles dialogue without a speaker', () => {
    const lines = parseDramaScript('[台词] 有人吗');
    expect(lines[0]).toEqual({ type: 'dialogue', speaker: undefined, text: '有人吗' });
  });

  it('round-trips through serializeDramaScript', () => {
    const original = '[旁白] 天黑了\n[台词·宁卓] 走吧\n[场景] 山里';
    expect(serializeDramaScript(parseDramaScript(original))).toBe(original);
  });
});

describe('dramaLineTypeToRole', () => {
  it('maps dialogue to dialogue, others to narration', () => {
    expect(dramaLineTypeToRole('dialogue')).toBe('dialogue');
    expect(dramaLineTypeToRole('narration')).toBe('narration');
    expect(dramaLineTypeToRole('scene')).toBe('narration');
  });
});

describe('buildShotVoiceSegments', () => {
  const shot = {
    scriptLines: [
      { id: '1', text: '雨停了', role: 'narration' as const },
      { id: '2', text: '他抬起头', role: 'narration' as const },
      { id: '3', text: '你们不该来', role: 'dialogue' as const, characterId: 'char_1' },
      { id: '4', text: '这里不欢迎你们', role: 'dialogue' as const, characterId: 'char_1' },
      { id: '5', text: '快走吧', role: 'dialogue' as const, characterId: 'char_2' },
    ],
  };

  it('splits into narration and per-character dialogue segments', () => {
    const segments = buildShotVoiceSegments(shot);
    expect(segments).toEqual([
      { text: '雨停了\n他抬起头', role: 'narration', characterId: undefined },
      { text: '你们不该来\n这里不欢迎你们', role: 'dialogue', characterId: 'char_1' },
      { text: '快走吧', role: 'dialogue', characterId: 'char_2' },
    ]);
  });

  it('merges adjacent same-character dialogue and narration', () => {
    const single = buildShotVoiceSegments({
      scriptLines: [
        { id: '1', text: '甲', role: 'narration' as const },
        { id: '2', text: '乙', role: 'narration' as const },
      ],
    });
    expect(single).toHaveLength(1);
    expect(single[0].text).toBe('甲\n乙');
  });

  it('treats lines without role as narration', () => {
    const segments = buildShotVoiceSegments({
      scriptLines: [{ id: '1', text: '旧数据行' }],
    });
    expect(segments[0].role).toBe('narration');
  });
});

describe('resolveShotLineVoiceId', () => {
  const characters = [
    { id: 'char_1', voiceId: 'voice-hero' },
    { id: 'char_2', voiceId: undefined },
  ];

  it('uses the character voice for dialogue lines', () => {
    expect(resolveShotLineVoiceId({
      role: 'dialogue', characterId: 'char_1', characters, projectNarrationVoiceId: 'voice-project',
    })).toBe('voice-hero');
  });

  it('falls back to project voice when the character has no voice', () => {
    expect(resolveShotLineVoiceId({
      role: 'dialogue', characterId: 'char_2', characters, projectNarrationVoiceId: 'voice-project',
    })).toBe('voice-project');
  });

  it('uses project voice for narration', () => {
    expect(resolveShotLineVoiceId({
      role: 'narration', characters, projectNarrationVoiceId: 'voice-project',
    })).toBe('voice-project');
  });

  it('returns empty when nothing is resolvable (provider channel default)', () => {
    expect(resolveShotLineVoiceId({
      role: 'dialogue', characterId: 'missing', characters, projectNarrationVoiceId: undefined,
    })).toBe('');
  });
});

describe('drama breakdown: marked lines → ShotScriptLine (role + characterId)', () => {
  // 与 ShotAnalysisService.buildScriptLines 相同的映射逻辑，验证剧情拆解后的行结构
  it('maps marked drama lines to role + speaker characterId', async () => {
    const { parseDramaScript } = await import('./dramaScript');
    const { createScriptLine } = await import('../types/shot-script');
    const characters = [{ id: 'char_1', name: '宁卓' }, { id: 'char_2', name: '老者' }];
    const getCharId = (c: typeof characters[0]) => c.id;
    const fuzzyMatch = (name: string) => characters.find(c => c.name === name || name.includes(c.name) || c.name.includes(name));

    const buildScriptLines = (texts: string[]) => texts.flatMap(text => {
      const line = parseDramaScript(text)[0];
      if (!line || !line.text || line.type === 'scene') return [];
      if (line.type === 'dialogue') {
        const speaker = line.speaker ? fuzzyMatch(line.speaker) : undefined;
        return [createScriptLine(line.text, 'dialogue', speaker ? getCharId(speaker) : undefined)];
      }
      return [createScriptLine(line.text, 'narration')];
    });

    const lines = buildScriptLines([
      '[场景] 深夜 · 戏台',
      '[旁白] 雨停了',
      '[台词·宁卓] 你们来了',
      '[台词·老者] 该收场了',
      '[台词·陌生人] 谁在那里',
    ]);

    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ text: '雨停了', role: 'narration' });
    expect(lines[1]).toMatchObject({ text: '你们来了', role: 'dialogue', characterId: 'char_1' });
    expect(lines[2]).toMatchObject({ text: '该收场了', role: 'dialogue', characterId: 'char_2' });
    // 说话人匹配不到资产 → characterId undefined（配音回退项目级音色）
    expect(lines[3]).toMatchObject({ text: '谁在那里', role: 'dialogue', characterId: undefined });
    // 场景标记行不落库
    expect(lines.some(l => l.text.includes('戏台'))).toBe(false);
  });
});
