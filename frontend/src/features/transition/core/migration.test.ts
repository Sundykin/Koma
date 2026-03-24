import { describe, it, expect } from 'vitest';
import { migrateTimelineData, CURRENT_TIMELINE_VERSION } from './migration';

// ========== 最小 clip 工厂 ==========
function makeClip(id: string, start: number, duration: number, extra?: Record<string, unknown>) {
  return {
    id,
    assetId: `asset-${id}`,
    trackId: 'track-1',
    start,
    duration,
    offset: 0,
    name: id,
    type: 'VIDEO',
    src: `${id}.mp4`,
    x: 0, y: 0, scale: 1, rotation: 0, opacity: 1,
    ...extra,
  };
}

// ========== v0 fixtures ==========
const v0WithLegacyTransition = {
  // 无 version 字段 → v0
  tracks: [
    {
      id: 'track-1',
      type: 'video',
      order: 0,
      isMainTrack: true,
      clips: [
        makeClip('clip-a', 0, 5),
        makeClip('clip-b', 5, 5, { transition: { effectId: 'fade', duration: 1 } }),
      ],
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

const v0Explicit = {
  version: 0,
  tracks: [
    {
      id: 'track-1',
      type: 'video',
      order: 0,
      isMainTrack: true,
      clips: [
        makeClip('clip-a', 0, 5),
        makeClip('clip-b', 5, 5, { transition: { effectId: 'fade', duration: 2 } }),
      ],
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

// ========== v1 fixtures ==========
const v1Normal = {
  version: 1,
  tracks: [
    {
      id: 'track-1',
      type: 'video',
      order: 0,
      isMainTrack: true,
      clips: [
        makeClip('clip-a', 0, 5),
        makeClip('clip-b', 5, 5),
      ],
      transitions: [
        { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 1 },
      ],
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

// ========== 损坏数据 fixtures ==========
const corruptedBadClipId = {
  version: 1,
  tracks: [
    {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [makeClip('clip-a', 0, 5), makeClip('clip-b', 5, 5)],
      transitions: [
        { id: 't1', fromClipId: 'nonexistent', toClipId: 'clip-b', type: 'fade', duration: 1 },
      ],
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

const corruptedZeroDuration = {
  version: 1,
  tracks: [
    {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [makeClip('clip-a', 0, 5), makeClip('clip-b', 5, 5)],
      transitions: [
        { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 0 },
      ],
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

const corruptedNegativeDuration = {
  version: 0,
  tracks: [
    {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [
        makeClip('clip-a', 0, 5),
        makeClip('clip-b', 5, 5, { transition: { effectId: 'fade', duration: -1 } }),
      ],
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

// ========== Tests ==========
describe('migrateTimelineData', () => {
  describe('版本检测', () => {
    it('无 version 字段按 v0 处理', () => {
      const result = migrateTimelineData(v0WithLegacyTransition as any);
      expect(result.version).toBe(CURRENT_TIMELINE_VERSION);
    });

    it('version=0 按 v0 处理', () => {
      const result = migrateTimelineData(v0Explicit as any);
      expect(result.version).toBe(CURRENT_TIMELINE_VERSION);
    });

    it('version=1 原样通过', () => {
      const result = migrateTimelineData(v1Normal as any);
      expect(result.version).toBe(1);
    });

    it('保留 createdAt / updatedAt', () => {
      const result = migrateTimelineData(v0WithLegacyTransition as any);
      expect(result.createdAt).toBe(1000);
      expect(result.updatedAt).toBe(2000);
    });

    it('缺少 createdAt / updatedAt 时用 Date.now() 兜底', () => {
      const result = migrateTimelineData({ tracks: [] } as any);
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThan(0);
    });

    it('未知未来版本会抛错，避免伪装成当前版本', () => {
      expect(() => migrateTimelineData({ version: 99, tracks: [] } as any)).toThrow(
        'Unsupported timeline version: 99'
      );
    });
  });

  describe('v0 → v1 迁移', () => {
    it('Clip.transition 转换为 Track.transitions[]', () => {
      const result = migrateTimelineData(v0WithLegacyTransition as any);
      const track = result.tracks[0];
      expect(track.transitions).toBeDefined();
      expect(track.transitions!.length).toBe(1);
      expect(track.transitions![0].fromClipId).toBe('clip-a');
      expect(track.transitions![0].toClipId).toBe('clip-b');
      expect(track.transitions![0].duration).toBe(1);
      expect(track.transitions![0].type).toBe('fade');
    });

    it('迁移后 clip 上的 legacy transition 字段被清除', () => {
      const result = migrateTimelineData(v0WithLegacyTransition as any);
      const clips = result.tracks[0].clips;
      clips.forEach((clip) => {
        expect((clip as any).transition).toBeUndefined();
      });
    });

    it('v0 负数 duration 的 legacy transition 被过滤', () => {
      const result = migrateTimelineData(corruptedNegativeDuration as any);
      const track = result.tracks[0];
      expect(track.transitions?.length ?? 0).toBe(0);
    });
  });

  describe('v1 数据校验', () => {
    it('v1 正常数据保持 transitions 不变', () => {
      const result = migrateTimelineData(v1Normal as any);
      const track = result.tracks[0];
      expect(track.transitions!.length).toBe(1);
      expect(track.transitions![0].duration).toBe(1);
    });
  });

  describe('损坏数据修复', () => {
    it('fromClipId 不存在的 transition 被过滤（v1 加载边界直接净化）', () => {
      const result = migrateTimelineData(corruptedBadClipId as any);
      expect(result.tracks[0].transitions?.length ?? 0).toBe(0);
    });

    it('duration=0 的 transition 在 v1 加载边界被过滤', () => {
      const result = migrateTimelineData(corruptedZeroDuration as any);
      expect(result.tracks[0].transitions?.length ?? 0).toBe(0);
    });
  });

  describe('边界情况', () => {
    it('空 tracks', () => {
      const result = migrateTimelineData({ version: 0, tracks: [], createdAt: 1, updatedAt: 2 } as any);
      expect(result.tracks).toEqual([]);
      expect(result.version).toBe(CURRENT_TIMELINE_VERSION);
    });

    it('缺少 tracks 字段', () => {
      const result = migrateTimelineData({ version: 0 } as any);
      expect(result.tracks).toEqual([]);
    });

    it('完全空对象', () => {
      const result = migrateTimelineData({} as any);
      expect(result.version).toBe(CURRENT_TIMELINE_VERSION);
      expect(result.tracks).toEqual([]);
    });
  });
});
