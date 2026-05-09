/**
 * 全景投影契约（projection contract）。
 *
 * 这是 panoramaTemplate 之上的一层：panoramaTemplate 描述「场景类型」（auto / indoor /
 * outdoor），projectionMode 描述「我们究竟生成的是什么形态的图」。它决定：
 *
 *  - 提示词怎么写（环境带 / 真 2:1 球面 / 普通宽幅）
 *  - 出图比例的合法集合
 *  - 展示算法（cylinder-band / sphere-band / equirect-sphere / flat）
 *  - 下游 3D 导演工作台拿到这张图时该怎么贴（圆柱 / 球带 / 球体 / 平面）
 *
 * 设计文档：docs/linghui-panorama-and-3d-director-workbench-plan.md
 */

export type PanoramaProjectionMode =
  | 'ar720-band'
  | 'equirectangular-2to1'
  | 'flat-wide';

export type PanoramaViewerMode =
  | 'cylinder-band'
  | 'sphere-band'
  | 'equirect-sphere'
  | 'flat';

export const PANORAMA_PROJECTION_OPTIONS: Array<{
  value: PanoramaProjectionMode;
  label: string;
  hint: string;
  defaultAspectRatio: string;
  allowedAspectRatios: string[];
}> = [
  {
    value: 'ar720-band',
    label: 'AR720 环境带',
    hint: '默认。21:9 / 16:9 宽幅环绕，圆柱/球带预览，避免极区拉花',
    defaultAspectRatio: '21:9',
    allowedAspectRatios: ['16:9', '21:9'],
  },
  {
    value: 'equirectangular-2to1',
    label: '真 360°×180° 球面',
    hint: '高级。强约束 2:1 经纬展开 + 极区，模型不稳定时建议谨慎使用',
    defaultAspectRatio: '2:1',
    allowedAspectRatios: ['2:1'],
  },
  {
    value: 'flat-wide',
    label: '宽幅平面板',
    hint: '兜底。模型不支持环绕全景时，把它当一张普通宽幅环境图',
    defaultAspectRatio: '21:9',
    allowedAspectRatios: ['16:9', '21:9'],
  },
];

const PROJECTION_MODE_VALUES: ReadonlySet<PanoramaProjectionMode> = new Set([
  'ar720-band',
  'equirectangular-2to1',
  'flat-wide',
]);

export function resolvePanoramaProjectionMode(value: unknown): PanoramaProjectionMode {
  if (typeof value === 'string' && PROJECTION_MODE_VALUES.has(value as PanoramaProjectionMode)) {
    return value as PanoramaProjectionMode;
  }
  return 'ar720-band';
}

/**
 * 把比例字符串解析成数值；不合法返回 undefined。支持 "16:9"、"21:9"、"2:1"、"1280x720"。
 */
export function parseAspectRatioValue(input: string | undefined | null): number | undefined {
  const raw = String(input ?? '').trim();
  if (!raw) return undefined;
  const colon = raw.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (colon) {
    const w = Number(colon[1]);
    const h = Number(colon[2]);
    if (Number.isFinite(w) && Number.isFinite(h) && h > 0) return w / h;
  }
  const product = raw.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
  if (product) {
    const w = Number(product[1]);
    const h = Number(product[2]);
    if (Number.isFinite(w) && Number.isFinite(h) && h > 0) return w / h;
  }
  const direct = Number(raw);
  return Number.isFinite(direct) && direct > 0 ? direct : undefined;
}

export interface ResolveViewerModeInput {
  /** 节点 properties.projectionMode（缺省 ar720-band） */
  projectionMode?: PanoramaProjectionMode;
  /** 实际图像比例：传 width/height 或 ratioString（"16:9"），任一可用 */
  width?: number;
  height?: number;
  ratioString?: string;
}

/**
 * 推断展示器几何。
 *
 * 优先级：projectionMode 显式声明 > 实际比例兜底。
 *
 *  - equirectangular-2to1 → equirect-sphere（完整球体，大 pitch）
 *  - flat-wide → flat（不环绕）
 *  - ar720-band → cylinder-band 默认；当比例接近 2:1 时升级到 equirect-sphere
 *  - 都未声明：按比例硬判断（≈2:1 → equirect-sphere；≥1.75 → cylinder-band；其余 flat）
 */
export function resolvePanoramaViewerMode(input: ResolveViewerModeInput): PanoramaViewerMode {
  const ratio = (() => {
    if (input.width && input.height && input.height > 0) return input.width / input.height;
    return parseAspectRatioValue(input.ratioString);
  })();

  if (input.projectionMode === 'equirectangular-2to1') return 'equirect-sphere';
  if (input.projectionMode === 'flat-wide') return 'flat';
  if (input.projectionMode === 'ar720-band') {
    if (ratio != null && Math.abs(ratio - 2) < 0.08) return 'equirect-sphere';
    return 'cylinder-band';
  }

  if (ratio == null) return 'cylinder-band';
  if (Math.abs(ratio - 2) < 0.08) return 'equirect-sphere';
  if (ratio >= 1.75) return 'cylinder-band';
  return 'flat';
}

/** 给定 projectionMode 是否允许某比例。用于 UI 在切换 mode 时筛选可选比例。 */
export function isAspectRatioAllowedForProjection(
  ratio: string,
  mode: PanoramaProjectionMode,
): boolean {
  const option = PANORAMA_PROJECTION_OPTIONS.find(item => item.value === mode);
  return option ? option.allowedAspectRatios.includes(ratio) : true;
}
