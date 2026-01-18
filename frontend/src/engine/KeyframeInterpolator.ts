/**
 * 关键帧插值器
 * 用于计算关键帧动画的当前值
 */
import type { TrackKeyframe, EasingType } from '../types/track';

// 缓动函数映射
const easingFunctions: Record<EasingType, (t: number) => number> = {
  'linear': (t) => t,
  'ease-in': (t) => t * t,
  'ease-out': (t) => t * (2 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  'ease-in-cubic': (t) => t * t * t,
  'ease-out-cubic': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out-cubic': (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

// 关键帧属性类型
export interface KeyframeValues {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  volume: number;
}

// 默认值
export const DEFAULT_KEYFRAME_VALUES: KeyframeValues = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  volume: 1,
};

/**
 * 关键帧插值器
 */
export class KeyframeInterpolator {
  /**
   * 计算指定时间的所有属性值
   * @param keyframes 关键帧数组
   * @param time 当前时间（毫秒，相对于片段起点）
   * @param defaults 默认值
   */
  static interpolate(
    keyframes: TrackKeyframe[],
    time: number,
    defaults: Partial<KeyframeValues> = {}
  ): KeyframeValues {
    const values: KeyframeValues = { ...DEFAULT_KEYFRAME_VALUES, ...defaults };

    if (!keyframes || keyframes.length === 0) {
      return values;
    }

    // 按时间排序
    const sortedKfs = [...keyframes].sort((a, b) => a.time - b.time);

    // 为每个属性计算插值
    const properties: (keyof KeyframeValues)[] = ['x', 'y', 'scale', 'rotation', 'opacity', 'volume'];

    for (const prop of properties) {
      values[prop] = this.interpolateProperty(sortedKfs, prop, time, values[prop]);
    }

    return values;
  }

  /**
   * 计算单个属性的插值
   */
  private static interpolateProperty(
    keyframes: TrackKeyframe[],
    property: keyof KeyframeValues,
    time: number,
    defaultValue: number
  ): number {
    // 过滤出有该属性值的关键帧
    const kfsWithProperty = keyframes.filter((kf) => kf[property] !== undefined);

    if (kfsWithProperty.length === 0) {
      return defaultValue;
    }

    // 在第一个关键帧之前
    if (time <= kfsWithProperty[0].time) {
      return kfsWithProperty[0][property]!;
    }

    // 在最后一个关键帧之后
    const lastKf = kfsWithProperty[kfsWithProperty.length - 1];
    if (time >= lastKf.time) {
      return lastKf[property]!;
    }

    // 找到前后关键帧
    let prevKf: TrackKeyframe | null = null;
    let nextKf: TrackKeyframe | null = null;

    for (let i = 0; i < kfsWithProperty.length - 1; i++) {
      if (kfsWithProperty[i].time <= time && kfsWithProperty[i + 1].time > time) {
        prevKf = kfsWithProperty[i];
        nextKf = kfsWithProperty[i + 1];
        break;
      }
    }

    if (!prevKf || !nextKf) {
      return defaultValue;
    }

    // 计算插值进度
    const duration = nextKf.time - prevKf.time;
    const elapsed = time - prevKf.time;
    const progress = duration > 0 ? elapsed / duration : 0;

    // 应用缓动函数（使用下一个关键帧的缓动）
    const easingFn = easingFunctions[nextKf.easing] || easingFunctions.linear;
    const easedProgress = easingFn(progress);

    // 线性插值
    const startValue = prevKf[property]!;
    const endValue = nextKf[property]!;
    return startValue + (endValue - startValue) * easedProgress;
  }

  /**
   * 在指定时间是否有关键帧
   */
  static hasKeyframeAt(keyframes: TrackKeyframe[], time: number, threshold = 50): TrackKeyframe | null {
    if (!keyframes) return null;
    return keyframes.find((kf) => Math.abs(kf.time - time) < threshold) || null;
  }

  /**
   * 获取时间范围内的关键帧
   */
  static getKeyframesInRange(
    keyframes: TrackKeyframe[],
    startTime: number,
    endTime: number
  ): TrackKeyframe[] {
    if (!keyframes) return [];
    return keyframes.filter((kf) => kf.time >= startTime && kf.time <= endTime);
  }
}

export default KeyframeInterpolator;
