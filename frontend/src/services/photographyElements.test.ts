import { describe, expect, it } from 'vitest';
import { extractPhotographyElements, extractShotPhotography } from './photographyElements';
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
