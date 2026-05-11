import { describe, expect, it } from 'vitest';
import type { LinghuiDirector3DScene } from '../../../types/linghui';
import {
  captureSceneAsKeyframe,
  createDefaultDirector3DScene,
  createDefaultDirector3DTimeline,
  interpolateSceneAt,
} from './director3dScene';

function withTimeline(scene: LinghuiDirector3DScene): LinghuiDirector3DScene {
  return {
    ...scene,
    timeline: createDefaultDirector3DTimeline(),
  };
}

describe('Timeline interpolateSceneAt', () => {
  it('timeline 为空时返回原 scene（静态镜头）', () => {
    const scene = createDefaultDirector3DScene();
    const result = interpolateSceneAt(scene, 1.0);
    expect(result).toBe(scene);
  });

  it('time 在第一个 keyframe 之前 → 返回首帧快照', () => {
    const scene = withTimeline(createDefaultDirector3DScene());
    const kf1 = captureSceneAsKeyframe(scene, 1.0);
    const kf2 = captureSceneAsKeyframe(scene, 3.0);
    // 把 actor 0 在两个 keyframe 间挪动
    kf2.actors[0].position = [10, 0, 0];
    scene.timeline!.keyframes = [kf1, kf2];

    const result = interpolateSceneAt(scene, 0.0);
    expect(result.actors[0].position[0]).toBeCloseTo(kf1.actors[0].position[0], 3);
  });

  it('time 在最后一个 keyframe 之后 → 返回末帧快照', () => {
    const scene = withTimeline(createDefaultDirector3DScene());
    const kf1 = captureSceneAsKeyframe(scene, 1.0);
    const kf2 = captureSceneAsKeyframe(scene, 3.0);
    kf2.actors[0].position = [10, 0, 0];
    scene.timeline!.keyframes = [kf1, kf2];

    const result = interpolateSceneAt(scene, 99.0);
    expect(result.actors[0].position[0]).toBeCloseTo(10, 3);
  });

  it('中点 t=2.0（kf1=1.0, kf2=3.0）：linear 缓动下 actor x 应为 5', () => {
    const scene = withTimeline(createDefaultDirector3DScene());
    scene.timeline!.easing = 'linear';
    const kf1 = captureSceneAsKeyframe(scene, 1.0);
    const kf2 = captureSceneAsKeyframe(scene, 3.0);
    kf1.actors[0].position = [0, 0, 0];
    kf2.actors[0].position = [10, 0, 0];
    scene.timeline!.keyframes = [kf1, kf2];

    const result = interpolateSceneAt(scene, 2.0);
    expect(result.actors[0].position[0]).toBeCloseTo(5, 3);
  });

  it('ease-in-out 中点 alpha=0.5 通过 smoothstep 后仍是 0.5', () => {
    const scene = withTimeline(createDefaultDirector3DScene());
    scene.timeline!.easing = 'ease-in-out';
    const kf1 = captureSceneAsKeyframe(scene, 0);
    const kf2 = captureSceneAsKeyframe(scene, 2);
    kf1.actors[0].position = [0, 0, 0];
    kf2.actors[0].position = [10, 0, 0];
    scene.timeline!.keyframes = [kf1, kf2];

    const result = interpolateSceneAt(scene, 1.0);
    // smoothstep(0.5) = 0.5，所以中点仍是 5
    expect(result.actors[0].position[0]).toBeCloseTo(5, 3);
  });

  it('ease-in-out t=0.25 时 smoothstep ≈ 0.156，actor 位置非线性', () => {
    const scene = withTimeline(createDefaultDirector3DScene());
    scene.timeline!.easing = 'ease-in-out';
    const kf1 = captureSceneAsKeyframe(scene, 0);
    const kf2 = captureSceneAsKeyframe(scene, 4);
    kf1.actors[0].position = [0, 0, 0];
    kf2.actors[0].position = [10, 0, 0];
    scene.timeline!.keyframes = [kf1, kf2];

    // t=1（占 1/4 时长）→ alpha=0.25 → smoothstep(0.25) = 0.25*0.25*(3-0.5) = 0.15625
    const result = interpolateSceneAt(scene, 1.0);
    expect(result.actors[0].position[0]).toBeCloseTo(1.5625, 2);
  });

  it('相机位置 / target / fov 均插值', () => {
    const scene = withTimeline(createDefaultDirector3DScene());
    scene.timeline!.easing = 'linear';
    const kf1 = captureSceneAsKeyframe(scene, 0);
    const kf2 = captureSceneAsKeyframe(scene, 2);
    kf1.camera = { ...kf1.camera, position: [0, 1, 0], target: [0, 1, 0], fov: 20 };
    kf2.camera = { ...kf2.camera, position: [10, 3, 10], target: [10, 3, 10], fov: 60 };
    scene.timeline!.keyframes = [kf1, kf2];

    const result = interpolateSceneAt(scene, 1.0);
    expect(result.camera.position[0]).toBeCloseTo(5, 3);
    expect(result.camera.position[1]).toBeCloseTo(2, 3);
    expect(result.camera.target[2]).toBeCloseTo(5, 3);
    expect(result.camera.fov).toBeCloseTo(40, 1);
  });

  it('rotationY 走短弧：从 350°（≈-π/18）插到 10°（π/18）应该经过 0° 而非绕 340°', () => {
    const scene = withTimeline(createDefaultDirector3DScene());
    scene.timeline!.easing = 'linear';
    const kf1 = captureSceneAsKeyframe(scene, 0);
    const kf2 = captureSceneAsKeyframe(scene, 2);
    kf1.actors[0].rotationY = (350 * Math.PI) / 180;
    kf2.actors[0].rotationY = (10 * Math.PI) / 180;
    scene.timeline!.keyframes = [kf1, kf2];

    const result = interpolateSceneAt(scene, 1.0);
    // 中点应该接近 0°（短弧路径）而不是 180°（长弧）
    const normalizedDeg = ((result.actors[0].rotationY * 180) / Math.PI + 360) % 360;
    // 0° 或 360° 都视为合法
    const distFromZero = Math.min(normalizedDeg, 360 - normalizedDeg);
    expect(distFromZero).toBeLessThan(10);
  });

  it('actor 仅在 k2 中出现 → 全程沿用 k2 的值（不插值）', () => {
    const scene = withTimeline(createDefaultDirector3DScene());
    scene.timeline!.easing = 'linear';
    const kf1 = captureSceneAsKeyframe(scene, 0);
    const kf2 = captureSceneAsKeyframe(scene, 2);
    // 把 kf1 的某个 actor 移除
    kf1.actors = kf1.actors.slice(1);
    kf2.actors[0].position = [10, 0, 0];
    scene.timeline!.keyframes = [kf1, kf2];

    const result = interpolateSceneAt(scene, 1.0);
    // 第一个 actor 在 kf1 不存在 → 沿用 kf2 的位置 (10, 0, 0)
    expect(result.actors[0].position[0]).toBeCloseTo(10, 3);
  });

  it('captureSceneAsKeyframe 深克隆 position / target / pose / color / formation', () => {
    const scene = createDefaultDirector3DScene();
    scene.actors[0].posePreset = 'wave';
    scene.actors[0].color = 'crimson';
    const kf = captureSceneAsKeyframe(scene, 1.5, '开场');
    scene.actors[0].position[0] = 999;
    scene.actors[0].posePreset = 'idle';
    scene.actors[0].color = 'navy';
    scene.camera.fov = 99;

    expect(kf.actors[0].position[0]).not.toBe(999);
    expect(kf.actors[0].posePreset).toBe('wave');
    expect(kf.actors[0].color).toBe('crimson');
    expect(kf.camera.fov).not.toBe(99);
    expect(kf.label).toBe('开场');
    expect(kf.time).toBeCloseTo(1.5, 3);
  });

  it('插值 posePreset：alpha<0.5 用 start，alpha>=0.5 切到 end（离散切换）', () => {
    const scene = withTimeline(createDefaultDirector3DScene());
    scene.timeline!.easing = 'linear';
    const kf1 = captureSceneAsKeyframe(scene, 0);
    const kf2 = captureSceneAsKeyframe(scene, 2);
    kf1.actors[0].posePreset = 'idle';
    kf2.actors[0].posePreset = 'run';
    scene.timeline!.keyframes = [kf1, kf2];

    expect(interpolateSceneAt(scene, 0.5).actors[0].posePreset).toBe('idle');
    expect(interpolateSceneAt(scene, 0.95).actors[0].posePreset).toBe('idle');
    expect(interpolateSceneAt(scene, 1.0).actors[0].posePreset).toBe('run');
    expect(interpolateSceneAt(scene, 1.8).actors[0].posePreset).toBe('run');
  });

  it('插值 color：在 alpha 0.5 处突变（不做 RGB 插值，避免诡异中间色）', () => {
    const scene = withTimeline(createDefaultDirector3DScene());
    scene.timeline!.easing = 'linear';
    const kf1 = captureSceneAsKeyframe(scene, 0);
    const kf2 = captureSceneAsKeyframe(scene, 2);
    kf1.actors[0].color = 'crimson';
    kf2.actors[0].color = 'royalblue';
    scene.timeline!.keyframes = [kf1, kf2];

    expect(interpolateSceneAt(scene, 0.4).actors[0].color).toBe('crimson');
    expect(interpolateSceneAt(scene, 1.2).actors[0].color).toBe('royalblue');
  });

  it('插值 scale：连续线性变化（不是离散）', () => {
    const scene = withTimeline(createDefaultDirector3DScene());
    scene.timeline!.easing = 'linear';
    const kf1 = captureSceneAsKeyframe(scene, 0);
    const kf2 = captureSceneAsKeyframe(scene, 2);
    kf1.actors[0].scale = 1.0;
    kf2.actors[0].scale = 2.0;
    scene.timeline!.keyframes = [kf1, kf2];

    expect(interpolateSceneAt(scene, 1.0).actors[0].scale).toBeCloseTo(1.5, 3);
    expect(interpolateSceneAt(scene, 0.5).actors[0].scale).toBeCloseTo(1.25, 3);
  });

  it('方阵插值：rows/cols/memberFacing 离散切换，spacing 线性', () => {
    const scene = withTimeline(createDefaultDirector3DScene());
    scene.timeline!.easing = 'linear';
    // 把 actor[0] 改成 formation 类型
    scene.actors[0] = {
      ...scene.actors[0],
      type: 'formation',
      formation: { rows: 2, cols: 3, spacing: 1.0, memberFacing: 'forward' },
    };
    const kf1 = captureSceneAsKeyframe(scene, 0);
    const kf2 = captureSceneAsKeyframe(scene, 2);
    kf1.actors[0].formation = { rows: 2, cols: 3, spacing: 1.0, memberFacing: 'forward' };
    kf2.actors[0].formation = { rows: 4, cols: 6, spacing: 1.6, memberFacing: 'inward' };
    scene.timeline!.keyframes = [kf1, kf2];

    const midEarly = interpolateSceneAt(scene, 0.5);
    expect(midEarly.actors[0].formation!.rows).toBe(2); // 离散：还没切
    expect(midEarly.actors[0].formation!.cols).toBe(3);
    expect(midEarly.actors[0].formation!.memberFacing).toBe('forward');
    // spacing 线性：t=0.5 → alpha=0.25 → 1.0 + 0.25*0.6 = 1.15
    expect(midEarly.actors[0].formation!.spacing).toBeCloseTo(1.15, 3);

    const midLate = interpolateSceneAt(scene, 1.4);
    expect(midLate.actors[0].formation!.rows).toBe(4); // 已经切了
    expect(midLate.actors[0].formation!.cols).toBe(6);
    expect(midLate.actors[0].formation!.memberFacing).toBe('inward');
    expect(midLate.actors[0].formation!.spacing).toBeCloseTo(1.42, 2);
  });
});
