/**
 * mentionTypes 单元测试
 * 覆盖 mention 解析、生成、规范化的各种场景
 */
import { describe, it, expect } from 'vitest';
import {
  parseMentions,
  createMentionString,
  normalizeMentionId,
  parseMentionId,
  MENTION_REGEX,
} from './mentionTypes';

describe('parseMentions', () => {
  // === 正向路径 ===
  it('应解析包含单个角色 mention 的文本', () => {
    const text = '一个女孩 @char_abc123 站在窗前';
    const result = parseMentions(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'char',
      id: 'abc123',
      fullMatch: '@char_abc123',
    });
  });

  it('应解析包含多种类型 mention 的文本', () => {
    const text = '@char_hero1 在 @scene_forest 中拿起 @prop_sword1';
    const result = parseMentions(text);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ type: 'char', id: 'hero1' });
    expect(result[1]).toMatchObject({ type: 'scene', id: 'forest' });
    expect(result[2]).toMatchObject({ type: 'prop', id: 'sword1' });
  });

  it('应解析内置分镜锚点 mention', () => {
    const text = '基于 @grid_anchor 的四宫格，以及 @shot_anchor 首帧、@storyboard_anchor 当前故事板、@previous_storyboard_anchor 上一故事板继续生成';
    const result = parseMentions(text);
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({
      type: 'grid',
      id: 'anchor',
      fullMatch: '@grid_anchor',
    });
    expect(result[1]).toMatchObject({
      type: 'shot',
      id: 'anchor',
      fullMatch: '@shot_anchor',
    });
    expect(result[2]).toMatchObject({
      type: 'storyboard',
      id: 'anchor',
      fullMatch: '@storyboard_anchor',
    });
    expect(result[3]).toMatchObject({
      type: 'previous_storyboard',
      id: 'anchor',
      fullMatch: '@previous_storyboard_anchor',
    });
  });

  it('应解析包含连字符和下划线的 ID', () => {
    const text = '@char_abc-def_123';
    const result = parseMentions(text);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('abc-def_123');
  });

  it('应正确记录 from/to 位置', () => {
    const text = 'prefix @char_id1 suffix';
    const result = parseMentions(text);
    expect(result[0].from).toBe(7);
    expect(result[0].to).toBe(16);
  });

  // === 逆向路径 ===
  it('空文本应返回空数组', () => {
    expect(parseMentions('')).toEqual([]);
  });

  it('不含 mention 的纯文本应返回空数组', () => {
    expect(parseMentions('这是一段普通的提示词文本')).toEqual([]);
  });

  it('不完整的 mention 格式不应被解析', () => {
    expect(parseMentions('@char')).toEqual([]);
    expect(parseMentions('@char_')).toEqual([]);
    expect(parseMentions('char_abc')).toEqual([]);
  });

  it('不支持的类型前缀不应被解析', () => {
    expect(parseMentions('@unknown_abc')).toEqual([]);
    expect(parseMentions('@item_abc')).toEqual([]);
    expect(parseMentions('@grid_foo')).toEqual([]);
    expect(parseMentions('@shot_foo')).toEqual([]);
  });

  // === 边界条件 ===
  it('应解析相邻的多个 mention', () => {
    const text = '@char_a@char_b';
    const result = parseMentions(text);
    // 第二个 @char_b 紧跟第一个，正则应能匹配
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('应解析重复的同一 mention', () => {
    const text = '@char_abc @char_abc';
    const result = parseMentions(text);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('abc');
    expect(result[1].id).toBe('abc');
  });

  it('应处理含特殊字符的文本中的 mention', () => {
    const text = '角色：@char_hero1，场景：@scene_s1！道具：@prop_p1。';
    const result = parseMentions(text);
    expect(result).toHaveLength(3);
  });
});

describe('createMentionString', () => {
  it('应生成标准格式的 mention 字符串', () => {
    expect(createMentionString('char', 'abc123')).toBe('@char_abc123');
    expect(createMentionString('scene', 'forest')).toBe('@scene_forest');
    expect(createMentionString('prop', 'sword')).toBe('@prop_sword');
  });

  it('应生成内置锚点 mention 字符串', () => {
    expect(createMentionString('grid', 'anything')).toBe('@grid_anchor');
    expect(createMentionString('shot', 'anything')).toBe('@shot_anchor');
    expect(createMentionString('storyboard', 'anything')).toBe('@storyboard_anchor');
    expect(createMentionString('previous_storyboard', 'anything')).toBe('@previous_storyboard_anchor');
  });

  it('应避免双前缀（ID 已包含类型前缀时）', () => {
    expect(createMentionString('char', 'char_abc')).toBe('@char_abc');
    expect(createMentionString('scene', 'scene_s1')).toBe('@scene_s1');
    expect(createMentionString('prop', 'prop_p1')).toBe('@prop_p1');
  });
});

describe('normalizeMentionId', () => {
  it('应去除重复的类型前缀', () => {
    expect(normalizeMentionId('char', 'char_abc')).toBe('abc');
    expect(normalizeMentionId('scene', 'scene_s1')).toBe('s1');
    expect(normalizeMentionId('prop', 'prop_p1')).toBe('p1');
  });

  it('不含前缀的 ID 应原样返回', () => {
    expect(normalizeMentionId('char', 'abc')).toBe('abc');
    expect(normalizeMentionId('scene', 'forest')).toBe('forest');
  });

  it('不同类型前缀不应被去除', () => {
    expect(normalizeMentionId('char', 'scene_abc')).toBe('scene_abc');
    expect(normalizeMentionId('prop', 'char_abc')).toBe('char_abc');
  });
});

describe('parseMentionId', () => {
  it('应解析标准 mention 字符串', () => {
    const result = parseMentionId('@char_abc123');
    expect(result).toEqual({ type: 'char', id: 'abc123' });
  });

  it('应解析内置锚点 mention 字符串', () => {
    expect(parseMentionId('@grid_anchor')).toEqual({ type: 'grid', id: 'anchor' });
    expect(parseMentionId('@shot_anchor')).toEqual({ type: 'shot', id: 'anchor' });
    expect(parseMentionId('@storyboard_anchor')).toEqual({ type: 'storyboard', id: 'anchor' });
    expect(parseMentionId('@previous_storyboard_anchor')).toEqual({ type: 'previous_storyboard', id: 'anchor' });
  });

  it('应容错处理双前缀格式', () => {
    const result = parseMentionId('@char_char_abc');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('char');
    expect(result!.id).toBe('abc');
  });

  it('无效格式应返回 null', () => {
    expect(parseMentionId('invalid')).toBeNull();
    expect(parseMentionId('@unknown_abc')).toBeNull();
    expect(parseMentionId('')).toBeNull();
  });
});

describe('MENTION_REGEX', () => {
  it('应匹配所有三种类型', () => {
    expect('@char_abc').toMatch(new RegExp(MENTION_REGEX.source));
    expect('@prop_abc').toMatch(new RegExp(MENTION_REGEX.source));
    expect('@scene_abc').toMatch(new RegExp(MENTION_REGEX.source));
    expect('@grid_anchor').toMatch(new RegExp(MENTION_REGEX.source));
    expect('@shot_anchor').toMatch(new RegExp(MENTION_REGEX.source));
    expect('@storyboard_anchor').toMatch(new RegExp(MENTION_REGEX.source));
    expect('@previous_storyboard_anchor').toMatch(new RegExp(MENTION_REGEX.source));
  });

  it('不应匹配无效类型', () => {
    expect('@item_abc').not.toMatch(new RegExp(MENTION_REGEX.source));
    expect('@grid_foo').not.toMatch(new RegExp(MENTION_REGEX.source));
    expect('@shot_foo').not.toMatch(new RegExp(MENTION_REGEX.source));
  });
});

// ───── voice mention 与复合属性 ─────

describe('voice mention 类型', () => {
  it('应解析 @voice_xxx', () => {
    const result = parseMentions('独白由 @voice_cherry 朗读');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'voice', id: 'cherry', fullMatch: '@voice_cherry' });
  });

  it('应通过 parseMentionId 解析 @voice_xxx', () => {
    expect(parseMentionId('@voice_aiden')).toEqual({ type: 'voice', id: 'aiden' });
  });

  it('应通过 createMentionString 生成 @voice_xxx', () => {
    expect(createMentionString('voice', 'cherry')).toBe('@voice_cherry');
  });

  it('应被 MENTION_REGEX 匹配', () => {
    expect('@voice_cherry').toMatch(new RegExp(MENTION_REGEX.source));
  });
});

describe('@char_xxx-音色 复合 mention', () => {
  it('parseMentions 应剥出 property=voice', () => {
    const result = parseMentions('@char_hero1-音色');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'char', id: 'hero1', property: 'voice', fullMatch: '@char_hero1-音色' });
  });

  it('应同时支持 -voice 后缀', () => {
    const result = parseMentions('@char_hero1-voice');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'char', id: 'hero1', property: 'voice' });
  });

  it('parseMentionId 应剥出 property', () => {
    expect(parseMentionId('@char_abc-音色')).toEqual({ type: 'char', id: 'abc', property: 'voice' });
  });

  it('createMentionString 应注入 -音色 后缀（仅 char 类型）', () => {
    expect(createMentionString('char', 'abc', 'voice')).toBe('@char_abc-音色');
    // 非 char 类型即使传 property 也不应被注入
    expect(createMentionString('scene', 'forest', 'voice')).toBe('@scene_forest');
  });

  it('普通 @char_xxx 不应被误判为复合', () => {
    const result = parseMentions('@char_hero1 来到 @scene_forest');
    expect(result[0].property).toBeUndefined();
    expect(result[1].property).toBeUndefined();
  });

  it('混合复合与普通 mention 应并存', () => {
    const result = parseMentions('@char_hero1 独白：@char_hero1-音色 念出 @voice_cherry');
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ type: 'char', id: 'hero1', property: undefined });
    expect(result[1]).toMatchObject({ type: 'char', id: 'hero1', property: 'voice' });
    expect(result[2]).toMatchObject({ type: 'voice', id: 'cherry' });
  });

  it('记录的 fullMatch / from / to 应覆盖整个复合 mention', () => {
    const text = '台词：@char_a1-音色 说';
    const result = parseMentions(text);
    expect(result[0].fullMatch).toBe('@char_a1-音色');
    expect(text.slice(result[0].from, result[0].to)).toBe('@char_a1-音色');
  });

  it('-音色 后缀只对 char 生效，其它类型保留为 id 一部分', () => {
    // @voice_xxx-音色 是错误用法，但保险起见 id 应整体保留
    const result = parseMentions('@scene_forest-音色');
    // 注意：当前正则允许 CJK 在 id 段，所以 @scene_forest-音色 会被匹配
    // 但 property 只对 char 剥离，scene 仍保留 -音色 在 id
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('scene');
    expect(result[0].id).toBe('forest-音色');
    expect(result[0].property).toBeUndefined();
  });
});
