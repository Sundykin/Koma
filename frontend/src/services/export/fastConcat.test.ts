import { describe, expect, it } from 'vitest';
import { analyzeTimelineForFastConcat, resolveClipLocalPath, detectTimelineGaps } from './fastConcat';
import { MediaType, type Clip, type Track } from '../../types/editor';
import { toKomaLocalUrl } from '../../utils/urlUtils';

let seq = 0;
function clip(overrides: Partial<Clip> = {}): Clip {
  seq += 1;
  return {
    id: `clip-${seq}`,
    assetId: `asset-${seq}`,
    trackId: 't1',
    start: 0,
    duration: 5,
    offset: 0,
    name: `片段${seq}`,
    type: MediaType.VIDEO,
    src: '/videos/a.mp4',
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    ...overrides,
  } as Clip;
}

function videoTrack(clips: Clip[], overrides: Partial<Track> = {}): Track {
  return { id: 't1', type: 'video', clips, order: 0, isMainTrack: true, ...overrides };
}

describe('resolveClipLocalPath', () => {
  it('koma-local URL 还原为本地路径', () => {
    expect(resolveClipLocalPath(toKomaLocalUrl('/tmp/a b.mp4'))).toBe('/tmp/a b.mp4');
  });
  it('绝对路径直传；远程 URL 拒绝', () => {
    expect(resolveClipLocalPath('/tmp/x.mp4')).toBe('/tmp/x.mp4');
    expect(resolveClipLocalPath('https://cdn.x.com/v.mp4')).toBeNull();
    expect(resolveClipLocalPath('')).toBeNull();
  });
});

describe('analyzeTimelineForFastConcat', () => {
  it('纯视频顺序拼接：合格且带出 offset/duration', () => {
    const tracks = [videoTrack([
      clip({ start: 0, duration: 4, offset: 1.5, src: '/v/1.mp4', name: 'A' }),
      clip({ start: 4, duration: 6, offset: 0, src: '/v/2.mp4', name: 'B' }),
    ])];
    const result = analyzeTimelineForFastConcat(tracks);
    expect(result.eligible).toBe(true);
    expect(result.clips).toEqual([
      { kind: 'video', source: '/v/1.mp4', offsetSec: 1.5, durationSec: 4, label: 'A' },
      { kind: 'video', source: '/v/2.mp4', offsetSec: 0, durationSec: 6, label: 'B' },
    ]);
  });

  it('图片片段映射为 image kind', () => {
    const tracks = [videoTrack([
      clip({ type: MediaType.IMAGE, src: toKomaLocalUrl('/img/p1.png'), duration: 3 }),
      clip({ start: 3, duration: 5, src: '/v/1.mp4' }),
    ])];
    const result = analyzeTimelineForFastConcat(tracks);
    expect(result.eligible).toBe(true);
    expect(result.clips[0].kind).toBe('image');
    expect(result.clips[0].offsetSec).toBeUndefined();
  });

  it('含字幕轨内容 → 合格并收集 textClips（v3 ASS 烧录）', () => {
    const tracks = [
      videoTrack([clip()]),
      { id: 't2', type: 'text', clips: [
        clip({ type: MediaType.TEXT, text: '第一句台词', start: 0.5, duration: 2 }),
        clip({ type: MediaType.TEXT, text: '  ' }), // 空白内容不收集
      ], order: 1 } as Track,
    ];
    const result = analyzeTimelineForFastConcat(tracks);
    expect(result.eligible).toBe(true);
    expect(result.textClips).toHaveLength(1);
    expect(result.textClips[0].text).toBe('第一句台词');
  });

  it('本地音频片段按时间轴位置放行（v2 定位混入）', () => {
    const tracks = [
      videoTrack([clip({ duration: 8 })]),
      {
        id: 't3', type: 'audio', order: -1,
        clips: [clip({ type: MediaType.AUDIO, src: '/vo/narration.mp3', start: 1.5, duration: 4, offset: 0.5, name: '配音' })],
      } as Track,
    ];
    const result = analyzeTimelineForFastConcat(tracks);
    expect(result.eligible).toBe(true);
    const audio = result.clips.find(c => c.kind === 'audio');
    expect(audio).toEqual({
      kind: 'audio',
      source: '/vo/narration.mp3',
      offsetSec: 0.5,
      durationSec: 4,
      startSec: 1.5,
      label: '配音',
    });
  });

  it('音频源非本地或带淡入淡出 → 不合格', () => {
    const remoteAudio = analyzeTimelineForFastConcat([
      videoTrack([clip()]),
      { id: 't3', type: 'audio', clips: [clip({ type: MediaType.AUDIO, src: 'https://x/vo.mp3' })], order: -1 } as Track,
    ]);
    expect(remoteAudio.eligible).toBe(false);
    expect(remoteAudio.reasons.join()).toContain('不是本地文件');

    const faded = analyzeTimelineForFastConcat([
      videoTrack([clip()]),
      { id: 't3', type: 'audio', clips: [clip({ type: MediaType.AUDIO, src: '/a.mp3', audioFade: { fadeInDuration: 1 } as never })], order: -1 } as Track,
    ]);
    expect(faded.eligible).toBe(false);
    expect(faded.reasons.join()).toContain('淡入淡出');
  });

  it('转场/重叠/特效/远程源逐条拦截', () => {
    expect(analyzeTimelineForFastConcat([videoTrack([clip()], {
      transitions: [{ id: 'tr', fromClipId: 'a', toClipId: 'b', type: 'fade', duration: 1 }],
    })]).eligible).toBe(false);

    const overlapped = analyzeTimelineForFastConcat([videoTrack([
      clip({ start: 0, duration: 5 }),
      clip({ start: 3, duration: 5 }),
    ])]);
    expect(overlapped.eligible).toBe(false);
    expect(overlapped.reasons.join()).toContain('重叠');

    expect(analyzeTimelineForFastConcat([videoTrack([clip({ scale: 1.2 })])]).eligible).toBe(false);
    expect(analyzeTimelineForFastConcat([videoTrack([clip({ keyframes: [{ id: 'k' } as never] })])]).eligible).toBe(false);
    expect(analyzeTimelineForFastConcat([videoTrack([clip({ src: 'https://x/v.mp4' })])]).eligible).toBe(false);
  });

  it('隐藏轨不参与判定；空时间轴不合格', () => {
    const tracks = [
      videoTrack([clip()]),
      { id: 't4', type: 'text', hidden: true, clips: [clip({ type: MediaType.TEXT })], order: 1 } as Track,
    ];
    expect(analyzeTimelineForFastConcat(tracks).eligible).toBe(true);
    expect(analyzeTimelineForFastConcat([]).eligible).toBe(false);
  });
});

describe('detectTimelineGaps', () => {
  it('无空缺：clips 覆盖完整 [0, duration]', () => {
    const tracks = [videoTrack([
      clip({ start: 0, duration: 5 }),
      clip({ start: 5, duration: 5 }),
    ])];
    expect(detectTimelineGaps(tracks, 10)).toEqual([]);
  });

  it('中间空缺：返回空隙区间', () => {
    const tracks = [videoTrack([
      clip({ start: 0, duration: 3 }),
      clip({ start: 5, duration: 5 }),
    ])];
    const gaps = detectTimelineGaps(tracks, 12);
    expect(gaps).toContainEqual({ start: 3, end: 5 });
    expect(gaps).toContainEqual({ start: 10, end: 12 });
  });

  it('主轨无视频：整段空缺', () => {
    expect(detectTimelineGaps([], 10)).toEqual([{ start: 0, end: 10 }]);
  });
});
