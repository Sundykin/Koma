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

describe('drama breakdown: description + voiceLines → ShotScriptLine', () => {
  // 与 ShotAnalysisService 物化逻辑同构：剧情模式分镜 = 分镜描述行 + 声音行
  it('materializes description lines then voice lines with speaker characterId', async () => {
    const { createScriptLine } = await import('../types/shot-script');
    const characters = [{ id: 'char_1', name: '宁卓' }, { id: 'char_2', name: '老者' }];
    const fuzzyMatch = (name: string) =>
      characters.find(c => c.name === name || name.includes(c.name) || c.name.includes(name));

    const payload = {
      __dramaDescriptionLines: ['废弃戏台，雨夜。宁卓独立台中央，手握剑柄。'],
      __dramaVoiceLines: [
        { role: 'narration' as const, text: '雨水顺着戏台边缘往下淌' },
        { role: 'dialogue' as const, text: '你们来了', speaker: '宁卓' },
        { role: 'dialogue' as const, text: '该收场了', speaker: '老者' },
        { role: 'dialogue' as const, text: '谁在那里', speaker: '陌生人' },
      ],
    };

    const out: Array<{ text: string; role?: string; characterId?: string }> = [];
    for (const text of payload.__dramaDescriptionLines) {
      out.push(createScriptLine(text, 'description'));
    }
    for (const v of payload.__dramaVoiceLines) {
      if (v.role === 'dialogue') {
        const speaker = v.speaker ? fuzzyMatch(v.speaker) : undefined;
        out.push(createScriptLine(v.text, 'dialogue', speaker?.id));
      } else {
        out.push(createScriptLine(v.text, 'narration'));
      }
    }

    expect(out).toHaveLength(5);
    expect(out[0]).toMatchObject({ text: '废弃戏台，雨夜。宁卓独立台中央，手握剑柄。', role: 'description' });
    expect(out[1]).toMatchObject({ role: 'narration' });
    expect(out[2]).toMatchObject({ role: 'dialogue', characterId: 'char_1' });
    expect(out[3]).toMatchObject({ role: 'dialogue', characterId: 'char_2' });
    expect(out[4]).toMatchObject({ role: 'dialogue', characterId: undefined });
  });

  it('description lines never enter voice segments', async () => {
    const { buildShotVoiceSegments } = await import('../types/shot-script');
    const segments = buildShotVoiceSegments({
      scriptLines: [
        { id: '1', text: '分镜描述文本', role: 'description' as const },
        { id: '2', text: '旁白内容', role: 'narration' as const },
        { id: '3', text: '台词内容', role: 'dialogue' as const, characterId: 'char_1' },
      ],
    });
    expect(segments).toHaveLength(2);
    expect(segments.map(s => s.text)).toEqual(['旁白内容', '台词内容']);
  });
});

describe('shot script paragraph (分镜整段剧本)', () => {
  it('serializes lines to paragraph and parses back with roles', async () => {
    const { serializeShotScriptParagraph, parseShotScriptParagraph } = await import('./dramaScript');
    const nameById = new Map([['char_1', '宁卓']]);
    const lines = [
      { id: '1', text: '废弃戏台，雨夜。宁卓独立台中央。', role: 'description' as const },
      { id: '2', text: '雨水顺着戏台边缘往下淌', role: 'narration' as const },
      { id: '3', text: '你们来了', role: 'dialogue' as const, characterId: 'char_1' },
      { id: '4', text: '谁在那里', role: 'dialogue' as const },
    ];
    const text = serializeShotScriptParagraph(lines, nameById);
    expect(text).toBe([
      '废弃戏台，雨夜。宁卓独立台中央。',
      '[旁白] 雨水顺着戏台边缘往下淌',
      '[台词·宁卓] 你们来了',
      '[台词] 谁在那里',
    ].join('\n'));

    const parsed = parseShotScriptParagraph(text);
    expect(parsed).toEqual([
      { role: 'description', text: '废弃戏台，雨夜。宁卓独立台中央。' },
      { role: 'narration', text: '雨水顺着戏台边缘往下淌' },
      { role: 'dialogue', speaker: '宁卓', text: '你们来了' },
      { role: 'dialogue', speaker: undefined, text: '谁在那里' },
    ]);
  });
});
