import { describe, expect, it } from 'vitest';
import { validateChapterSelection, deterministicFallback } from './validator';
import type { CandidateCutpoint, ChapterUnit, ChapterPlanningConfig } from './types';

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

function makeCandidates(count: number): CandidateCutpoint[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `cut-${i}`,
    afterUnitIndex: i,
    score: 0.5 + Math.random() * 0.5,
    breakdown: {
      narrativeShift: 0.5,
      hookStrength: 0.3,
      castShift: 0.4,
      locationShift: 0.3,
      structureCue: 0.1,
      anchorFit: 0.5,
    },
    reason: '测试',
  }));
}

const config: ChapterPlanningConfig = {
  mode: 'smart',
  targetChapters: 3,
  minUnitsPerChapter: 2,
  maxUnitsPerChapter: 30,
};

describe('validator', () => {
  const units = makeUnits(10);
  const candidates = makeCandidates(9); // 9 gaps between 10 units

  describe('validateChapterSelection', () => {
    it('should pass for valid selection', () => {
      const result = validateChapterSelection(
        ['cut-3', 'cut-6'],
        candidates,
        units,
        config,
      );

      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should detect duplicate cuts', () => {
      const result = validateChapterSelection(
        ['cut-3', 'cut-3', 'cut-6'],
        candidates,
        units,
        config,
      );

      expect(result.issues.some(i => i.code === 'DUPLICATE_CUT')).toBe(true);
    });

    it('should detect unknown candidates', () => {
      const result = validateChapterSelection(
        ['cut-3', 'cut-99'],
        candidates,
        units,
        config,
      );

      expect(result.issues.some(i => i.code === 'UNKNOWN_CANDIDATE')).toBe(true);
    });

    it('should detect too-short chapters', () => {
      // With minUnitsPerChapter: 2, cuts at 0 and 1 would create a 1-unit chapter
      const result = validateChapterSelection(
        ['cut-0', 'cut-1'],
        candidates,
        units,
        { ...config, minUnitsPerChapter: 2 },
      );

      expect(result.issues.some(i => i.code === 'CHAPTER_TOO_SHORT')).toBe(true);
    });

    it('should auto-repair duplicates and unknowns', () => {
      const result = validateChapterSelection(
        ['cut-3', 'cut-3', 'cut-99', 'cut-6'],
        candidates,
        units,
        config,
      );

      expect(result.repairedIds).toBeDefined();
      expect(result.repairedIds).toEqual(['cut-3', 'cut-6']);
    });

    it('should detect wrong cut count', () => {
      // targetChapters=3 expects 2 cuts, but we pass 1
      const result = validateChapterSelection(
        ['cut-4'],
        candidates,
        units,
        config,
      );

      expect(result.issues.some(i => i.code === 'WRONG_CUT_COUNT')).toBe(true);
      expect(result.valid).toBe(false);
    });

    it('should detect truly adjacent cuts (diff=1)', () => {
      // cut-4 (index 4) and cut-5 (index 5) differ by only 1
      const result = validateChapterSelection(
        ['cut-4', 'cut-5'],
        candidates,
        units,
        config,
      );

      expect(result.issues.some(i => i.code === 'ADJACENT_CUTS')).toBe(true);
      expect(result.valid).toBe(false);
    });

    it('should treat too-short chapters as error', () => {
      const result = validateChapterSelection(
        ['cut-0', 'cut-1'],
        candidates,
        units,
        { ...config, minUnitsPerChapter: 2 },
      );

      const shortIssue = result.issues.find(i => i.code === 'CHAPTER_TOO_SHORT');
      expect(shortIssue).toBeDefined();
      expect(shortIssue!.severity).toBe('error');
      expect(shortIssue!.autoFixable).toBe(true);
    });
  });

  describe('deterministicFallback', () => {
    it('should select cuts near ideal positions', () => {
      const ids = deterministicFallback(candidates, units, {
        ...config,
        targetChapters: 3,
      });

      // Should select 2 cuts for 3 chapters
      expect(ids.length).toBe(2);

      // All should be valid candidate IDs
      const validIds = new Set(candidates.map(c => c.id));
      for (const id of ids) {
        expect(validIds.has(id)).toBe(true);
      }
    });

    it('should return empty for single chapter', () => {
      const ids = deterministicFallback(candidates, units, {
        ...config,
        targetChapters: 1,
      });
      expect(ids).toEqual([]);
    });

    it('should handle units smaller than target chapters', () => {
      const smallUnits = makeUnits(3);
      const smallCandidates = makeCandidates(2);

      const ids = deterministicFallback(smallCandidates, smallUnits, {
        ...config,
        targetChapters: 5,
      });

      // Can't make 5 chapters from 3 units, should cap at 2 cuts
      expect(ids.length).toBeLessThanOrEqual(2);
    });
  });
});
