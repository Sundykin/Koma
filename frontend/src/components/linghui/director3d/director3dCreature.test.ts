import { describe, expect, it } from 'vitest';
import {
  CREATURE_ACTION_RIGS,
  CREATURE_NEUTRAL_RIG,
  CREATURE_SPECIES_LIBRARY,
  findCreatureSpecies,
  lerpCreatureRig,
  resolveCreatureRig,
} from './director3dCreature';

describe('director3dCreature 生物系统', () => {
  describe('CREATURE_SPECIES_LIBRARY', () => {
    it('暴露 6 个现实动物 + 6 个玄幻生物 共 12 个 species', () => {
      expect(CREATURE_SPECIES_LIBRARY).toHaveLength(12);
      const kinds = CREATURE_SPECIES_LIBRARY.map(s => s.kind);
      // 现实动物
      for (const expected of ['lion', 'wolf', 'tiger', 'bear', 'horse', 'eagle']) {
        expect(kinds).toContain(expected);
      }
      // 玄幻生物
      for (const expected of ['dragon', 'phoenix', 'qilin', 'fox', 'deer', 'crane']) {
        expect(kinds).toContain(expected);
      }
    });

    it('每个 species 都有 promptHint 英文描述（让 AI 看懂）', () => {
      for (const spec of CREATURE_SPECIES_LIBRARY) {
        expect(spec.promptHint.length).toBeGreaterThan(0);
        expect(spec.english.length).toBeGreaterThan(0);
      }
    });

    it('form 分布合理：avian = eagle/phoenix/crane (3 个)，serpent-dragon = dragon (1 个)，其余 quadruped (8 个)', () => {
      const aviaSpecies = CREATURE_SPECIES_LIBRARY.filter(s => s.form === 'avian').map(s => s.kind);
      expect(aviaSpecies.sort()).toEqual(['crane', 'eagle', 'phoenix']);
      const dragonSpecies = CREATURE_SPECIES_LIBRARY.filter(s => s.form === 'serpent-dragon');
      expect(dragonSpecies).toHaveLength(1);
      expect(dragonSpecies[0].kind).toBe('dragon');
      const quadrupedSpecies = CREATURE_SPECIES_LIBRARY.filter(s => s.form === 'quadruped');
      expect(quadrupedSpecies).toHaveLength(8);
    });
  });

  describe('findCreatureSpecies', () => {
    it('已知 kind 返回对应 spec', () => {
      expect(findCreatureSpecies('lion').kind).toBe('lion');
      expect(findCreatureSpecies('dragon').kind).toBe('dragon');
    });

    it('未知 kind 兜底到第一个（lion）', () => {
      expect(findCreatureSpecies(undefined).kind).toBe('lion');
    });
  });

  describe('CREATURE_ACTION_RIGS 动作预置', () => {
    it('包含 6 个动作（idle/walk/run/pounce/fly/roar）', () => {
      const actions = Object.keys(CREATURE_ACTION_RIGS);
      expect(actions.sort()).toEqual(['fly', 'idle', 'pounce', 'roar', 'run', 'walk']);
    });

    it('run 比 walk 躯干更前倾（spine.x 更负）+ 腿摆动更大', () => {
      expect(CREATURE_ACTION_RIGS.run.spine[0]).toBeLessThan(CREATURE_ACTION_RIGS.walk.spine[0]);
      expect(Math.abs(CREATURE_ACTION_RIGS.run.frontLeftLeg[0]))
        .toBeGreaterThan(Math.abs(CREATURE_ACTION_RIGS.walk.frontLeftLeg[0]));
    });

    it('fly 时翼根（frontLeftLeg.z）大幅外摆', () => {
      // fly 的 frontLeftLeg.z 应该是正值大，frontRightLeg.z 是负值大（翅膀对称展开）
      expect(CREATURE_ACTION_RIGS.fly.frontLeftLeg[2]).toBeGreaterThan(0.5);
      expect(CREATURE_ACTION_RIGS.fly.frontRightLeg[2]).toBeLessThan(-0.5);
    });

    it('pounce 时躯干俯冲（spine.x 大负）+ 后腿后蹬', () => {
      expect(CREATURE_ACTION_RIGS.pounce.spine[0]).toBeLessThan(-0.4);
      expect(CREATURE_ACTION_RIGS.pounce.rearLeftLeg[0]).toBeLessThan(0);
    });
  });

  describe('resolveCreatureRig', () => {
    it('rig 存在时直接返回', () => {
      const custom = { ...CREATURE_NEUTRAL_RIG, tail: [1, 0, 0] as [number, number, number] };
      expect(resolveCreatureRig(custom, 'idle')).toBe(custom);
    });

    it('rig 缺失时回退 CREATURE_ACTION_RIGS[action]', () => {
      expect(resolveCreatureRig(undefined, 'run')).toBe(CREATURE_ACTION_RIGS.run);
    });
  });

  describe('lerpCreatureRig 关节级 LERP', () => {
    it('t=0 取 start，t=1 取 end', () => {
      const a = CREATURE_ACTION_RIGS.idle;
      const b = CREATURE_ACTION_RIGS.run;
      expect(lerpCreatureRig(a, b, 0)).toBe(a);
      expect(lerpCreatureRig(a, b, 1)).toBe(b);
    });

    it('t=0.5 时每个关节是中点', () => {
      const a = CREATURE_ACTION_RIGS.idle;
      const b = CREATURE_ACTION_RIGS.run;
      const mid = lerpCreatureRig(a, b, 0.5);
      expect(mid.spine[0]).toBeCloseTo((a.spine[0] + b.spine[0]) * 0.5, 4);
      expect(mid.frontLeftLeg[0]).toBeCloseTo((a.frontLeftLeg[0] + b.frontLeftLeg[0]) * 0.5, 4);
    });

    it('单边 undefined 时按 NEUTRAL_RIG 补齐再插值（不抛错）', () => {
      const mid = lerpCreatureRig(undefined, CREATURE_ACTION_RIGS.fly, 0.5);
      expect(mid.frontLeftLeg[2]).toBeCloseTo(CREATURE_ACTION_RIGS.fly.frontLeftLeg[2] * 0.5, 4);
    });
  });
});
