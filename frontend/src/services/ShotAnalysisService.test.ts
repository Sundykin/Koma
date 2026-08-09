import { describe, expect, it } from 'vitest';
import type { Shot } from '../types';
import {
  _SHOTS_SCHEMA,
  buildShotCoverageReport,
  normalizeGeneratedShotContinuity,
  splitScriptForShotAnalysis,
} from './ShotAnalysisService';

function makeShot(id: string, overrides: Partial<Shot> = {}): Shot {
  return {
    id,
    scriptLines: [{ id: `${id}-line`, text: '人物继续向前走' }],
    shotType: 'medium',
    cameraMovement: 'tracking',
    duration: 6,
    characters: ['hero'],
    scenes: ['road'],
    ...overrides,
  };
}

describe('buildShotCoverageReport', () => {
  it('reports full coverage when shot scriptLines preserve all script units', () => {
    const report = buildShotCoverageReport(
      '沈鹿睁开眼。她看向窗帘缝隙。灰尘在光里浮动。',
      [
        { scriptLines: [{ id: 'a', text: '沈鹿睁开眼。她看向窗帘缝隙。' }] },
        { scriptLines: [{ id: 'b', text: '灰尘在光里浮动。' }] },
      ],
    );

    expect(report.coverageRatio).toBe(1);
    expect(report.missingSamples).toEqual([]);
  });

  it('samples missing script units when LLM drops middle details', () => {
    const report = buildShotCoverageReport(
      '沈鹿睁开眼。她看向窗帘缝隙。灰尘在光里浮动。',
      [{ scriptLines: [{ id: 'a', text: '沈鹿睁开眼。' }] }],
    );

    expect(report.coverageRatio).toBeLessThan(1);
    expect(report.missingSamples).toContain('她看向窗帘缝隙');
    expect(report.missingSamples).toContain('灰尘在光里浮动');
  });
});

describe('splitScriptForShotAnalysis', () => {
  it('keeps short scripts as one chunk', () => {
    expect(splitScriptForShotAnalysis('短剧本。')).toEqual(['短剧本。']);
  });

  it('splits long scripts into sentence-bound chunks', () => {
    const script = Array.from({ length: 400 }, (_, i) => `第${i}句发生了新的动作。`).join('');
    const chunks = splitScriptForShotAnalysis(script);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(script);
    expect(chunks.every(chunk => chunk.length <= 2600)).toBe(true);
  });
});

describe('shot analysis continuity metadata', () => {
  it('advertises optional continuity fields in the structured schema', () => {
    const properties = _SHOTS_SCHEMA.properties.shots.items.properties;
    expect(properties.continuity).toMatchObject({ enum: ['inherit', 'independent'] });
    expect(properties.continuityReason.type).toBe('string');
    expect(_SHOTS_SCHEMA.properties.shots.items.required).not.toContain('continuity');
  });

  it('ignores a chunk-first independent suggestion after global merge', () => {
    const normalized = normalizeGeneratedShotContinuity(
      [makeShot('a'), makeShot('b')],
      [
        { continuity: 'independent', continuityReason: '首镜' },
        {
          continuity: 'independent',
          continuityReason: '局部 chunk 首镜',
          ignoreContinuitySuggestion: true,
        },
      ],
    );

    expect(normalized[1].videoReference).toMatchObject({
      mode: 'auto',
      usePreviousTailFrame: true,
      autoUsePreviousTailFrame: true,
      sourceShotId: 'a',
    });
  });

  it('falls back deterministically for missing or invalid LLM continuity values', () => {
    const normalized = normalizeGeneratedShotContinuity(
      [makeShot('a'), makeShot('b'), makeShot('c', {
        scenes: ['office'],
        scriptLines: [{ id: 'c-line', text: '次日，画面切到办公室' }],
      })],
      [{}, { continuity: 'maybe' }, { continuity: { invalid: true } }],
    );

    expect(normalized[1].videoReference?.usePreviousTailFrame).toBe(true);
    expect(normalized[2].videoReference?.usePreviousTailFrame).toBe(false);
  });
});
