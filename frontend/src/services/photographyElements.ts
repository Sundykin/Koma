/**
 * 从分镜描述文本里提取摄影语言要素（景别/机位/光线）。
 *
 * 剧情模式的专业分镜脚本把摄影语言写在行文里（如"近景，平视，昏暗山洞，
 * 侧上冷白余光"）——生图生视频直接据此取景。此函数把关键词提取成标签，
 * 让用户在分镜卡上一眼看到每镜的摄影要素是否齐全、连续镜头是否连贯。
 *
 * 提取是"提示性"的：按词汇表扫描，不追求语义解析；没提取到 = 该镜缺
 * 这类摄影语言（可能是旧数据，也可能是画面描述不够专业）。
 */
import type { ShotScriptLine } from '../types/scene-character';

export interface PhotographyElements {
  /** 景别：特写/近景/中景/全景/大全景 */
  shotSizes: string[];
  /** 机位视角：平视/俯视/仰视/低机位/过肩等 */
  cameraAngles: string[];
  /** 光线特征：暖/冷/逆光/侧光/明暗等 */
  lightings: string[];
}

// 大全景/远景在扫描时必须在全景前（大全景包含子串全景，先匹配具体的）
const SHOT_SIZE_WORDS = ['大全景', '远景', '特写', '近景', '中景', '全景'];
const CAMERA_ANGLE_WORDS = ['平视', '俯视', '仰视', '低机位', '高机位', '低角度', '高角度', '过肩', '越肩', '侧拍', '正拍', '背拍'];
const LIGHT_WORDS = ['逆光', '侧光', '顶光', '背光', '月光', '日光', '烛光', '油灯', '暖黄', '冷白', '明亮', '昏暗', '暗部', '明暗', '阴影', '逆光剪影'];

function scan(text: string, words: string[]): string[] {
  const found = words.filter(word => text.includes(word));
  return Array.from(new Set(found));
}

/** 从一段分镜描述文本提取摄影要素 */
export function extractPhotographyElements(text: string | undefined): PhotographyElements {
  const t = String(text || '');
  return {
    shotSizes: scan(t, SHOT_SIZE_WORDS),
    cameraAngles: scan(t, CAMERA_ANGLE_WORDS),
    lightings: scan(t, LIGHT_WORDS),
  };
}

/** 聚合分镜所有 description 行的摄影要素 */
export function extractShotPhotography(shot: { scriptLines?: ShotScriptLine[] }): PhotographyElements {
  const sizes = new Set<string>();
  const angles = new Set<string>();
  const lights = new Set<string>();
  for (const line of shot.scriptLines ?? []) {
    if (line.role !== 'description') continue;
    const elements = extractPhotographyElements(line.text);
    elements.shotSizes.forEach(w => sizes.add(w));
    elements.cameraAngles.forEach(w => angles.add(w));
    elements.lightings.forEach(w => lights.add(w));
  }
  return {
    shotSizes: Array.from(sizes),
    cameraAngles: Array.from(angles),
    lightings: Array.from(lights),
  };
}

// ---------------------------------------------------------------------------
// 景别连贯性
// ---------------------------------------------------------------------------

/** 景别远近梯度（越大越远；用于判定相邻镜头景别跳变） */
const SHOT_SIZE_RANK: Record<string, number> = {
  '特写': 1,
  '近景': 2,
  '中景': 3,
  '全景': 4,
  '大全景': 5,
  '远景': 5,
};

/** 取分镜的主景别（第一个出现的景别）；无景别返回 undefined */
export function getPrimaryShotSize(shot: { scriptLines?: ShotScriptLine[] }): string | undefined {
  const elements = extractShotPhotography(shot);
  return elements.shotSizes[0];
}

/**
 * 相邻两镜景别是否跳变（远近差 ≥ 2 级，如特写↔大全景直接跳）。
 * 专业剪辑一般用景别递进/匹配，直接跳两级以上除非有意的冲击，否则观感跳。
 */
export function isShotSizeJump(sizeA: string | undefined, sizeB: string | undefined): boolean {
  if (!sizeA || !sizeB) return false;
  const a = SHOT_SIZE_RANK[sizeA];
  const b = SHOT_SIZE_RANK[sizeB];
  if (!a || !b) return false;
  return Math.abs(a - b) >= 2;
}

/** shot.shotType 枚举 */
export type ShotTypeValue = 'close-up' | 'medium' | 'wide' | 'extreme-wide';

/** 景别 → shotType 枚举映射（特写→close-up 等；识别不到返回 undefined） */
const SIZE_TO_SHOT_TYPE: Record<string, ShotTypeValue> = {
  '特写': 'close-up',
  '近景': 'medium',
  '中景': 'medium',
  '全景': 'wide',
  '大全景': 'extreme-wide',
  '远景': 'extreme-wide',
};

/** 分镜主景别映射到 shot.shotType 枚举值（升级脚本时同步字段，保证提示词推荐景别与脚本一致） */
export function shotSizeToShotType(shot: { scriptLines?: ShotScriptLine[] }): ShotTypeValue | undefined {
  const primary = getPrimaryShotSize(shot);
  return primary ? SIZE_TO_SHOT_TYPE[primary] : undefined;
}

// ---------------------------------------------------------------------------
// 光线冷暖（同场景相邻镜头光线连贯性）
// ---------------------------------------------------------------------------

const WARM_LIGHT_WORDS = ['暖黄', '暖光', '烛光', '油灯', '火光', '日光', '朝阳', '夕阳', '晚霞', '金色', '橙黄', '昏黄'];
const COLD_LIGHT_WORDS = ['冷白', '月光', '荧光', '冷光', '寒光', '蓝', '青灰', '雪光', '苍白', '清冷'];

export type LightTone = 'warm' | 'cold' | 'mixed' | 'none';

/** 判定一段描述的主光线冷暖（出现次数多的类型；都无返回 none，都有返回 mixed） */
export function detectLightTone(text: string | undefined): LightTone {
  const t = String(text || '');
  let warm = 0;
  let cold = 0;
  for (const w of WARM_LIGHT_WORDS) {
    if (t.includes(w)) warm += 1;
  }
  for (const w of COLD_LIGHT_WORDS) {
    if (t.includes(w)) cold += 1;
  }
  if (warm === 0 && cold === 0) return 'none';
  if (warm > 0 && cold > 0) return 'mixed';
  return warm > 0 ? 'warm' : 'cold';
}

/** 聚合分镜全部 description 行的光线冷暖 */
export function detectShotLightTone(shot: { scriptLines?: ShotScriptLine[] }): LightTone {
  const text = (shot.scriptLines ?? [])
    .filter(line => line.role === 'description')
    .map(line => line.text)
    .join('\n');
  return detectLightTone(text);
}

/**
 * 相邻两镜光线冷暖是否"突变"：一个有明确暖、一个有明确冷（非 mixed/none）。
 * 仅提示性——剧情需要（进门换光/闪电）可能合理，由用户判断。
 */
export function isLightToneJump(toneA: LightTone | undefined, toneB: LightTone | undefined): boolean {
  if (!toneA || !toneB) return false;
  return (toneA === 'warm' && toneB === 'cold') || (toneA === 'cold' && toneB === 'warm');
}

/** 相邻两镜是否同场景（scenes 有交集）——光线跳变只在同场景内才可疑 */
export function isSameScene(a: { scenes?: string[] }, b: { scenes?: string[] }): boolean {
  const setA = new Set(a.scenes ?? []);
  return (b.scenes ?? []).some(id => setA.has(id));
}
