import { describe, expect, it } from 'vitest';
import {
  buildGenreOptionList,
  buildGenreToneDirective,
  hasGenreTags,
  normalizeGenreTags,
  stripCardFrontMatter,
} from './dramaGenreTags';
import { GENRE_CARD_META, listCardsOfKind, matchGenreCard } from '../store/templates/genreCards';
import { DEFAULT_TEMPLATES } from '../store/promptTemplates/defaults';

describe('风格标签卡注册表', () => {
  it('三轴各有卡片，且每张卡都注册成了可编辑模板', () => {
    expect(listCardsOfKind('genre').length).toBeGreaterThanOrEqual(12);
    expect(listCardsOfKind('tone').length).toBeGreaterThanOrEqual(6);
    expect(listCardsOfKind('device').length).toBeGreaterThanOrEqual(6);
    for (const card of GENRE_CARD_META) {
      expect(Object.keys(DEFAULT_TEMPLATES)).toContain(`genre_card_${card.name}`);
    }
  });

  it('卡片正文压在预算内——注入是按张计费的', () => {
    for (const card of GENRE_CARD_META) {
      const body = stripCardFrontMatter(
        (DEFAULT_TEMPLATES as Record<string, { template: string }>)[`genre_card_${card.name}`].template,
      );
      expect(body.length, `${card.name} 超长`).toBeLessThanOrEqual(600);
      expect(body).not.toContain('<!--');
      expect(body).not.toMatch(/^---/);
    }
  });

  it('别名能把自由输入归一到卡名', () => {
    expect(matchGenreCard('科幻', 'genre')?.name).toBe('科幻未来');
    expect(matchGenreCard('赛博朋克', 'genre')?.name).toBe('科幻未来');
    expect(matchGenreCard('喜剧', 'tone')?.name).toBe('搞笑');
    expect(matchGenreCard('金手指', 'device')?.name).toBe('系统');
    // 包含匹配兜底
    expect(matchGenreCard('都市甜宠爽剧', 'genre')?.name).toBe('豪门婚恋');
    expect(matchGenreCard('查无此题材', 'genre')).toBeUndefined();
  });
});

describe('normalizeGenreTags', () => {
  it('丢弃命中不了的标签，避免下游找不到卡片', () => {
    const tags = normalizeGenreTags({
      genre: '赛博朋克',
      subGenres: ['悬疑', '不存在的题材'],
      tones: ['喜剧', '也不存在'],
      premiseDevices: ['金手指'],
    });
    expect(tags.genre).toBe('科幻未来');
    expect(tags.subGenres).toEqual(['悬疑规则']);
    expect(tags.tones).toEqual(['搞笑']);
    expect(tags.premiseDevices).toEqual(['系统']);
  });

  it('辅题材不与主题材重复，且最多 2 个', () => {
    const tags = normalizeGenreTags({
      genre: '复仇打脸',
      subGenres: ['复仇', '悬疑', '家庭', '职场'],
    });
    expect(tags.subGenres).not.toContain('复仇打脸');
    expect(tags.subGenres!.length).toBeLessThanOrEqual(2);
  });

  it('空标签判定', () => {
    expect(hasGenreTags(undefined)).toBe(false);
    expect(hasGenreTags({})).toBe(false);
    expect(hasGenreTags({ tones: ['搞笑'] })).toBe(true);
  });
});

describe('buildGenreToneDirective', () => {
  it('无标签时返回空串，调用方按不注入处理', async () => {
    expect(await buildGenreToneDirective(undefined)).toBe('');
    expect(await buildGenreToneDirective({})).toBe('');
  });

  it('主题材给整卡，辅题材只摘少量条目', async () => {
    const directive = await buildGenreToneDirective({
      genre: '复仇打脸',
      subGenres: ['悬疑规则'],
    });
    expect(directive).toContain('## 主题材：复仇打脸');
    expect(directive).toContain('## 辅题材：悬疑规则');
    // 主卡 6 条要点全给
    expect(directive).toContain('禁止漂移');
    // 辅卡只摘前 2 条，不应带到「禁止漂移」那么后面
    const subSection = directive.slice(directive.indexOf('## 辅题材'));
    expect(subSection.split('\n').filter(line => line.trim().startsWith('-')).length).toBeLessThanOrEqual(2);
  });

  it('三轴同时命中时各自成段', async () => {
    const directive = await buildGenreToneDirective({
      genre: '科幻未来',
      tones: ['搞笑', '狗血'],
      premiseDevices: ['重生'],
    });
    expect(directive).toContain('## 主题材：科幻未来');
    expect(directive).toContain('## 调性：搞笑');
    expect(directive).toContain('## 调性：狗血');
    expect(directive).toContain('## 前提装置：重生');
    // 标签本身不得出现在成片提示词里
    expect(directive).toContain('禁止出现在输出里');
  });

  it('注入体量可控——满配三轴也不该把推理输入撑爆', async () => {
    const directive = await buildGenreToneDirective({
      genre: '复仇打脸',
      subGenres: ['悬疑规则', '家庭关系'],
      tones: ['狗血', '燃向'],
      premiseDevices: ['重生', '马甲'],
    });
    expect(directive.length).toBeLessThan(3000);
  });
});

describe('buildGenreOptionList', () => {
  it('清单跟着卡片注册表走，不写死', () => {
    const list = buildGenreOptionList('genre');
    expect(list).toContain('科幻未来');
    expect(list).toContain('复仇打脸');
    expect(list.split('、').length).toBe(listCardsOfKind('genre').length);
  });
});
