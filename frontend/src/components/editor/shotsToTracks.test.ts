import { describe, expect, it } from 'vitest';
import { shotsToTracks } from './SimpleEditor';
import type { Shot } from '../../types';

function makeShot(scriptLines: Shot['scriptLines'], overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot_1',
    scriptLines,
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 6,
    characters: [],
    ...overrides,
  };
}

describe('shotsToTracks 字幕轨道（text-main）', () => {
  it('解说模式：整列旁白行进入字幕轨道', () => {
    const tracks = shotsToTracks([
      makeShot([
        { id: '1', text: '第一句解说', role: 'narration' },
        { id: '2', text: '第二句解说', role: 'narration' },
      ]),
    ]);
    const textTrack = tracks.find(t => t.id === 'text-main');
    expect(textTrack?.clips).toHaveLength(1);
    expect(textTrack?.clips[0].src).toBe('第一句解说\n第二句解说');
  });

  it('剧情模式：分镜描述行（description）不进字幕轨道，只有旁白/台词进', () => {
    const tracks = shotsToTracks([
      makeShot([
        { id: '1', text: '戏台全景，雨夜，宁卓持剑而立。', role: 'description' },
        { id: '2', text: '宁卓说：你们来了。', role: 'description' },
        { id: '3', text: '画外音的旁白一句', role: 'narration' },
        { id: '4', text: '你们来了', role: 'dialogue', characterId: 'char_1' },
      ]),
    ]);
    const textTrack = tracks.find(t => t.id === 'text-main');
    expect(textTrack?.clips).toHaveLength(1);
    // 只有声音行进入字幕，description 的画面文本被排除
    expect(textTrack?.clips[0].src).toBe('画外音的旁白一句\n你们来了');
    expect(textTrack?.clips[0].src).not.toContain('戏台全景');
  });

  it('剧情模式：分镜只有 description 行时不产生字幕 clip', () => {
    const tracks = shotsToTracks([
      makeShot([{ id: '1', text: '纯画面描述', role: 'description' }]),
    ]);
    const textTrack = tracks.find(t => t.id === 'text-main');
    expect(textTrack?.clips ?? []).toHaveLength(0);
  });

  it('无 role 的旧数据行按旁白处理（向后兼容）', () => {
    const tracks = shotsToTracks([
      makeShot([{ id: '1', text: '旧格式字幕行' }]),
    ]);
    const textTrack = tracks.find(t => t.id === 'text-main');
    expect(textTrack?.clips[0].src).toBe('旧格式字幕行');
  });
});
