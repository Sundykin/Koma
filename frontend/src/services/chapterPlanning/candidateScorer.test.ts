import { describe, expect, it } from 'vitest';
import { generateCandidateCutpoints, selectTopCandidates } from './candidateScorer';
import type { ChapterUnit, ChapterUnitSummary, ChapterPlanningConfig } from './types';

function makeUnits(count: number): ChapterUnit[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: 'episode' as const,
    index: i,
    label: `第${i + 1}集`,
    episodeNumber: i + 1,
    startOffset: i * 1000,
    endOffset: (i + 1) * 1000,
    charCount: 1000,
  }));
}

function makeSummaries(count: number): ChapterUnitSummary[] {
  const tones = ['紧张', '温馨', '悲伤', '轻松', '激烈'];
  const chars = [['张三', '李四'], ['王五', '赵六'], ['张三', '王五'], ['李四', '赵六'], ['全员']];
  const locs = [['城市'], ['山区'], ['海边'], ['城市'], ['森林']];

  return Array.from({ length: count }, (_, i) => ({
    unitIndex: i,
    summary: `第${i + 1}集摘要：发生了重要的事件${i}`,
    mainCharacters: chars[i % chars.length],
    mainLocations: locs[i % locs.length],
    tone: tones[i % tones.length],
  }));
}

describe('candidateScorer', () => {
  const units = makeUnits(10);
  const summaries = makeSummaries(10);

  describe('generateCandidateCutpoints', () => {
    it('should generate candidates for all adjacent pairs', () => {
      const config: ChapterPlanningConfig = {
        mode: 'smart',
        targetChapters: 3,
        minUnitsPerChapter: 2,
        maxUnitsPerChapter: 30,
      };

      const candidates = generateCandidateCutpoints(units, summaries, config);

      // Should have one candidate for each adjacent pair (9 pairs for 10 units)
      expect(candidates.length).toBe(9);

      // Each candidate should have valid structure
      for (const c of candidates) {
        expect(c.id).toMatch(/^cut-\d+$/);
        expect(c.afterUnitIndex).toBeGreaterThanOrEqual(0);
        expect(c.afterUnitIndex).toBeLessThan(9);
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.score).toBeLessThanOrEqual(1);
        expect(c.breakdown).toBeDefined();
        expect(c.reason).toBeTruthy();
      }
    });

    it('should be sorted by score descending', () => {
      const config: ChapterPlanningConfig = {
        mode: 'smart',
        targetChapters: 3,
        minUnitsPerChapter: 2,
        maxUnitsPerChapter: 30,
      };

      const candidates = generateCandidateCutpoints(units, summaries, config);

      for (let i = 1; i < candidates.length; i++) {
        expect(candidates[i].score).toBeLessThanOrEqual(candidates[i - 1].score);
      }
    });

    it('should weight anchorFit higher in even mode', () => {
      const smartConfig: ChapterPlanningConfig = {
        mode: 'smart',
        targetChapters: 3,
        minUnitsPerChapter: 2,
        maxUnitsPerChapter: 30,
      };
      const evenConfig: ChapterPlanningConfig = {
        mode: 'even',
        targetChapters: 3,
        minUnitsPerChapter: 2,
        maxUnitsPerChapter: 30,
      };

      const smartCandidates = generateCandidateCutpoints(units, summaries, smartConfig);
      const evenCandidates = generateCandidateCutpoints(units, summaries, evenConfig);

      // In even mode, candidates near ideal positions (3, 6 for 3 chapters of 10 units)
      // should rank higher
      const evenTopIds = evenCandidates.slice(0, 3).map(c => c.afterUnitIndex);
      const smartTopIds = smartCandidates.slice(0, 3).map(c => c.afterUnitIndex);

      // Even mode top candidates should be closer to ideal positions [3, 6]
      const evenDistance = evenTopIds.reduce((sum, idx) => {
        return sum + Math.min(Math.abs(idx - 3), Math.abs(idx - 6));
      }, 0);
      const smartDistance = smartTopIds.reduce((sum, idx) => {
        return sum + Math.min(Math.abs(idx - 3), Math.abs(idx - 6));
      }, 0);

      expect(evenDistance).toBeLessThanOrEqual(smartDistance);
    });

    it('should return empty for fewer than 2 units', () => {
      const config: ChapterPlanningConfig = {
        mode: 'smart',
        minUnitsPerChapter: 2,
        maxUnitsPerChapter: 30,
      };

      expect(generateCandidateCutpoints([units[0]], summaries.slice(0, 1), config)).toEqual([]);
      expect(generateCandidateCutpoints([], [], config)).toEqual([]);
    });
  });

  describe('selectTopCandidates', () => {
    it('should limit candidates to top K', () => {
      const config: ChapterPlanningConfig = {
        mode: 'smart',
        targetChapters: 3,
        minUnitsPerChapter: 2,
        maxUnitsPerChapter: 30,
      };

      const allCandidates = generateCandidateCutpoints(units, summaries, config);
      const top = selectTopCandidates(allCandidates, config, 5);

      expect(top.length).toBe(5);
      // Should be the highest-scoring ones
      expect(top[0].score).toBe(allCandidates[0].score);
    });
  });

  describe('bigram-based narrativeShift (R1)', () => {
    it('should score higher for very different summaries', () => {
      const config: ChapterPlanningConfig = {
        mode: 'smart',
        targetChapters: 2,
        minUnitsPerChapter: 1,
        maxUnitsPerChapter: 30,
      };

      // Two summaries with completely different content
      const divergentSummaries: ChapterUnitSummary[] = [
        {
          unitIndex: 0,
          summary: '张三在城市里和李四讨论公司的收购计划',
          mainCharacters: ['张三', '李四'],
          mainLocations: ['城市'],
          tone: '紧张',
        },
        {
          unitIndex: 1,
          summary: '王五在海边回忆起童年的温馨时光和母亲的微笑',
          mainCharacters: ['王五'],
          mainLocations: ['海边'],
          tone: '温馨',
        },
      ];

      // Two summaries with similar content
      const similarSummaries: ChapterUnitSummary[] = [
        {
          unitIndex: 0,
          summary: '张三在城市里和李四讨论公司的收购计划',
          mainCharacters: ['张三', '李四'],
          mainLocations: ['城市'],
          tone: '紧张',
        },
        {
          unitIndex: 1,
          summary: '张三在城市里继续和李四讨论收购计划的细节',
          mainCharacters: ['张三', '李四'],
          mainLocations: ['城市'],
          tone: '紧张',
        },
      ];

      const divergentUnits = makeUnits(2);
      const similarUnits = makeUnits(2);

      const divergentCandidates = generateCandidateCutpoints(divergentUnits, divergentSummaries, config);
      const similarCandidates = generateCandidateCutpoints(similarUnits, similarSummaries, config);

      // Divergent summaries should produce higher narrativeShift
      expect(divergentCandidates[0].breakdown.narrativeShift)
        .toBeGreaterThan(similarCandidates[0].breakdown.narrativeShift);
    });

    it('should use neutral tone value when tone is missing', () => {
      const config: ChapterPlanningConfig = {
        mode: 'smart',
        targetChapters: 2,
        minUnitsPerChapter: 1,
        maxUnitsPerChapter: 30,
      };

      const noToneSummaries: ChapterUnitSummary[] = [
        {
          unitIndex: 0,
          summary: '第一集讲述了开始的故事',
          mainCharacters: ['张三'],
          mainLocations: ['城市'],
          // no tone
        },
        {
          unitIndex: 1,
          summary: '第二集延续了冒险的旅程',
          mainCharacters: ['张三'],
          mainLocations: ['山区'],
          // no tone
        },
      ];

      const candidates = generateCandidateCutpoints(makeUnits(2), noToneSummaries, config);
      // Should not crash and should produce valid score
      expect(candidates[0].breakdown.narrativeShift).toBeGreaterThanOrEqual(0);
      expect(candidates[0].breakdown.narrativeShift).toBeLessThanOrEqual(1);
    });
  });

  describe('tiered hookStrength (R2)', () => {
    it('should score higher for critical-tier keywords', () => {
      const config: ChapterPlanningConfig = {
        mode: 'smart',
        targetChapters: 2,
        minUnitsPerChapter: 1,
        maxUnitsPerChapter: 30,
      };

      // Critical tier: 死, 杀, 背叛
      const criticalSummaries: ChapterUnitSummary[] = [
        {
          unitIndex: 0,
          summary: '他发现了背叛的真相之后决定牺牲自己',
          mainCharacters: ['主角'],
          mainLocations: ['战场'],
          tone: '紧张',
        },
        {
          unitIndex: 1,
          summary: '敌人策划了一场毁灭性的阴谋',
          mainCharacters: ['反派'],
          mainLocations: ['基地'],
          tone: '紧张',
        },
      ];

      // Weak tier: 离别, 怀疑
      const weakSummaries: ChapterUnitSummary[] = [
        {
          unitIndex: 0,
          summary: '两人在车站离别时充满犹豫',
          mainCharacters: ['主角'],
          mainLocations: ['车站'],
          tone: '悲伤',
        },
        {
          unitIndex: 1,
          summary: '主角开始怀疑之前的约定是否还有效',
          mainCharacters: ['主角'],
          mainLocations: ['家中'],
          tone: '忧郁',
        },
      ];

      const criticalCandidates = generateCandidateCutpoints(makeUnits(2), criticalSummaries, config);
      const weakCandidates = generateCandidateCutpoints(makeUnits(2), weakSummaries, config);

      expect(criticalCandidates[0].breakdown.hookStrength)
        .toBeGreaterThan(weakCandidates[0].breakdown.hookStrength);
    });

    it('should give diversity bonus when both sides have hooks', () => {
      const config: ChapterPlanningConfig = {
        mode: 'smart',
        targetChapters: 2,
        minUnitsPerChapter: 1,
        maxUnitsPerChapter: 30,
      };

      // Only before has hooks
      const oneSideSummaries: ChapterUnitSummary[] = [
        {
          unitIndex: 0,
          summary: '突然发生了危机，所有人都陷入了困境',
          mainCharacters: ['主角'],
          mainLocations: ['城市'],
          tone: '紧张',
        },
        {
          unitIndex: 1,
          summary: '天气晴朗，大家在公园散步聊天',
          mainCharacters: ['主角'],
          mainLocations: ['公园'],
          tone: '轻松',
        },
      ];

      // Both sides have hooks
      const bothSideSummaries: ChapterUnitSummary[] = [
        {
          unitIndex: 0,
          summary: '突然发生了危机，所有人都陷入了困境',
          mainCharacters: ['主角'],
          mainLocations: ['城市'],
          tone: '紧张',
        },
        {
          unitIndex: 1,
          summary: '新的秘密被揭露，威胁即将来临',
          mainCharacters: ['主角'],
          mainLocations: ['密室'],
          tone: '紧张',
        },
      ];

      const oneSide = generateCandidateCutpoints(makeUnits(2), oneSideSummaries, config);
      const bothSide = generateCandidateCutpoints(makeUnits(2), bothSideSummaries, config);

      // Both-side should score higher due to diversity bonus
      expect(bothSide[0].breakdown.hookStrength)
        .toBeGreaterThan(oneSide[0].breakdown.hookStrength);
    });

    it('should return default for missing summaries', () => {
      const config: ChapterPlanningConfig = {
        mode: 'smart',
        targetChapters: 2,
        minUnitsPerChapter: 1,
        maxUnitsPerChapter: 30,
      };

      // No summaries at all
      const candidates = generateCandidateCutpoints(makeUnits(2), [], config);
      expect(candidates[0].breakdown.hookStrength).toBe(0.2);
    });
  });
});
