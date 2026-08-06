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

const SHOT_SIZE_WORDS = ['特写', '近景', '中景', '全景', '大全景', '远景'];
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
