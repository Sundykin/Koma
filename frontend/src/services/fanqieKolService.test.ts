import { describe, expect, it } from 'vitest';
import {
  mergeChaptersToScript,
  parseBookIdFromInput,
  stripChapterNumberPrefix,
} from './fanqieKolService';
import { detectExplicitEpisodeAnalysis } from './episodeSplitUtils';

describe('stripChapterNumberPrefix', () => {
  it('剥离阿拉伯数字章节号，保留标题', () => {
    expect(stripChapterNumberPrefix('第12章 重回旧宅')).toBe('重回旧宅');
    expect(stripChapterNumberPrefix('第12章：重回旧宅')).toBe('重回旧宅');
    expect(stripChapterNumberPrefix('第12章重回旧宅')).toBe('重回旧宅');
  });

  it('剥离中文数字与其它量词', () => {
    expect(stripChapterNumberPrefix('第一百零八章 终局')).toBe('终局');
    expect(stripChapterNumberPrefix('第三节 旧事')).toBe('旧事');
    expect(stripChapterNumberPrefix('第二话 - 雨夜')).toBe('雨夜');
  });

  it('只有章节号没有标题时返回空串', () => {
    expect(stripChapterNumberPrefix('第12章')).toBe('');
    expect(stripChapterNumberPrefix('第一话')).toBe('');
  });

  it('不带章节号的名字原样返回', () => {
    expect(stripChapterNumberPrefix('楔子')).toBe('楔子');
    expect(stripChapterNumberPrefix('番外·雪夜')).toBe('番外·雪夜');
    // 「第三者」不是章节号：三 之后不是量词
    expect(stripChapterNumberPrefix('第三者')).toBe('第三者');
  });

  it('只剥离开头一个章节号，标题里的「第一次」保留', () => {
    expect(stripChapterNumberPrefix('第二十七章 第一次见面')).toBe('第一次见面');
  });
});

describe('mergeChaptersToScript', () => {
  const chapters = [
    { itemId: 'b', index: 2, chapterName: '第2章 对峙', contentHtml: '<p>他站在门口。</p><p>没有说话。</p>' },
    { itemId: 'a', index: 1, chapterName: '第1章 重回旧宅', contentHtml: '<p>推开门的一瞬间。</p>' },
    { itemId: 'c', index: 3, chapterName: '第3章', contentHtml: '<p>雨停了。</p>' },
  ];

  it('按 index 排序、剥离章节号、无标题章节省略标题行', () => {
    const merged = mergeChaptersToScript(chapters);
    expect(merged).toBe(
      [
        '重回旧宅',
        '',
        '推开门的一瞬间。',
        '',
        '对峙',
        '',
        '他站在门口。\n没有说话。',
        '',
        '雨停了。',
      ].join('\n'),
    );
  });

  it('合并结果不再触发按章节的显式分集（否则会被切成上百集）', () => {
    const merged = mergeChaptersToScript(chapters);
    expect(detectExplicitEpisodeAnalysis(merged)).toBeNull();
  });
});

describe('parseBookIdFromInput', () => {
  it('识别纯 ID、详情页链接与路径形式', () => {
    expect(parseBookIdFromInput('7590221243043826712')).toBe('7590221243043826712');
    expect(
      parseBookIdFromInput('https://kol.fanqieopen.com/page/content/book-detail?x=1&book_id=7590221243043826712'),
    ).toBe('7590221243043826712');
    expect(parseBookIdFromInput('https://fanqienovel.com/page/7590221243043826712')).toBe('7590221243043826712');
    expect(parseBookIdFromInput('重生之我是首富')).toBeNull();
  });
});
