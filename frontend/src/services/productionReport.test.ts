import { describe, expect, it } from 'vitest';
import { buildProductionReport, formatProductionReport } from './productionReport';
import type { Shot, Character } from '../types';

const shot = (overrides: Partial<Shot> = {}): Shot => ({
  id: 's1',
  scriptLines: [{ id: 'l', text: '中景，平视，昏暗山洞。', role: 'description' }],
  shotType: 'medium',
  cameraMovement: 'static',
  duration: 8,
  characters: [],
  ...overrides,
} as Shot);

const char = (id: string, name: string): Character => ({ id, name, prompt: '', role: 'supporting' } as Character);

describe('buildProductionReport', () => {
  it('汇总各镜状态与质量缺口', () => {
    const shots = [
      shot({ id: 's1', media: { videos: [{ path: '/v1.mp4' } as never] } }),
      shot({ id: 's2', scriptLines: [{ id: 'l2', text: '两人对视。', role: 'description' }], media: {} }),
    ];
    const report = buildProductionReport(shots, []);
    expect(report.shotCount).toBe(2);
    expect(report.videoReady).toBe(1);
    expect(report.missingPhotography).toBe(1); // s2 无景别/机位
    expect(report.items[0].videoCount).toBe(1);
    expect(report.items[1].primaryShotSize).toBeUndefined();
  });

  it('台词超时长计入缺口', () => {
    const longDialogue = shot({
      id: 's3',
      scriptLines: [{ id: 'l', text: '字'.repeat(120), role: 'dialogue' }],
      duration: 8,
    });
    const report = buildProductionReport([longDialogue], []);
    expect(report.overDuration).toBe(1);
    expect(report.items[0].speechOver).toBe(true);
  });

  it('缺音色角色名汇总', () => {
    const shots = [shot({
      id: 's1',
      scriptLines: [{ id: 'l', text: '叶赎："你们来了。"', role: 'description' }],
    })];
    const chars = [char('c1', '叶赎')];
    const report = buildProductionReport(shots, chars);
    expect(report.missingVoiceNames).toContain('叶赎');
  });
});

describe('formatProductionReport', () => {
  it('生成人读文本含状态与逐镜', () => {
    const report = buildProductionReport([shot()], []);
    const text = formatProductionReport(report, '测试报告');
    expect(text).toContain('【测试报告】');
    expect(text).toContain('镜数：1');
    expect(text).toContain('#1');
    expect(text).toContain('缺摄影语言');
  });
});
