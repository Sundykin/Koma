import { describe, expect, it } from 'vitest';
import { buildUnits, extractUnitText } from './unitBuilder';

const EPISODE_SCRIPT = [
  '第一集：起点',
  '主角离开家乡，踏上旅途。',
  '路上遇到一位神秘老人。',
  '',
  '第二集：相遇',
  '主角来到城镇，结识伙伴。',
  '两人决定一起冒险。',
  '',
  '第三集：危机',
  '遭遇第一个强敌。',
  '苦战后勉强获胜。',
].join('\n');

const NO_EPISODE_SCRIPT = [
  '这是一段没有集标记的长文本。',
  '主角在城市里游荡，寻找线索。',
  '经过多番调查，终于找到关键证据。',
  '',
  '场景转换到另一个地方。',
  '新的角色登场，带来新的信息。',
  '故事继续推进。',
].join('\n');

describe('unitBuilder', () => {
  describe('buildUnits - episode mode', () => {
    it('should detect episode boundaries and create episode units', () => {
      const result = buildUnits(EPISODE_SCRIPT);

      expect(result.mode).toBe('episode');
      expect(result.boundaries.length).toBe(3);
      expect(result.units.length).toBe(3);

      expect(result.units[0].kind).toBe('episode');
      expect(result.units[0].label).toBe('第一集：起点');
      expect(result.units[0].index).toBe(0);

      expect(result.units[1].label).toBe('第二集：相遇');
      expect(result.units[2].label).toBe('第三集：危机');
    });

    it('should have correct offsets', () => {
      const result = buildUnits(EPISODE_SCRIPT);

      // Each unit's text should be extractable
      for (const unit of result.units) {
        const text = extractUnitText(EPISODE_SCRIPT, unit);
        expect(text.length).toBeGreaterThan(0);
        expect(unit.charCount).toBeGreaterThan(0);
      }

      // Units should cover the full script (no gaps at boundaries)
      expect(result.units[0].startOffset).toBeGreaterThan(0); // After first boundary line
      expect(result.units[result.units.length - 1].endOffset).toBe(EPISODE_SCRIPT.length);
    });

    it('should assign episode numbers', () => {
      const result = buildUnits(EPISODE_SCRIPT);

      expect(result.units[0].kind === 'episode' && result.units[0].episodeNumber).toBe(1);
      expect(result.units[1].kind === 'episode' && result.units[1].episodeNumber).toBe(2);
      expect(result.units[2].kind === 'episode' && result.units[2].episodeNumber).toBe(3);
    });
  });

  describe('buildUnits - block mode', () => {
    it('should fallback to block mode when no episode markers', () => {
      const result = buildUnits(NO_EPISODE_SCRIPT);

      expect(result.mode).toBe('block');
      expect(result.boundaries.length).toBe(0);
      expect(result.units.length).toBeGreaterThanOrEqual(1);

      for (const unit of result.units) {
        expect(unit.kind).toBe('block');
      }
    });

    it('should have valid offsets in block mode', () => {
      const result = buildUnits(NO_EPISODE_SCRIPT);

      for (const unit of result.units) {
        const text = extractUnitText(NO_EPISODE_SCRIPT, unit);
        expect(text.length).toBeGreaterThan(0);
      }
    });
  });

  describe('extractUnitText', () => {
    it('should extract correct text for each unit', () => {
      const result = buildUnits(EPISODE_SCRIPT);
      const text0 = extractUnitText(EPISODE_SCRIPT, result.units[0]);
      expect(text0).toContain('主角离开家乡');
      expect(text0).toContain('神秘老人');

      const text1 = extractUnitText(EPISODE_SCRIPT, result.units[1]);
      expect(text1).toContain('来到城镇');
    });
  });
});
