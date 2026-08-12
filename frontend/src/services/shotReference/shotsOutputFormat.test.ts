import { describe, expect, it } from 'vitest';
import type { ShotReferenceBundle, ShotReferenceItem } from './types';
import { decideShotsMode, planInnerShotCount, renderShotsSection } from './shotsOutputFormat';

function bundle(items: ShotReferenceItem[]): ShotReferenceBundle {
  return {
    items,
    hasGridAnchor: items.some(i => i.kind === 'grid-anchor'),
    hasShotImage: items.some(i => i.kind === 'shot-anchor' || i.kind === 'grid-anchor'),
    capacity: { maxRefs: 10, truncatedCount: 0, truncatedKinds: [] },
  };
}

function gridItem(): ShotReferenceItem {
  return {
    kind: 'grid-anchor',
    id: 'shot-1#grid',
    label: '九宫格锚点',
    source: { kind: 'image', remoteUrl: 'https://example.com/grid.png', createdAt: 1 },
    mentionToken: '@grid_anchor',
    priority: 100,
  };
}

function shotAnchor(): ShotReferenceItem {
  return {
    kind: 'shot-anchor',
    id: 'shot-1',
    label: '分镜锚点首帧',
    source: { kind: 'image', remoteUrl: 'https://example.com/shot.png', createdAt: 1 },
    mentionToken: '@shot_anchor',
    priority: 100,
  };
}

describe('decideShotsMode', () => {
  it('bundle 无 grid-anchor + 没传 cellCount → normal', () => {
    expect(decideShotsMode(bundle([shotAnchor()]))).toBe('normal');
    expect(decideShotsMode(bundle([]))).toBe('normal');
  });

  it('没有 grid-anchor 时忽略 explicitCellCount，避免内置不存在的宫格锚点', () => {
    expect(decideShotsMode(bundle([]), 4)).toBe('normal');
    expect(decideShotsMode(bundle([]), 9)).toBe('normal');
    expect(decideShotsMode(bundle([shotAnchor()]), 4)).toBe('normal');
  });

  it('bundle 含 grid-anchor + cellCount=9 → grid-9', () => {
    expect(decideShotsMode(bundle([gridItem()]), 9)).toBe('grid-9');
  });

  it('bundle 含 grid-anchor + cellCount=4 → grid-4', () => {
    expect(decideShotsMode(bundle([gridItem()]), 4)).toBe('grid-4');
  });

  it('bundle 含 grid-anchor + 不传 cellCount → 走 bundle.gridCellCount 兜底（默认 9）', () => {
    expect(decideShotsMode(bundle([gridItem()]))).toBe('grid-9');
  });
});

describe('renderShotsSection — normal', () => {
  // 分镜拆解改为按渠道上限出长镜头后，内部镜头数必须跟着时长走：
  // 15 秒只切 2 刀 = 每镜 7-8 秒，那么长的时间模型只能做匀速推近，成片就是平淡的。
  it('镜头数按时长推算（~4 秒一镜，夹在 2-5 之间）', () => {
    expect(planInnerShotCount(6)).toBe(2);
    expect(planInnerShotCount(10)).toBe(3);
    expect(planInnerShotCount(15)).toBe(4);
    expect(planInnerShotCount(20)).toBe(5);
    // 上下限
    expect(planInnerShotCount(3)).toBe(2);
    expect(planInnerShotCount(60)).toBe(5);
    expect(planInnerShotCount(0)).toBe(2);
  });

  it('6s → 2 镜头骨架，总时长写死 6 秒', () => {
    const out = renderShotsSection({ mode: 'normal', duration: 6 });
    expect(out).toContain('2 镜头硬切结构');
    expect(out).toContain('必须输出 2 个镜头');
    expect(out).toContain('总和精确 6 秒');
    expect(out).toContain('镜头 1（3 秒）：');
    expect(out).toContain('镜头 2（3 秒）：');
    expect(out).not.toContain('镜头 3（');
  });

  it('15s → 4 镜头骨架', () => {
    const out = renderShotsSection({ mode: 'normal', duration: 15 });
    expect(out).toContain('必须输出 4 个镜头');
    expect(out).toContain('总和精确 15 秒');
    for (let n = 1; n <= 4; n += 1) expect(out).toContain(`镜头 ${n}（`);
    expect(out).not.toContain('镜头 5（');
  });

  it('每个内部镜头都要求景别/机位有变化，禁止整段固定机位', () => {
    const out = renderShotsSection({ mode: 'normal', duration: 15 });
    expect(out).toContain('相邻两个镜头的「景别」与「机位/运镜」不得同时相同');
    expect(out).toContain('每次运镜都要有动机');
    expect(out).toContain('禁止整段固定机位平铺直叙');
  });

  it('人物与道具必须交代出入画，不能凭空出现', () => {
    const out = renderShotsSection({ mode: 'normal', duration: 10 });
    expect(out).toContain('禁止凭空出现在画面里');
    expect(out).toContain('入画');
    expect(out).toContain('镜头揭示');
    expect(out).toContain('离场同理');
    // 每个镜头骨架里都有出入画这一行
    expect(out.match(/- 出入画：/g)?.length).toBe(3);
  });

  it('首镜承接上单元、末镜收束到本单元锚定帧', () => {
    const out = renderShotsSection({ mode: 'normal', duration: 10 });
    expect(out).toContain('【上单元结尾锚定帧】');
    expect(out).toContain('【本单元结尾锚定帧】');
    expect(out.match(/no dissolves, no cross-fades, use hard cuts only/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('renderShotsSection — grid-9', () => {
  it('输出 9 个镜头硬切骨架，每镜头独立成段', () => {
    const out = renderShotsSection({ mode: 'grid-9', duration: 6 });
    expect(out).toContain('9 镜头硬切结构');
    expect(out).toContain('必须输出 9 个镜头');
    // 9 个 镜头独立 header
    for (let n = 1; n <= 9; n += 1) {
      expect(out).toContain(`镜头 ${n}（`);
      expect(out).toContain(`cell ${n}`);
    }
  });

  it('每镜头时长 = duration / 9', () => {
    const out = renderShotsSection({ mode: 'grid-9', duration: 9 });
    expect(out).toContain('1 秒');
    expect(out).toContain('9 镜头总和精确 9 秒');
  });

  it('首镜断言继承上方【上单元结尾锚定帧】；末镜断言收束至上方【本单元结尾锚定帧】（不重复描述内容）', () => {
    const out = renderShotsSection({ mode: 'grid-9', duration: 9 });
    expect(out).toContain('与上方【上单元结尾锚定帧】的衔接');
    expect(out).toContain('与上方【本单元结尾锚定帧】的衔接');
    // 防回归：确保不再以填空 / 详细描述形式重复声明锚定帧内容
    expect(out).not.toContain('人数 / 站位 / 朝向 / 视线 / 持物 / 光线零偏差');
    expect(out).not.toContain('人数 / 站位 / 朝向 / 视线 / 持物 / 光线 / 比例的稳定收束态');
  });
});

describe('e2e: 用户选了 grid 但还没生成图，整链路必须回到无锚点模式', () => {
  it('imageMode=grid-4 + 无 anchor 图 → bundle.hasGridAnchor=false，shotsSection 走 normal', () => {
    // 没有真实生成图时，不能只凭 imageMode 输出 4 镜头宫格结构，
    // 否则模型会写出不存在的 @grid_anchor / cell 对应关系。
    const emptyBundle: ShotReferenceBundle = {
      items: [],
      hasGridAnchor: false,
      hasShotImage: false,
      capacity: { maxRefs: 6, truncatedCount: 0, truncatedKinds: [] },
    };
    // 模拟 ShotPromptService 里的派生逻辑
    const shotImageMode: 'grid-4' | 'grid-9' | 'normal' = 'grid-4';
    const explicitCellCount: 4 | 9 | undefined =
      shotImageMode === 'grid-4' ? 4
      : (shotImageMode === 'grid-9') ? 9
      : undefined;
    const mode = decideShotsMode(emptyBundle, explicitCellCount);
    expect(mode).toBe('normal');

    const section = renderShotsSection({ mode, duration: 6 });
    expect(section).toContain('2 镜头硬切结构');
    expect(section).toContain('总和精确 6 秒');
    expect(section).not.toContain('4 镜头硬切结构');
    expect(section).not.toContain('cell 1');
  });

  it('imageMode=grid-9 + 无 anchor 图 → 仍走 normal，不输出 9 镜头宫格结构', () => {
    const emptyBundle: ShotReferenceBundle = {
      items: [],
      hasGridAnchor: false,
      hasShotImage: false,
      capacity: { maxRefs: 6, truncatedCount: 0, truncatedKinds: [] },
    };
    const mode = decideShotsMode(emptyBundle, 9);
    expect(mode).toBe('normal');
    const section = renderShotsSection({ mode, duration: 9 });
    expect(section).toContain('总和精确 9 秒');
    // 关键：不能出现宫格 cell 协议（没有真实宫格锚图）
    expect(section).not.toContain('cell 9');
    expect(section).not.toContain('九宫格');
  });

  it('imageMode=normal → 走 normal 硬切骨架（不退化）', () => {
    const emptyBundle: ShotReferenceBundle = {
      items: [],
      hasGridAnchor: false,
      hasShotImage: false,
      capacity: { maxRefs: 6, truncatedCount: 0, truncatedKinds: [] },
    };
    const mode = decideShotsMode(emptyBundle, undefined);
    expect(mode).toBe('normal');
    const section = renderShotsSection({ mode, duration: 6 });
    expect(section).toContain('2 镜头硬切结构');
    expect(section).toContain('总和精确 6 秒');
  });
});

describe('renderShotsSection — grid-4', () => {
  it('输出 4 个镜头硬切骨架，每镜头独立成段', () => {
    const out = renderShotsSection({ mode: 'grid-4', duration: 6 });
    expect(out).toContain('4 镜头硬切结构');
    expect(out).toContain('必须输出 4 个镜头');
    expect(out).toContain('镜头 1（');
    expect(out).toContain('镜头 4（');
    expect(out).not.toContain('镜头 5');
  });

  it('每镜头时长 = duration / 4，硬切声明明确', () => {
    const out = renderShotsSection({ mode: 'grid-4', duration: 8 });
    expect(out).toContain('2 秒');
    expect(out).toContain('no dissolves, no cross-fades, use hard cuts only');
    expect(out).toContain('4 镜头总和精确 8 秒');
  });

  it('禁止心理 / 旁白 / 解说被显式写入画面槽位说明', () => {
    const out = renderShotsSection({ mode: 'grid-4', duration: 6 });
    expect(out).toContain('禁止写心理 / 旁白 / 解说');
    expect(out).toContain('最终答案不要输出检查清单或规则复述');
  });
});
