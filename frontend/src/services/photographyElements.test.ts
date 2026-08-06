import { describe, expect, it } from 'vitest';
import { extractPhotographyElements, extractShotPhotography, getPrimaryShotSize, isShotSizeJump, shotSizeToShotType, detectLightTone, detectShotLightTone, isLightToneJump, isSameScene } from './photographyElements';
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

describe('景别 → shotType 映射', () => {
  it('主景别映射到 shotType 枚举', () => {
    expect(shotSizeToShotType({ scriptLines: [desc('特写，平视。')] })).toBe('close-up');
    expect(shotSizeToShotType({ scriptLines: [desc('全景，仰视。')] })).toBe('wide');
    expect(shotSizeToShotType({ scriptLines: [desc('大全景。')] })).toBe('extreme-wide');
    expect(shotSizeToShotType({ scriptLines: [desc('近景。')] })).toBe('medium');
    expect(shotSizeToShotType({ scriptLines: [desc('两人激战')] })).toBeUndefined();
  });
});

describe('光线冷暖检测', () => {
  it('识别暖/冷主色调', () => {
    expect(detectLightTone('暖黄烛光映亮桌面')).toBe('warm');
    expect(detectLightTone('冷白月光从窗缝斜入')).toBe('cold');
    expect(detectLightTone('两人在夜色中对视')).toBe('none');
  });

  it('暖冷共存返回 mixed', () => {
    expect(detectLightTone('油灯暖黄，窗外冷白月光')).toBe('mixed');
  });

  it('聚合分镜 description 行的色调', () => {
    expect(detectShotLightTone({ scriptLines: [desc('暖黄烛光摇曳。')] })).toBe('warm');
    expect(detectShotLightTone({ scriptLines: [desc('冷白月光。')] })).toBe('cold');
  });

  it('突变判定：暖↔冷直接跳', () => {
    expect(isLightToneJump('warm', 'cold')).toBe(true);
    expect(isLightToneJump('cold', 'warm')).toBe(true);
    expect(isLightToneJump('warm', 'mixed')).toBe(false);
    expect(isLightToneJump('warm', 'none')).toBe(false);
    expect(isLightToneJump(undefined, 'cold')).toBe(false);
  });

  it('同场景判定：scenes 有交集', () => {
    expect(isSameScene({ scenes: ['s1'] }, { scenes: ['s1', 's2'] })).toBe(true);
    expect(isSameScene({ scenes: ['s1'] }, { scenes: ['s2'] })).toBe(false);
  });
});
