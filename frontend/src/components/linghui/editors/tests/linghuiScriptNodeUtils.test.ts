import { describe, expect, it } from 'vitest';
import { parseLinghuiScriptContent } from '../state/linghuiScriptNodeUtils';

describe('parseLinghuiScriptContent duration normalization', () => {
  it('将 JSON 分镜 durationSec 归一到视频上游允许的白名单', () => {
    const parsed = parseLinghuiScriptContent(JSON.stringify({
      shots: [
        { title: '开场', description: '街道雨夜', durationSec: 4 },
        { title: '回望', description: '角色回头', durationSec: '8秒' },
        { title: '推进', description: '镜头缓慢推进', durationSec: 15 },
      ],
    }));

    expect(parsed.source).toBe('json');
    expect(parsed.shots.map(shot => shot.durationSec)).toEqual([6, 10, 16]);
    expect(parsed.formattedText).toContain('时长：6 秒');
    expect(parsed.formattedText).toContain('时长：10 秒');
    expect(parsed.formattedText).toContain('时长：16 秒');
  });

  it('纯文本分镜缺失或非法时长时默认 10 秒，带单位字符串取最近合法值', () => {
    const parsed = parseLinghuiScriptContent([
      '镜头 1 | 开场画面 | 10s',
      '镜头 2 | 空镜转场 | abc',
      '镜头 3 | 角色登场 | 18秒',
    ].join('\n'));

    expect(parsed.source).toBe('plain');
    expect(parsed.shots.map(shot => shot.durationSec)).toEqual([10, 10, 20]);
  });
});
