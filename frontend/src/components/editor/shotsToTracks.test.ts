import { describe, expect, it } from 'vitest';
import { shotsToTracks, syncShotSelectionsIntoTracks, collectShotsMissingMedia } from './SimpleEditor';
import type { Shot, StoredMediaAsset } from '../../types';
import type { Track } from '../../types/editor';

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

  it('剧情模式：description 里的引号台词进字幕轨（全 description 项目不再无字幕）', () => {
    const tracks = shotsToTracks([
      makeShot([
        { id: '1', text: '叶赎抬眼："你们来了。"', role: 'description' },
      ]),
    ]);
    const textTrack = tracks.find(t => t.id === 'text-main');
    expect(textTrack?.clips).toHaveLength(1);
    // 画面文本不进字幕，引号台词进
    expect(textTrack?.clips[0].src).toBe('你们来了。');
    expect(textTrack?.clips[0].src).not.toContain('叶赎抬眼');
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

describe('syncShotSelectionsIntoTracks 追加新分镜', () => {
  const videoAsset = (p: string): StoredMediaAsset => ({ localPath: p } as StoredMediaAsset);
  const shotWithVideo = (id: string, duration = 4): Shot => makeShot(
    [{ id: '1', text: `${id} 的脚本`, role: 'narration' }],
    { id, duration, media: { videos: [videoAsset(`/v/${id}.mp4`)], currentVideoIndex: 0 } as Shot['media'] },
  );

  it('分镜后补的视频在回剪辑时追加到主轨末尾', () => {
    const s1 = shotWithVideo('s1', 4);
    const s2 = shotWithVideo('s2', 6);
    // 初始时间线只含 s1（s2 当时没有视频被跳过）
    const initial = shotsToTracks([s1]);
    const synced = syncShotSelectionsIntoTracks(initial, [s1, s2]);
    const main = synced.find(t => t.isMainTrack)!;
    expect(main.clips.map(cl => cl.id)).toEqual(['clip-s1', 'clip-s2']);
    // 追加在末尾：s2 从 s1 结束处开始
    expect(main.clips[1].start).toBe(4);
    expect(main.clips[1].duration).toBe(6);
    // 字幕轨同步补齐（s2 的旁白行）
    const textTrack = synced.find(t => t.id === 'text-main');
    expect(textTrack?.clips.map(cl => cl.id)).toEqual(['text-s1', 'text-s2']);
  });

  it('仍无媒体的分镜继续跳过；已有片段不受影响', () => {
    const s1 = shotWithVideo('s1', 4);
    const s2 = makeShot([{ id: '1', text: 'x', role: 'narration' }], { id: 's2', duration: 3 }); // 无媒体
    const initial = shotsToTracks([s1]);
    const synced = syncShotSelectionsIntoTracks(initial, [s1, s2]);
    const main = synced.find(t => t.isMainTrack)!;
    expect(main.clips).toHaveLength(1);
  });

  it('collectShotsMissingMedia 只收集无图无视频的分镜', () => {
    const withVideo = shotWithVideo('s1');
    const without = makeShot([{ id: '1', text: 'x', role: 'narration' }], { id: 's2' });
    const missing = collectShotsMissingMedia([withVideo, without]);
    expect(missing.map(s => s.id)).toEqual(['s2']);
  });
});
