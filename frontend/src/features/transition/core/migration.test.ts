import { describe, it, expect } from 'vitest';
import { migrateTimelineData, CURRENT_TIMELINE_VERSION } from './migration';

// ========== 测试工具 ==========

/** 将 fixture 对象转为 migrateTimelineData 接受的 Record<string, unknown> */
function asRaw(obj: Record<string, unknown>): Record<string, unknown> {
  return obj;
}

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
const v0WithLegacyTransition = asRaw({
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
});

const v0Explicit = asRaw({
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
});

// ========== v1 fixtures ==========
const v1Normal = asRaw({
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
});

// ========== 损坏数据 fixtures ==========
const corruptedBadClipId = asRaw({
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
});

const corruptedZeroDuration = asRaw({
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
});

const corruptedNegativeDuration = asRaw({
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
});

// ========== Tests ==========
describe('migrateTimelineData', () => {
  describe('版本检测', () => {
    it('无 version 字段按 v0 处理', () => {
      const result = migrateTimelineData(v0WithLegacyTransition);
      expect(result.version).toBe(CURRENT_TIMELINE_VERSION);
    });

    it('version=0 按 v0 处理', () => {
      const result = migrateTimelineData(v0Explicit);
      expect(result.version).toBe(CURRENT_TIMELINE_VERSION);
    });

    it('version=1 原样通过', () => {
      const result = migrateTimelineData(v1Normal);
      expect(result.version).toBe(1);
    });

    it('保留 createdAt / updatedAt', () => {
      const result = migrateTimelineData(v0WithLegacyTransition);
      expect(result.createdAt).toBe(1000);
      expect(result.updatedAt).toBe(2000);
    });

    it('缺少 createdAt / updatedAt 时用 Date.now() 兜底', () => {
      const result = migrateTimelineData(asRaw({ tracks: [] }));
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThan(0);
    });

    it('未知未来版本会抛错，避免伪装成当前版本', () => {
      expect(() => migrateTimelineData(asRaw({ version: 99, tracks: [] }))).toThrow(
        'Unsupported timeline version: 99'
      );
    });

    it('非整数 version 被向下取整', () => {
      const result = migrateTimelineData(asRaw({ version: 0.9, tracks: [] }));
      expect(result.version).toBe(CURRENT_TIMELINE_VERSION);
    });

    it('负数 version 按 v0 处理', () => {
      const result = migrateTimelineData(asRaw({ version: -1, tracks: [] }));
      expect(result.version).toBe(CURRENT_TIMELINE_VERSION);
    });

    it('NaN version 按 v0 处理', () => {
      const result = migrateTimelineData(asRaw({ version: NaN, tracks: [] }));
      expect(result.version).toBe(CURRENT_TIMELINE_VERSION);
    });

    it('Infinity version 按 v0 处理', () => {
      const result = migrateTimelineData(asRaw({ version: Infinity, tracks: [] }));
      expect(result.version).toBe(CURRENT_TIMELINE_VERSION);
    });
  });

  describe('v0 → v1 迁移', () => {
    it('Clip.transition 转换为 Track.transitions[]', () => {
      const result = migrateTimelineData(v0WithLegacyTransition);
      const track = result.tracks[0];
      expect(track.transitions).toBeDefined();
      expect(track.transitions!.length).toBe(1);
      expect(track.transitions![0].fromClipId).toBe('clip-a');
      expect(track.transitions![0].toClipId).toBe('clip-b');
      expect(track.transitions![0].duration).toBe(1);
      expect(track.transitions![0].type).toBe('fade');
    });

    it('迁移后 clip 上的 legacy transition 字段被清除', () => {
      const result = migrateTimelineData(v0WithLegacyTransition);
      const clips = result.tracks[0].clips;
      clips.forEach((clip) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 验证 legacy 字段已被清除，需要跳过类型约束
        expect((clip as any).transition).toBeUndefined();
      });
    });

    it('v0 负数 duration 的 legacy transition 被过滤', () => {
      const result = migrateTimelineData(corruptedNegativeDuration);
      const track = result.tracks[0];
      expect(track.transitions?.length ?? 0).toBe(0);
    });
  });

  describe('v1 数据校验', () => {
    it('v1 正常数据保持 transitions 不变', () => {
      const result = migrateTimelineData(v1Normal);
      const track = result.tracks[0];
      expect(track.transitions!.length).toBe(1);
      expect(track.transitions![0].duration).toBe(1);
    });
  });

  describe('损坏数据修复', () => {
    it('fromClipId 不存在的 transition 被过滤（v1 加载边界直接净化）', () => {
      const result = migrateTimelineData(corruptedBadClipId);
      expect(result.tracks[0].transitions?.length ?? 0).toBe(0);
    });

    it('duration=0 的 transition 在 v1 加载边界被过滤', () => {
      const result = migrateTimelineData(corruptedZeroDuration);
      expect(result.tracks[0].transitions?.length ?? 0).toBe(0);
    });
  });

  describe('边界情况', () => {
    it('空 tracks', () => {
      const result = migrateTimelineData(asRaw({ version: 0, tracks: [], createdAt: 1, updatedAt: 2 }));
      expect(result.tracks).toEqual([]);
      expect(result.version).toBe(CURRENT_TIMELINE_VERSION);
    });

    it('缺少 tracks 字段', () => {
      const result = migrateTimelineData(asRaw({ version: 0 }));
      expect(result.tracks).toEqual([]);
    });

    it('完全空对象', () => {
      const result = migrateTimelineData(asRaw({}));
      expect(result.version).toBe(CURRENT_TIMELINE_VERSION);
      expect(result.tracks).toEqual([]);
    });
  });
});
