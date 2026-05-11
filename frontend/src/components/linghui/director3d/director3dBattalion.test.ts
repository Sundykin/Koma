import { describe, expect, it } from 'vitest';
import {
  createDirector3DBattalion,
  createDirector3DLiteSoldier,
} from './director3dScene';
import { deriveFormationFootprint, deriveFormationMembers } from './Director3DFormation';

describe('createDirector3DBattalion（整体方阵）', () => {
  it('返回一个 formation actor，不是 N 个独立小人', () => {
    const formation = createDirector3DBattalion({ rows: 3, cols: 5, spacing: 1 });
    expect(Array.isArray(formation)).toBe(false);
    expect(formation.type).toBe('formation');
    expect(formation.formation).toBeDefined();
    expect(formation.formation?.rows).toBe(3);
    expect(formation.formation?.cols).toBe(5);
  });

  it('rows/cols 自动 clamp 到 [1, 12]', () => {
    const big = createDirector3DBattalion({ rows: 100, cols: 100 });
    expect(big.formation?.rows).toBe(12);
    expect(big.formation?.cols).toBe(12);
    const small = createDirector3DBattalion({ rows: 0, cols: -3 });
    expect(small.formation?.rows).toBe(1);
    expect(small.formation?.cols).toBe(1);
  });

  it('actor.position 是方阵中心，rotationY 控制整体朝向', () => {
    const formation = createDirector3DBattalion({ rows: 3, cols: 5, spacing: 1, origin: [2, -3] });
    expect(formation.position[0]).toBeCloseTo(2, 3);
    expect(formation.position[1]).toBe(0);
    expect(formation.position[2]).toBeCloseTo(-3, 3);
    expect(formation.rotationY).toBe(0);
  });

  it('memberFacing 默认 forward', () => {
    const formation = createDirector3DBattalion({ rows: 2, cols: 2 });
    expect(formation.formation?.memberFacing).toBe('forward');
  });
});

describe('deriveFormationMembers（运行时派生小人位置）', () => {
  it('rows × cols 个成员，相对方阵中心铺开', () => {
    const members = deriveFormationMembers({ rows: 3, cols: 5, spacing: 1, memberFacing: 'forward' });
    expect(members).toHaveLength(15);
    const xs = members.map(m => m.x);
    const zs = members.map(m => m.z);
    expect(Math.min(...xs)).toBeCloseTo(-2, 3);
    expect(Math.max(...xs)).toBeCloseTo(2, 3);
    expect(Math.min(...zs)).toBeCloseTo(-1, 3);
    expect(Math.max(...zs)).toBeCloseTo(1, 3);
  });

  it('memberFacing inward：左前角面右后', () => {
    const members = deriveFormationMembers({ rows: 2, cols: 2, spacing: 1, memberFacing: 'inward' });
    // r=0 c=0 → 左前 (x=-0.5, z=-0.5)，atan2(0.5, 0.5) = π/4
    expect(members[0].rotationY).toBeCloseTo(Math.PI / 4, 5);
    // r=1 c=1 → 右后 (x=0.5, z=0.5)，atan2(-0.5, -0.5) = -3π/4
    expect(members[3].rotationY).toBeCloseTo(-3 * Math.PI / 4, 5);
  });

  it('memberFacing away：全部 π', () => {
    const members = deriveFormationMembers({ rows: 2, cols: 3, spacing: 1, memberFacing: 'away' });
    for (const m of members) {
      expect(m.rotationY).toBeCloseTo(Math.PI, 5);
    }
  });

  it('footprint 半径覆盖方阵对角线 + padding', () => {
    const footprint = deriveFormationFootprint({ rows: 3, cols: 5, spacing: 1, memberFacing: 'forward' });
    // 对角线 / 2 = sqrt(16 + 4) / 2 ≈ 2.236，+ 0.4 padding ≈ 2.636
    expect(footprint).toBeCloseTo(Math.sqrt(20) / 2 + 0.4, 3);
  });
});

describe('createDirector3DLiteSoldier（独立单兵群演）', () => {
  it('生成单个 mannequin-lite，可独立拖拽', () => {
    const lite = createDirector3DLiteSoldier({ label: '路人甲' });
    expect(lite.type).toBe('mannequin-lite');
    expect(lite.label).toBe('路人甲');
    expect(lite.formation).toBeUndefined();
  });
});
