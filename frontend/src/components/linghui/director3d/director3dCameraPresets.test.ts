import { describe, expect, it } from 'vitest';
import type { LinghuiDirector3DCamera } from '../../../types/linghui';
import {
  DIRECTOR3D_CAMERA_PRESETS,
  DIRECTOR3D_CAMERA_PRESET_CATEGORY_LABELS,
  groupDirector3DCameraPresets,
} from './director3dScene';

function baseCamera(): LinghuiDirector3DCamera {
  return {
    position: [0, 1.55, 4.5],
    target: [0, 1.6, 0],
    fov: 35,
    roll: 0,
    aspectRatio: '16:9',
  };
}

describe('Director3DCameraPresets', () => {
  it('数量 ≥ 30 个，覆盖 4 个分类', () => {
    expect(DIRECTOR3D_CAMERA_PRESETS.length).toBeGreaterThanOrEqual(30);
    const cats = new Set(DIRECTOR3D_CAMERA_PRESETS.map(p => p.category));
    expect(cats.has('shot-size')).toBe(true);
    expect(cats.has('angle')).toBe(true);
    expect(cats.has('lens')).toBe(true);
    expect(cats.has('classic')).toBe(true);
    expect(Object.keys(DIRECTOR3D_CAMERA_PRESET_CATEGORY_LABELS).sort()).toEqual(['angle', 'classic', 'lens', 'shot-size']);
  });

  it('每个预设有 id / english / apply / category，id 全局唯一', () => {
    const ids = new Set<string>();
    for (const preset of DIRECTOR3D_CAMERA_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.english).toBeTruthy();
      expect(typeof preset.apply).toBe('function');
      expect(ids.has(preset.id)).toBe(false);
      ids.add(preset.id);
    }
  });

  it('groupDirector3DCameraPresets 把预设按 category 分组', () => {
    const groups = groupDirector3DCameraPresets();
    expect(groups['shot-size'].length).toBeGreaterThanOrEqual(7);
    expect(groups.angle.length).toBeGreaterThanOrEqual(6);
    expect(groups.lens.length).toBe(5);
    expect(groups.classic.length).toBeGreaterThanOrEqual(8);
  });

  it('焦段预设只改 FOV，不动位置 / 目标', () => {
    const cam = baseCamera();
    const lens85 = DIRECTOR3D_CAMERA_PRESETS.find(p => p.id === 'lens/85mm')!;
    const next = lens85.apply(cam);
    expect(next.position).toEqual(cam.position);
    expect(next.target).toEqual(cam.target);
    expect(next.fov).toBe(24);
  });

  it('景别中景：相机移到 target 前方 2.2m，target Y 降到 1.4', () => {
    const cam = baseCamera();
    const ms = DIRECTOR3D_CAMERA_PRESETS.find(p => p.id === 'shot-size/ms')!;
    const next = ms.apply(cam);
    // target 不变 (0, ..., 0)，相机沿正 Z 方向退到 2.2m
    expect(next.target[0]).toBeCloseTo(0, 3);
    expect(next.target[1]).toBeCloseTo(1.4, 3);
    expect(next.target[2]).toBeCloseTo(0, 3);
    const dx = next.position[0] - next.target[0];
    const dz = next.position[2] - next.target[2];
    const distance = Math.sqrt(dx * dx + dz * dz);
    expect(distance).toBeCloseTo(2.2, 2);
  });

  it('角度低角度仰拍：眼高降到 0.6，target Y 抬到 1.6（仰拍效果）', () => {
    const cam = baseCamera();
    const low = DIRECTOR3D_CAMERA_PRESETS.find(p => p.id === 'angle/low')!;
    const next = low.apply(cam);
    expect(next.position[1]).toBeCloseTo(0.6, 3);
    expect(next.target[1]).toBeCloseTo(1.6, 3);
  });

  it('荷兰角：仅改 roll，其余字段不动', () => {
    const cam = baseCamera();
    const dutch = DIRECTOR3D_CAMERA_PRESETS.find(p => p.id === 'angle/dutch')!;
    const next = dutch.apply(cam);
    expect(next.roll).toBe(8);
    expect(next.position).toEqual(cam.position);
    expect(next.target).toEqual(cam.target);
    expect(next.fov).toBe(cam.fov);
  });

  it('OTS 左/右：相机沿垂直视线方向偏移，距离相同方向相反', () => {
    const cam = baseCamera();
    const otsLeft = DIRECTOR3D_CAMERA_PRESETS.find(p => p.id === 'classic/ots-left')!;
    const otsRight = DIRECTOR3D_CAMERA_PRESETS.find(p => p.id === 'classic/ots-right')!;
    const left = otsLeft.apply(cam);
    const right = otsRight.apply(cam);
    // 左右偏移：X 镜像
    expect(left.position[0]).toBeCloseTo(-right.position[0], 3);
  });

  it('Dolly In 推近：当前距离 × 0.7', () => {
    const cam = baseCamera(); // 距离 4.5
    const dollyIn = DIRECTOR3D_CAMERA_PRESETS.find(p => p.id === 'classic/dolly-in')!;
    const next = dollyIn.apply(cam);
    const dx = next.position[0] - next.target[0];
    const dz = next.position[2] - next.target[2];
    expect(Math.sqrt(dx * dx + dz * dz)).toBeCloseTo(4.5 * 0.7, 2);
  });

  it('鸟瞰：机位抬到 7m，target Y 降到 0（俯视全场）', () => {
    const cam = baseCamera();
    const bird = DIRECTOR3D_CAMERA_PRESETS.find(p => p.id === 'angle/bird-eye')!;
    const next = bird.apply(cam);
    expect(next.position[1]).toBeCloseTo(7, 3);
    expect(next.target[1]).toBeCloseTo(0, 3);
  });

  it('预设可叠加：先选景别再选焦段，互不破坏对方语义', () => {
    const cam = baseCamera();
    const ms = DIRECTOR3D_CAMERA_PRESETS.find(p => p.id === 'shot-size/ms')!;
    const lens85 = DIRECTOR3D_CAMERA_PRESETS.find(p => p.id === 'lens/85mm')!;
    const after = lens85.apply(ms.apply(cam));
    // 景别决定距离/target Y，焦段决定 FOV
    const dist = Math.hypot(after.position[0] - after.target[0], after.position[2] - after.target[2]);
    expect(dist).toBeCloseTo(2.2, 2);
    expect(after.fov).toBe(24);
  });
});
