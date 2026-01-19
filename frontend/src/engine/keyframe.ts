/**
 * 关键帧引擎
 * 完整属性快照模式 - 参考 electron-egg 实现
 */
import { nanoid } from 'nanoid';
import type { TrackKeyframe, TransformProperties, EasingType } from '../types/track';
import { DEFAULT_TRANSFORM } from '../types/track';
import { EasingType as EasingEnum } from '../types/track';

// ========== 缓动函数 ==========

export const easingFunctions: Record<string, (t: number) => number> = {
  'linear': (t) => t,
  'ease-in': (t) => t * t,
  'ease-out': (t) => t * (2 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  'ease-in-cubic': (t) => t * t * t,
  'ease-out-cubic': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out-cubic': (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

// 关键帧缓存（避免重复排序）
const sortedKeyframesCache = new WeakMap<TrackKeyframe[], TrackKeyframe[]>();

/**
 * 获取已排序的关键帧（带缓存）
 */
function getSortedKeyframes(keyframes: TrackKeyframe[]): TrackKeyframe[] {
  let sorted = sortedKeyframesCache.get(keyframes);
  if (!sorted) {
    sorted = [...keyframes].sort((a, b) => a.time - b.time);
    sortedKeyframesCache.set(keyframes, sorted);
  }
  return sorted;
}

/**
 * 清除关键帧缓存（在关键帧数组变更后调用）
 */
export function clearKeyframeCache(keyframes: TrackKeyframe[]): void {
  sortedKeyframesCache.delete(keyframes);
}

// ========== 核心函数 ==========

/**
 * 获取指定时间点的动画属性值
 * @param keyframes 关键帧列表
 * @param time 当前时间（帧，相对于片段起点）
 * @param defaults 默认属性值
 * @returns 插值后的属性值
 */
export function getAnimatedProperties(
  keyframes: TrackKeyframe[] | undefined,
  time: number,
  defaults: TransformProperties = DEFAULT_TRANSFORM
): TransformProperties {
  if (!keyframes || keyframes.length === 0) {
    return { ...defaults };
  }

  const sorted = getSortedKeyframes(keyframes);

  // 在第一个关键帧之前
  if (time <= sorted[0].time) {
    return {
      x: sorted[0].x,
      y: sorted[0].y,
      scale: sorted[0].scale,
      rotation: sorted[0].rotation,
      opacity: sorted[0].opacity,
    };
  }

  // 在最后一个关键帧之后
  const last = sorted[sorted.length - 1];
  if (time >= last.time) {
    return {
      x: last.x,
      y: last.y,
      scale: last.scale,
      rotation: last.rotation,
      opacity: last.opacity,
    };
  }

  // 找到前后关键帧
  let prevKf: TrackKeyframe | null = null;
  let nextKf: TrackKeyframe | null = null;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].time <= time && sorted[i + 1].time > time) {
      prevKf = sorted[i];
      nextKf = sorted[i + 1];
      break;
    }
  }

  if (!prevKf || !nextKf) {
    return { ...defaults };
  }

  // 计算插值进度
  const duration = nextKf.time - prevKf.time;
  const elapsed = time - prevKf.time;
  const progress = duration > 0 ? elapsed / duration : 0;

  // 应用缓动函数（使用当前关键帧的缓动设置）
  const easingFn = easingFunctions[prevKf.easing] || easingFunctions.linear;
  const easedProgress = easingFn(progress);

  // 对每个属性进行线性插值
  return {
    x: prevKf.x + (nextKf.x - prevKf.x) * easedProgress,
    y: prevKf.y + (nextKf.y - prevKf.y) * easedProgress,
    scale: prevKf.scale + (nextKf.scale - prevKf.scale) * easedProgress,
    rotation: prevKf.rotation + (nextKf.rotation - prevKf.rotation) * easedProgress,
    opacity: prevKf.opacity + (nextKf.opacity - prevKf.opacity) * easedProgress,
  };
}

/**
 * 添加关键帧
 * @param keyframes 现有关键帧列表
 * @param time 关键帧时间
 * @param properties 属性快照
 * @param easing 缓动类型
 * @returns 新的关键帧列表
 */
export function addKeyframe(
  keyframes: TrackKeyframe[] | undefined,
  time: number,
  properties: TransformProperties,
  easing: EasingType = EasingEnum.LINEAR
): TrackKeyframe[] {
  const list = keyframes ? [...keyframes] : [];

  // 检查是否已有同时间的关键帧
  const existingIndex = list.findIndex((kf) => kf.time === time);

  const newKeyframe: TrackKeyframe = {
    id: nanoid(),
    time,
    x: properties.x,
    y: properties.y,
    scale: properties.scale,
    rotation: properties.rotation,
    opacity: properties.opacity,
    easing,
  };

  if (existingIndex >= 0) {
    // 更新现有关键帧
    list[existingIndex] = { ...list[existingIndex], ...newKeyframe, id: list[existingIndex].id };
  } else {
    // 添加新关键帧
    list.push(newKeyframe);
  }

  // 按时间排序
  list.sort((a, b) => a.time - b.time);

  return list;
}

/**
 * 删除关键帧
 */
export function removeKeyframe(
  keyframes: TrackKeyframe[] | undefined,
  keyframeId: string
): TrackKeyframe[] {
  if (!keyframes) return [];
  return keyframes.filter((kf) => kf.id !== keyframeId);
}

/**
 * 更新关键帧时间
 */
export function updateKeyframeTime(
  keyframes: TrackKeyframe[] | undefined,
  keyframeId: string,
  newTime: number
): TrackKeyframe[] {
  if (!keyframes) return [];
  const list = keyframes.map((kf) =>
    kf.id === keyframeId ? { ...kf, time: newTime } : kf
  );
  return list.sort((a, b) => a.time - b.time);
}

/**
 * 更新关键帧缓动
 */
export function updateKeyframeEasing(
  keyframes: TrackKeyframe[] | undefined,
  keyframeId: string,
  easing: EasingType
): TrackKeyframe[] {
  if (!keyframes) return [];
  return keyframes.map((kf) =>
    kf.id === keyframeId ? { ...kf, easing } : kf
  );
}

/**
 * 更新关键帧属性
 */
export function updateKeyframeProperties(
  keyframes: TrackKeyframe[] | undefined,
  keyframeId: string,
  properties: Partial<TransformProperties>
): TrackKeyframe[] {
  if (!keyframes) return [];
  return keyframes.map((kf) =>
    kf.id === keyframeId ? { ...kf, ...properties } : kf
  );
}

/**
 * 自动打帧：修改属性时自动创建或更新关键帧
 * @param keyframes 现有关键帧列表
 * @param time 当前时间（帧）
 * @param property 修改的属性名
 * @param value 新值
 * @param defaults 默认属性值（用于创建新关键帧时）
 * @returns 更新后的关键帧列表
 */
export function autoKeyframe(
  keyframes: TrackKeyframe[] | undefined,
  time: number,
  property: keyof TransformProperties,
  value: number,
  defaults: TransformProperties = DEFAULT_TRANSFORM
): TrackKeyframe[] {
  const list = keyframes ? [...keyframes] : [];

  // 检查当前时间是否已有关键帧
  const existingKf = list.find((kf) => kf.time === time);

  if (existingKf) {
    // 更新现有关键帧的属性
    return list.map((kf) =>
      kf.id === existingKf.id ? { ...kf, [property]: value } : kf
    );
  }

  // 创建新关键帧，使用当前插值的其他属性
  const currentProps = getAnimatedProperties(list, time, defaults);
  const newKeyframe: TrackKeyframe = {
    id: nanoid(),
    time,
    x: currentProps.x,
    y: currentProps.y,
    scale: currentProps.scale,
    rotation: currentProps.rotation,
    opacity: currentProps.opacity,
    [property]: value,
    easing: EasingEnum.LINEAR,
  };

  list.push(newKeyframe);
  return list.sort((a, b) => a.time - b.time);
}

/**
 * 在指定时间是否有关键帧
 */
export function hasKeyframeAt(
  keyframes: TrackKeyframe[] | undefined,
  time: number,
  threshold = 1 // 帧
): TrackKeyframe | null {
  if (!keyframes) return null;
  return keyframes.find((kf) => Math.abs(kf.time - time) < threshold) || null;
}

/**
 * 获取时间范围内的关键帧
 */
export function getKeyframesInRange(
  keyframes: TrackKeyframe[] | undefined,
  startTime: number,
  endTime: number
): TrackKeyframe[] {
  if (!keyframes) return [];
  return keyframes.filter((kf) => kf.time >= startTime && kf.time <= endTime);
}

/**
 * 复制关键帧到新时间
 */
export function copyKeyframe(
  keyframes: TrackKeyframe[] | undefined,
  keyframeId: string,
  newTime: number
): TrackKeyframe[] {
  if (!keyframes) return [];
  const source = keyframes.find((kf) => kf.id === keyframeId);
  if (!source) return keyframes;

  const newKeyframe: TrackKeyframe = {
    ...source,
    id: nanoid(),
    time: newTime,
  };

  const list = [...keyframes, newKeyframe];
  return list.sort((a, b) => a.time - b.time);
}

// ========== 旧版兼容函数（用于 VideoRenderer） ==========

interface OldKeyframe {
  id: string;
  time: number;
  property: string;
  value: number;
  easing?: string;
}

/**
 * 获取插值后的属性值（兼容旧版按属性分离的关键帧格式）
 * @param keyframes 旧版关键帧数组（按属性分离）
 * @param time 当前时间（毫秒，相对于 clip 起点）
 * @param defaults 默认属性值对象
 * @returns 插值后的属性值对象
 */
export function getInterpolatedValues(
  keyframes: OldKeyframe[] | undefined,
  time: number,
  defaults: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = { ...defaults };

  if (!keyframes || keyframes.length === 0) {
    return result;
  }

  // 按属性分组
  const byProperty = new Map<string, OldKeyframe[]>();
  for (const kf of keyframes) {
    const list = byProperty.get(kf.property) || [];
    list.push(kf);
    byProperty.set(kf.property, list);
  }

  // 对每个属性计算插值
  for (const [property, kfs] of byProperty) {
    const sorted = [...kfs].sort((a, b) => a.time - b.time);

    // 在第一个关键帧之前
    if (time <= sorted[0].time) {
      result[property] = sorted[0].value;
      continue;
    }

    // 在最后一个关键帧之后
    const last = sorted[sorted.length - 1];
    if (time >= last.time) {
      result[property] = last.value;
      continue;
    }

    // 找到前后关键帧
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].time <= time && sorted[i + 1].time > time) {
        const prevKf = sorted[i];
        const nextKf = sorted[i + 1];

        // 计算插值进度
        const duration = nextKf.time - prevKf.time;
        const elapsed = time - prevKf.time;
        const progress = duration > 0 ? elapsed / duration : 0;

        // 应用缓动函数
        const easingFn = easingFunctions[prevKf.easing || 'linear'] || easingFunctions.linear;
        const easedProgress = easingFn(progress);

        // 线性插值
        result[property] = prevKf.value + (nextKf.value - prevKf.value) * easedProgress;
        break;
      }
    }
  }

  return result;
}

export default {
  easingFunctions,
  getAnimatedProperties,
  addKeyframe,
  removeKeyframe,
  updateKeyframeTime,
  updateKeyframeEasing,
  updateKeyframeProperties,
  autoKeyframe,
  hasKeyframeAt,
  getKeyframesInRange,
  copyKeyframe,
  clearKeyframeCache,
  getInterpolatedValues,
};
