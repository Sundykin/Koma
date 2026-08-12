import { describe, expect, it } from 'vitest';
import type { ShotReferenceBundle, ShotReferenceItem } from './types';
import { decideShotsMode, planInnerShots, renderShotsSection } from './shotsOutputFormat';

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
  // 切几刀是剧情决定的，不是拿时长套公式：追逐 / 搏斗 / 长镜压迫感一镜到底反而更好。
  // 所以骨架只给「建议值 + 区间」，下限恒为 1。
  it('只给建议值与区间，下限恒为 1（允许一镜到底）', () => {
    expect(planInnerShots(6)).toEqual({ suggested: 2, min: 1, max: 3 });
    expect(planInnerShots(15)).toEqual({ suggested: 4, min: 1, max: 5 });
    expect(planInnerShots(20)).toEqual({ suggested: 5, min: 1, max: 6 });
    // 极短 / 异常输入也不会给出 0 或负数
    expect(planInnerShots(3)).toEqual({ suggested: 1, min: 1, max: 2 });
    expect(planInnerShots(0).suggested).toBe(1);
    // 超长时长封顶，不会切成十几刀
    expect(planInnerShots(120).suggested).toBe(6);
    expect(planInnerShots(120).max).toBe(6);
  });

  it('骨架写明镜头数由剧情决定，并列出一镜到底的适用场景', () => {
    const out = renderShotsSection({ mode: 'normal', duration: 15 });
    expect(out).toContain('镜头数由剧情决定，不要按时长均分');
    expect(out).toContain('一镜到底');
    expect(out).toContain('追逐');
    expect(out).toContain('不要为了凑数切镜');
    // 建议值只是起点
    expect(out).toContain('起点建议');
    expect(out).toContain('可选范围 1–5');
    expect(out).toContain('总时长精确 15 秒');
  });

  it('不再输出写死的 N 个镜头块，改为可重复的骨架', () => {
    const out = renderShotsSection({ mode: 'normal', duration: 15 });
    expect(out).toContain('按你判断的镜头数重复下面这段结构');
    expect(out).toContain('镜头 N（__秒__）：');
    // 关键：不能再枚举出固定的「镜头 1（3.75 秒）」这类死块
    expect(out).not.toMatch(/镜头 1（\d/);
  });

  it('一镜到底时首末镜职责合并，且要求内部有节奏', () => {
    const out = renderShotsSection({ mode: 'normal', duration: 15 });
    expect(out).toContain('一镜到底时**，镜头 1 同时承担首镜与末镜职责');
    expect(out).toContain('禁止全程锁死机位、主体一动不动地干拍');
  });

  it('运镜要有动机，禁止把「缓缓推近」当万能句', () => {
    const out = renderShotsSection({ mode: 'normal', duration: 10 });
    expect(out).toContain('每次运镜都要有动机');
    expect(out).toContain('禁止把"缓缓推近"当万能句用');
    expect(out).toContain('相邻镜头的「景别」与「机位/运镜」不得同时相同');
  });

  it('人物与道具必须交代出入画，不能凭空出现', () => {
    const out = renderShotsSection({ mode: 'normal', duration: 10 });
    expect(out).toContain('禁止凭空出现在画面里');
    expect(out).toContain('镜头揭示');
    expect(out).toContain('离场同理');
    expect(out).toContain('不要直接出现在手里');
  });

  it('首末镜与上下单元锚定帧的衔接要求仍在', () => {
    const out = renderShotsSection({ mode: 'normal', duration: 10 });
    expect(out).toContain('【上单元结尾锚定帧】');
    expect(out).toContain('【本单元结尾锚定帧】');
    expect(out).toContain('no dissolves, no cross-fades, use hard cuts only');
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
    expect(section).toContain('硬切结构');
    expect(section).toContain('总时长精确 6 秒');
    // 关键：没有真实宫格锚图时不能落进宫格 cell 协议
    expect(section).not.toContain('cell 1');
    expect(section).not.toContain('四宫格');
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
    expect(section).toContain('总时长精确 9 秒');
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
    expect(section).toContain('硬切结构');
    expect(section).toContain('总时长精确 6 秒');
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
