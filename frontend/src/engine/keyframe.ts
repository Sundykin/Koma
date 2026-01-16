/**
 * 关键帧系统
 * 缓动函数和关键帧插值计算
 */
import type { Keyframe, EasingType } from '../types';

// ========== 缓动函数 ==========

export const easingFunctions: Record<
  Exclude<EasingType, 'cubic-bezier'>,
  (t: number) => number
> = {
  linear: (t) => t,
  'ease-in': (t) => t * t,
  'ease-out': (t) => t * (2 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
};

// 贝塞尔曲线缓动
export function cubicBezier(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): (t: number) => number {
  // 简化实现：牛顿迭代法求解 t 对应的 y 值
  return (t: number) => {
    // 二分查找 x 对应的 t
    let low = 0;
    let high = 1;
    let mid = t;

    for (let i = 0; i < 10; i++) {
      const x = bezierPoint(mid, p1x, p2x);
      if (Math.abs(x - t) < 0.001) break;
      if (x < t) low = mid;
      else high = mid;
      mid = (low + high) / 2;
    }

    return bezierPoint(mid, p1y, p2y);
  };
}

function bezierPoint(t: number, p1: number, p2: number): number {
  // 三次贝塞尔曲线公式 (起点 0, 控制点 p1, 控制点 p2, 终点 1)
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  return 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3;
}

// ========== 关键帧插值 ==========

/**
 * 获取指定时间点的属性值
 * @param keyframes 关键帧数组（按时间排序）
 * @param property 属性名
 * @param time 当前时间（相对于 clip 起点）
 * @param defaultValue 默认值
 */
export function getInterpolatedValue(
  keyframes: Keyframe[],
  property: string,
  time: number,
  defaultValue: number
): number {
  // 筛选该属性的关键帧
  const propertyKeyframes = keyframes
    .filter((kf) => kf.property === property)
    .sort((a, b) => a.time - b.time);

  if (propertyKeyframes.length === 0) {
    return defaultValue;
  }

  // 找到当前时间前后的关键帧
  const prevIndex = propertyKeyframes.findIndex((kf) => kf.time > time) - 1;

  // 在第一个关键帧之前
  if (prevIndex < 0) {
    if (propertyKeyframes[0].time > time) {
      return defaultValue;
    }
    return propertyKeyframes[0].value;
  }

  const prevKf = propertyKeyframes[prevIndex];
  const nextKf = propertyKeyframes[prevIndex + 1];

  // 在最后一个关键帧之后
  if (!nextKf) {
    return prevKf.value;
  }

  // 计算插值进度
  const progress = (time - prevKf.time) / (nextKf.time - prevKf.time);

  // 应用缓动函数
  let easedProgress: number;
  if (nextKf.easing === 'cubic-bezier' && nextKf.bezierPoints) {
    const [p1x, p1y, p2x, p2y] = nextKf.bezierPoints;
    easedProgress = cubicBezier(p1x, p1y, p2x, p2y)(progress);
  } else {
    const easingFn = easingFunctions[nextKf.easing] || easingFunctions.linear;
    easedProgress = easingFn(progress);
  }

  // 线性插值
  return prevKf.value + (nextKf.value - prevKf.value) * easedProgress;
}

/**
 * 获取所有属性在指定时间的值
 */
export function getInterpolatedValues(
  keyframes: Keyframe[],
  time: number,
  defaults: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = { ...defaults };

  // 获取所有唯一属性名
  const properties = [...new Set(keyframes.map((kf) => kf.property))];

  for (const property of properties) {
    result[property] = getInterpolatedValue(
      keyframes,
      property,
      time,
      defaults[property] ?? 0
    );
  }

  return result;
}

/**
 * 添加关键帧（自动排序）
 */
export function addKeyframe(
  keyframes: Keyframe[],
  newKeyframe: Keyframe
): Keyframe[] {
  // 移除同属性同时间的旧关键帧
  const filtered = keyframes.filter(
    (kf) =>
      !(kf.property === newKeyframe.property && kf.time === newKeyframe.time)
  );
  return [...filtered, newKeyframe].sort((a, b) => a.time - b.time);
}

/**
 * 删除关键帧
 */
export function removeKeyframe(
  keyframes: Keyframe[],
  keyframeId: string
): Keyframe[] {
  return keyframes.filter((kf) => kf.id !== keyframeId);
}

export default {
  easingFunctions,
  cubicBezier,
  getInterpolatedValue,
  getInterpolatedValues,
  addKeyframe,
  removeKeyframe,
};
