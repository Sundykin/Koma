import { describe, expect, it } from 'vitest';
import {
  DIRECTOR3D_RIG_PRESET_OPTIONS,
  NEUTRAL_RIG,
  RIG_PRESETS,
  describeRigForPrompt,
  lerpRig,
  resolveActorRig,
} from './director3dRig';

describe('director3dRig 骨骼绑定', () => {
  describe('RIG_PRESETS 基础 6 个预置', () => {
    it('idle / walk / run / sit / wave / point 都齐全且关节数量正确', () => {
      const expectedKeys: Array<keyof typeof RIG_PRESETS> = ['idle', 'walk', 'run', 'sit', 'wave', 'point'];
      for (const key of expectedKeys) {
        const rig = RIG_PRESETS[key];
        expect(rig).toBeDefined();
        // 每个 rig 都应有 10 个关节
        expect(Object.keys(rig)).toHaveLength(10);
      }
    });

    it('run 比 walk 的膝盖弯曲更深、躯干更前倾', () => {
      // run 的躯干 spine.x 比 walk 更负（更前倾）
      expect(RIG_PRESETS.run.spine[0]).toBeLessThan(RIG_PRESETS.walk.spine[0]);
      // run 的膝盖比 walk 弯曲更多（leftKnee.x 更负）
      expect(RIG_PRESETS.run.leftKnee[0]).toBeLessThan(RIG_PRESETS.walk.leftKnee[0]);
    });

    it('wave 右手抬起：rightShoulder.x 远小于 0', () => {
      expect(RIG_PRESETS.wave.rightShoulder[0]).toBeLessThan(-2);
    });
  });

  describe('DIRECTOR3D_RIG_PRESET_OPTIONS', () => {
    it('暴露 13 个动作（基础 6 + 扩展 7）', () => {
      expect(DIRECTOR3D_RIG_PRESET_OPTIONS).toHaveLength(13);
    });

    it('基础 6 个有 posePreset 字段，扩展 7 个没有', () => {
      const withPose = DIRECTOR3D_RIG_PRESET_OPTIONS.filter(o => o.posePreset);
      const withoutPose = DIRECTOR3D_RIG_PRESET_OPTIONS.filter(o => !o.posePreset);
      expect(withPose).toHaveLength(6);
      expect(withoutPose).toHaveLength(7);
    });

    it('扩展动作 aim / punch / crouch / cheer / prone / turnBack / ride 都在', () => {
      const keys = DIRECTOR3D_RIG_PRESET_OPTIONS.map(o => o.key);
      for (const expected of ['aim', 'punch', 'crouch', 'cheer', 'prone', 'turnBack', 'ride']) {
        expect(keys).toContain(expected);
      }
    });
  });

  describe('resolveActorRig', () => {
    it('rig 存在时直接返回 rig（不查 preset）', () => {
      const custom = { ...NEUTRAL_RIG, leftElbow: [-1.234, 0, 0] as [number, number, number] };
      expect(resolveActorRig(custom, 'idle')).toBe(custom);
    });

    it('rig 缺失时回退 RIG_PRESETS[posePreset]', () => {
      expect(resolveActorRig(undefined, 'run')).toBe(RIG_PRESETS.run);
    });

    it('rig 缺失且 posePreset 无效时回退 idle', () => {
      // 强转一个不存在的 pose 模拟脏数据
      const result = resolveActorRig(undefined, 'unknown' as never);
      expect(result).toBe(RIG_PRESETS.idle);
    });
  });

  describe('lerpRig 关节级线性插值', () => {
    it('t=0 取 start，t=1 取 end', () => {
      const a = RIG_PRESETS.idle;
      const b = RIG_PRESETS.run;
      expect(lerpRig(a, b, 0)).toBe(a);
      expect(lerpRig(a, b, 1)).toBe(b);
    });

    it('t=0.5 时每个关节都是 (a+b)/2', () => {
      const a = RIG_PRESETS.idle;
      const b = RIG_PRESETS.run;
      const mid = lerpRig(a, b, 0.5);
      // 抽样 leftKnee 检查
      expect(mid.leftKnee[0]).toBeCloseTo((a.leftKnee[0] + b.leftKnee[0]) * 0.5, 4);
      expect(mid.spine[0]).toBeCloseTo((a.spine[0] + b.spine[0]) * 0.5, 4);
    });

    it('单边缺 rig 时按 NEUTRAL_RIG 补齐再插值（不抛错）', () => {
      const mid = lerpRig(undefined, RIG_PRESETS.wave, 0.5);
      // 应是 NEUTRAL 与 wave 的中点
      expect(mid.rightShoulder[0]).toBeCloseTo(RIG_PRESETS.wave.rightShoulder[0] * 0.5, 4);
    });
  });

  describe('describeRigForPrompt', () => {
    it('idle 几乎没有变化时返回空串（不污染 prompt）', () => {
      expect(describeRigForPrompt(RIG_PRESETS.idle)).toBe('');
    });

    it('wave 时检测到 arm raised overhead', () => {
      const description = describeRigForPrompt(RIG_PRESETS.wave);
      expect(description).toMatch(/arm raised overhead/);
    });

    it('run 时检测到 leaning forward + mid-stride', () => {
      const description = describeRigForPrompt(RIG_PRESETS.run);
      expect(description).toMatch(/leaning forward/);
      expect(description).toMatch(/mid-stride|knee/);
    });
  });
});
