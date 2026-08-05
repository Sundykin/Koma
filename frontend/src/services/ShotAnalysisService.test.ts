import { describe, expect, it } from 'vitest';
import { buildShotCoverageReport, splitScriptForShotAnalysis } from './ShotAnalysisService';

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
