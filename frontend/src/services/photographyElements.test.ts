import { describe, expect, it } from 'vitest';
import { extractPhotographyElements, extractShotPhotography, getPrimaryShotSize, isShotSizeJump } from './photographyElements';
import type { ShotScriptLine } from '../types/scene-character';

const desc = (text: string): ShotScriptLine => ({
  id: Math.random().toString(36), text, role: 'description',
});

describe('extractPhotographyElements', () => {
  it('提取景别/机位/光线关键词', () => {
    const el = extractPhotographyElements('近景，平视，昏暗山洞内，侧上冷白余光映亮半张脸');
    expect(el.shotSizes).toContain('近景');
    expect(el.cameraAngles).toContain('平视');
    expect(el.lightings).toContain('昏暗');
    expect(el.lightings).toContain('冷白');
  });

  it('无摄影语言返回空数组', () => {
    const el = extractPhotographyElements('两人展开激战');
    expect(el.shotSizes).toEqual([]);
    expect(el.cameraAngles).toEqual([]);
    expect(el.lightings).toEqual([]);
  });

  it('去重', () => {
    const el = extractPhotographyElements('中景，中景，暖黄灯光，暖黄');
    expect(el.shotSizes).toEqual(['中景']);
    expect(el.lightings).toEqual(['暖黄']);
  });
});

describe('extractShotPhotography', () => {
  it('聚合分镜所有 description 行的要素', () => {
    const elements = extractShotPhotography({
      scriptLines: [
        desc('特写，仰视，冷白法术光。'),
        desc('叶赎："你们来了。"'),
      ],
    });
    expect(elements.shotSizes).toEqual(['特写']);
    expect(elements.cameraAngles).toContain('仰视');
    expect(elements.lightings).toContain('冷白');
  });

  it('台词行不参与；无 description 返回空', () => {
    expect(extractShotPhotography({
      scriptLines: [{ id: 'l', text: '叶赎："你们来了。"', role: 'dialogue' }],
    }).shotSizes).toEqual([]);
    expect(extractShotPhotography({ scriptLines: [] })).toEqual({
      shotSizes: [], cameraAngles: [], lightings: [],
    });
  });
});

describe('景别连贯性', () => {
  it('主景别取第一个出现的', () => {
    expect(getPrimaryShotSize({ scriptLines: [desc('全景，平视。'), desc('近景。')] })).toBe('全景');
    expect(getPrimaryShotSize({ scriptLines: [desc('两人激战')] })).toBeUndefined();
  });

  it('景别跳变判定：差 ≥2 级判跳变', () => {
    expect(isShotSizeJump('特写', '大全景')).toBe(true);
    expect(isShotSizeJump('全景', '特写')).toBe(true);
    expect(isShotSizeJump('特写', '近景')).toBe(false);
    expect(isShotSizeJump('中景', '全景')).toBe(false);
  });

  it('缺景别不判跳变', () => {
    expect(isShotSizeJump(undefined, '全景')).toBe(false);
    expect(isShotSizeJump('特写', undefined)).toBe(false);
  });
});
