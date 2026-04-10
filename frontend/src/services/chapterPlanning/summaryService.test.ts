import { describe, expect, it, vi } from 'vitest';
import { summarizeUnitsInBatches, computeAdaptiveBatchParams } from './summaryService';
import type { ChapterUnit, ChapterPlanningSummaryTuning } from './types';
import type { LLMProvider } from '../../providers/llm/types';

function makeUnits(count: number): ChapterUnit[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: 'episode' as const,
    index: i,
    label: `第${i + 1}集`,
    episodeNumber: i + 1,
    startOffset: i * 100,
    endOffset: (i + 1) * 100,
    charCount: 100,
  }));
}

function makeScript(unitCount: number): string {
  return Array.from(
    { length: unitCount },
    (_, i) => `第${i + 1}集\n这是第${i + 1}集的内容，包含一些剧情描述。`,
  ).join('\n\n');
}

function mockProvider(responses: string[]): LLMProvider {
  let callIndex = 0;
  return {
    type: 'mock',
    config: {} as any,
    validate: () => true,
    testConnection: async () => true,
    generateText: vi.fn(async () => {
      const resp = responses[callIndex % responses.length];
      callIndex++;
      return resp;
    }),
    chat: async () => '',
  };
}

describe('summaryService', () => {
  describe('computeAdaptiveBatchParams', () => {
    it('should return defaults when no tuning provided', () => {
      const params = computeAdaptiveBatchParams();
      expect(params.batchSize).toBe(8);
      expect(params.maxPromptChars).toBe(24_000);
    });

    it('should return defaults for zero context window', () => {
      const params = computeAdaptiveBatchParams({ contextWindowTokens: 0 });
      expect(params.batchSize).toBe(8);
      expect(params.maxPromptChars).toBe(24_000);
    });

    it('should increase batch size for large context windows', () => {
      const params = computeAdaptiveBatchParams({ contextWindowTokens: 128_000 });
      // 128000 * 0.78 - 500 = 99340 usable tokens
      // 99340 * 0.67 = ~66558 usable chars
      // 66558 / 2800 = ~23.7 → capped at 24
      expect(params.batchSize).toBeGreaterThan(8);
      expect(params.batchSize).toBeLessThanOrEqual(24);
      expect(params.maxPromptChars).toBeGreaterThan(24_000);
    });

    it('should use moderate batch for 32K context', () => {
      const params = computeAdaptiveBatchParams({ contextWindowTokens: 32_000 });
      // 32000 * 0.78 - 500 = 24460 usable tokens
      // 24460 * 0.67 = ~16388 usable chars
      // 16388 / 2800 = ~5.8 → 5
      expect(params.batchSize).toBeGreaterThanOrEqual(4);
      expect(params.batchSize).toBeLessThanOrEqual(8);
    });

    it('should floor batch size to minimum 4', () => {
      const params = computeAdaptiveBatchParams({ contextWindowTokens: 4_000 });
      expect(params.batchSize).toBe(4);
    });
  });

  describe('summarizeUnitsInBatches', () => {
    it('should call provider concurrently and return summaries in order', async () => {
      const units = makeUnits(4);
      const script = makeScript(4);

      const makeResponse = (startIdx: number, count: number) => JSON.stringify(
        Array.from({ length: count }, (_, j) => ({
          unitIndex: startIdx + j,
          summary: `摘要${startIdx + j}`,
          mainCharacters: ['角色A'],
          mainLocations: ['地点X'],
          tone: '紧张',
        })),
      );

      // With batch size 8 (default) and 4 units, should be 1 batch
      const provider = mockProvider([makeResponse(0, 4)]);

      const summaries = await summarizeUnitsInBatches(script, units, provider);

      expect(summaries.length).toBe(4);
      expect(summaries[0].unitIndex).toBe(0);
      expect(summaries[3].unitIndex).toBe(3);
      expect(summaries[0].summary).toBe('摘要0');
    });

    it('should produce fallback summaries when provider fails', async () => {
      const units = makeUnits(3);
      const script = makeScript(3);

      const provider: LLMProvider = {
        type: 'mock',
        config: {} as any,
        validate: () => true,
        testConnection: async () => true,
        generateText: vi.fn(async () => {
          throw new Error('API error');
        }),
        chat: async () => '',
      };

      const summaries = await summarizeUnitsInBatches(script, units, provider);

      // Should still return summaries for all units (fallback)
      expect(summaries.length).toBe(3);
      for (let i = 0; i < 3; i++) {
        expect(summaries[i].unitIndex).toBe(i);
        expect(summaries[i].summary).toContain(units[i].label);
      }
    });

    it('should produce fallback for invalid JSON response', async () => {
      const units = makeUnits(2);
      const script = makeScript(2);

      const provider = mockProvider(['not valid json at all']);

      const summaries = await summarizeUnitsInBatches(script, units, provider);

      expect(summaries.length).toBe(2);
      // Fallback summaries should contain labels
      for (let i = 0; i < 2; i++) {
        expect(summaries[i].unitIndex).toBe(i);
      }
    });

    it('should report progress', async () => {
      const units = makeUnits(2);
      const script = makeScript(2);

      const provider = mockProvider([
        JSON.stringify([
          { unitIndex: 0, summary: 's0', mainCharacters: [], mainLocations: [] },
          { unitIndex: 1, summary: 's1', mainCharacters: [], mainLocations: [] },
        ]),
      ]);

      const progressCalls: number[] = [];
      await summarizeUnitsInBatches(script, units, provider, (p) => {
        progressCalls.push(p.progress);
      });

      expect(progressCalls.length).toBeGreaterThan(0);
      // Final progress should be 1
      expect(progressCalls[progressCalls.length - 1]).toBe(1);
    });

    it('should respect summaryTuning concurrency', async () => {
      const units = makeUnits(2);
      const script = makeScript(2);

      const provider = mockProvider([
        JSON.stringify([
          { unitIndex: 0, summary: 's0', mainCharacters: [], mainLocations: [] },
          { unitIndex: 1, summary: 's1', mainCharacters: [], mainLocations: [] },
        ]),
      ]);

      const tuning: ChapterPlanningSummaryTuning = {
        concurrency: 1,
      };

      const summaries = await summarizeUnitsInBatches(
        script, units, provider, undefined, undefined, tuning,
      );

      expect(summaries.length).toBe(2);
    });

    it('should cap concurrency at MAX_CONCURRENCY (4)', async () => {
      const units = makeUnits(2);
      const script = makeScript(2);

      const provider = mockProvider([
        JSON.stringify([
          { unitIndex: 0, summary: 's0', mainCharacters: [], mainLocations: [] },
          { unitIndex: 1, summary: 's1', mainCharacters: [], mainLocations: [] },
        ]),
      ]);

      const tuning: ChapterPlanningSummaryTuning = {
        concurrency: 100, // Should be capped to 4
      };

      const summaries = await summarizeUnitsInBatches(
        script, units, provider, undefined, undefined, tuning,
      );

      // Should still work without error
      expect(summaries.length).toBe(2);
    });
  });
});
