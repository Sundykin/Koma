import { describe, expect, it } from 'vitest';
import { parseLinghuiScriptContent, serializeLinghuiScriptShots } from '../state/linghuiScriptNodeUtils';

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

  it('保留 LibTV 分镜表的剧情、画面、生图和视频提示词字段', () => {
    const parsed = parseLinghuiScriptContent(JSON.stringify({
      shots: [{
        title: '开场',
        plotDescription: '主角推门进入。',
        visualDescription: '逆光中景，门外雨幕形成轮廓光。',
        imageGenerationPrompt: '电影感逆光室内，中景构图，雨夜门口，真实材质。',
        videoMotionPrompt: '镜头从门把手推到主角侧脸，雨声增强，动作缓慢。',
        durationSec: 10,
      }],
    }));

    expect(parsed.shots[0]).toEqual(expect.objectContaining({
      description: '主角推门进入。',
      plotDescription: '主角推门进入。',
      visualDescription: '逆光中景，门外雨幕形成轮廓光。',
      imageGenerationPrompt: '电影感逆光室内，中景构图，雨夜门口，真实材质。',
      videoMotionPrompt: '镜头从门把手推到主角侧脸，雨声增强，动作缓慢。',
    }));
    expect(parsed.formattedText).toContain('剧情：主角推门进入。');
    expect(parsed.formattedText).toContain('生图：电影感逆光室内');
    expect(parsed.formattedText).toContain('视频：镜头从门把手推到主角侧脸');
  });

  it('保留 LibTV 分镜行的角色、视频参考图和隐藏行 id', () => {
    const parsed = parseLinghuiScriptContent(JSON.stringify({
      shots: [{
        hiddenUuid: 'row-1',
        shotNumber: 3,
        plotDescription: '角色抬头看向远处。',
        characters: [{
          characterName: '主角',
          characterDescription: '黑色外套，紧张',
          characterImageUrl: 'https://example.com/character.png',
        }],
        videoReference: {
          referenceFrameImage: 'https://example.com/reference.jpg',
          startTime: 1.2,
          endTime: 2.4,
        },
      }],
    }));

    expect(parsed.shots[0]).toEqual(expect.objectContaining({
      hiddenUuid: 'row-1',
      shotNumber: 3,
      characters: [{
        characterName: '主角',
        characterDescription: '黑色外套，紧张',
        characterImageUrl: 'https://example.com/character.png',
      }],
      videoReference: {
        referenceFrameImage: 'https://example.com/reference.jpg',
        startTime: 1.2,
        endTime: 2.4,
      },
    }));
  });

  it('保留统一制作台需要的场景与道具实体', () => {
    const parsed = parseLinghuiScriptContent(JSON.stringify({
      shots: [{
        title: '交换信物',
        description: '两人在雨夜月台交换半枚硬币。',
        scenes: [{ sceneName: '雨夜月台', sceneDescription: '湿润地面与冷色顶灯' }],
        props: [{ propName: '半枚硬币', propDescription: '旧银币，边缘有缺口' }],
      }],
    }));

    const reparsed = parseLinghuiScriptContent(serializeLinghuiScriptShots(parsed.shots));
    expect(reparsed.shots[0]).toEqual(expect.objectContaining({
      scenes: [{ sceneName: '雨夜月台', sceneDescription: '湿润地面与冷色顶灯', sceneImageUrl: '' }],
      props: [{ propName: '半枚硬币', propDescription: '旧银币，边缘有缺口', propImageUrl: '' }],
    }));
  });

  it('序列化手动表格编辑后的分镜 JSON 并可重新解析', () => {
    const text = serializeLinghuiScriptShots([{
      id: 'shot-1',
      hiddenUuid: 'row-1',
      shotNumber: 1,
      title: '开场',
      description: '主角抵达。',
      plotDescription: '主角抵达。',
      visualDescription: '雨夜月台。',
      imageGenerationPrompt: '电影感雨夜月台。',
      videoMotionPrompt: '镜头缓慢推进。',
      durationSec: 10,
    }]);
    const parsed = parseLinghuiScriptContent(text);

    expect(parsed.source).toBe('json');
    expect(parsed.shots[0]).toEqual(expect.objectContaining({
      hiddenUuid: 'row-1',
      plotDescription: '主角抵达。',
      visualDescription: '雨夜月台。',
      imageGenerationPrompt: '电影感雨夜月台。',
      videoMotionPrompt: '镜头缓慢推进。',
      durationSec: 10,
    }));
  });
});
