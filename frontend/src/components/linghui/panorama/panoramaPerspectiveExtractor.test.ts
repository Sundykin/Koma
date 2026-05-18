/**
 * 测试聚焦在"角度预设的正确性"（不依赖 canvas / DOM）：
 *  - 6 视角的 yaw / pitch / fov 是不是 cube faces 标准角度
 *  - 8 等分的间隔是不是恰好 45°
 *
 * 真实的像素采样依赖 canvas getImageData，需要 jsdom + node-canvas 才能跑，
 * 故归到端到端 / 集成层面验证。
 */
import { describe, expect, it } from 'vitest';
import {
  PANORAMA_PERSPECTIVE_EIGHT_DIRECTIONS,
  PANORAMA_PERSPECTIVE_SIX_FACES,
} from './panoramaPerspectiveExtractor';
import {
  getPanoramaDetailDirectionLabel,
  getPanoramaRing12NodeLabel,
  getPanoramaScreenshotGroupName,
  PANORAMA_RING4_NODE_LABELS,
} from './panoramaDetailCrop';

describe('panoramaPerspectiveExtractor 角度预设', () => {
  describe('PANORAMA_PERSPECTIVE_SIX_FACES (cube faces)', () => {
    it('包含 6 张方形面：前/右/后/左/上/下', () => {
      const ids = PANORAMA_PERSPECTIVE_SIX_FACES.map(face => face.id);
      expect(ids.sort()).toEqual([
        'face-back', 'face-down', 'face-front', 'face-left', 'face-right', 'face-up',
      ]);
    });

    it('全部 fov=90°（cube faces 标准，恰好拼成完整环境）', () => {
      for (const face of PANORAMA_PERSPECTIVE_SIX_FACES) {
        expect(face.fovDeg).toBe(90);
      }
    });

    it('水平四个面 yaw 互差 π/2，pitch 都为 0', () => {
      const front = PANORAMA_PERSPECTIVE_SIX_FACES.find(f => f.id === 'face-front')!;
      const right = PANORAMA_PERSPECTIVE_SIX_FACES.find(f => f.id === 'face-right')!;
      const back = PANORAMA_PERSPECTIVE_SIX_FACES.find(f => f.id === 'face-back')!;
      const left = PANORAMA_PERSPECTIVE_SIX_FACES.find(f => f.id === 'face-left')!;
      expect(front.yaw).toBeCloseTo(0, 5);
      expect(right.yaw).toBeCloseTo(Math.PI / 2, 5);
      expect(back.yaw).toBeCloseTo(Math.PI, 5);
      expect(left.yaw).toBeCloseTo(-Math.PI / 2, 5);
      // pitch 全 0（水平面）
      for (const face of [front, right, back, left]) {
        expect(face.pitch).toBe(0);
      }
    });

    it('顶视 / 俯视的 pitch 为 ±π/2，yaw 为 0', () => {
      const up = PANORAMA_PERSPECTIVE_SIX_FACES.find(f => f.id === 'face-up')!;
      const down = PANORAMA_PERSPECTIVE_SIX_FACES.find(f => f.id === 'face-down')!;
      expect(up.pitch).toBeCloseTo(Math.PI / 2, 5);
      expect(down.pitch).toBeCloseTo(-Math.PI / 2, 5);
      expect(up.yaw).toBe(0);
      expect(down.yaw).toBe(0);
    });
  });

  describe('PANORAMA_PERSPECTIVE_EIGHT_DIRECTIONS (8 等分)', () => {
    it('包含 8 个水平角度', () => {
      expect(PANORAMA_PERSPECTIVE_EIGHT_DIRECTIONS).toHaveLength(8);
    });

    it('相邻 yaw 间隔精确 45° (π/4)', () => {
      for (let i = 1; i < PANORAMA_PERSPECTIVE_EIGHT_DIRECTIONS.length; i++) {
        const diff = PANORAMA_PERSPECTIVE_EIGHT_DIRECTIONS[i].yaw
          - PANORAMA_PERSPECTIVE_EIGHT_DIRECTIONS[i - 1].yaw;
        expect(diff).toBeCloseTo(Math.PI / 4, 5);
      }
    });

    it('全部 pitch=0（水平环绕），fov=60°（适合环绕镜头）', () => {
      for (const view of PANORAMA_PERSPECTIVE_EIGHT_DIRECTIONS) {
        expect(view.pitch).toBe(0);
        expect(view.fovDeg).toBe(60);
      }
    });

    it('id 唯一，label 是角度文字', () => {
      const ids = new Set<string>();
      for (let i = 0; i < PANORAMA_PERSPECTIVE_EIGHT_DIRECTIONS.length; i++) {
        const view = PANORAMA_PERSPECTIVE_EIGHT_DIRECTIONS[i];
        expect(ids.has(view.id)).toBe(false);
        ids.add(view.id);
        expect(view.label).toBe(`${i * 45}°`);
      }
    });
  });
});

describe('panorama detail crop LibTV labels', () => {
  it('uses LibTV ring-4 screenshot labels', () => {
    expect(PANORAMA_RING4_NODE_LABELS).toEqual([
      '全景截图-前方',
      '全景截图-左侧',
      '全景截图-后方',
      '全景截图-右侧',
    ]);
    expect(Array.from({ length: 4 }, (_, index) => getPanoramaDetailDirectionLabel(4, index)))
      .toEqual([...PANORAMA_RING4_NODE_LABELS]);
  });

  it('uses LibTV ring-12 counterclockwise labels', () => {
    expect(getPanoramaRing12NodeLabel(0)).toBe('全景截图-逆时针0°');
    expect(getPanoramaRing12NodeLabel(1)).toBe('全景截图-逆时针30°');
    expect(getPanoramaRing12NodeLabel(11)).toBe('全景截图-逆时针330°');
    expect(getPanoramaRing12NodeLabel(12)).toBe('全景截图-逆时针0°');
    expect(Array.from({ length: 12 }, (_, index) => getPanoramaDetailDirectionLabel(12, index)))
      .toHaveLength(12);
  });

  it('formats screenshot group name like LibTV', () => {
    expect(getPanoramaScreenshotGroupName(12)).toBe('全景截图组 (12 张)');
  });
});
