/**
 * 关键帧插值器
 * 用于计算关键帧动画的当前值
 */
import type { TrackKeyframe, TransformProperties } from '../types/track';
import { DEFAULT_TRANSFORM } from '../types/track';
import { easingFunctions, getAnimatedProperties } from './keyframe';

// 关键帧属性类型（包含音频专用属性）
export interface KeyframeValues extends TransformProperties {
  volume: number;
}

// 默认值
export const DEFAULT_KEYFRAME_VALUES: KeyframeValues = {
  ...DEFAULT_TRANSFORM,
  volume: 1,
};

/**
 * 关键帧插值器
 */
export class KeyframeInterpolator {
  /**
   * 计算指定时间的所有属性值
   * @param keyframes 关键帧数组
   * @param time 当前时间（帧，相对于片段起点）
   * @param defaults 默认值
   */
  static interpolate(
    keyframes: TrackKeyframe[],
    time: number,
    defaults: Partial<KeyframeValues> = {}
  ): KeyframeValues {
    const baseDefaults: TransformProperties = {
      x: defaults.x ?? DEFAULT_TRANSFORM.x,
      y: defaults.y ?? DEFAULT_TRANSFORM.y,
      scale: defaults.scale ?? DEFAULT_TRANSFORM.scale,
      rotation: defaults.rotation ?? DEFAULT_TRANSFORM.rotation,
      opacity: defaults.opacity ?? DEFAULT_TRANSFORM.opacity,
    };

    const props = getAnimatedProperties(keyframes, time, baseDefaults);

    // 处理音量插值
    let volume = defaults.volume ?? 1;
    if (keyframes && keyframes.length > 0) {
      volume = this.interpolateVolume(keyframes, time, volume);
    }

    return {
      ...props,
      volume,
    };
  }

  /**
   * 计算音量插值
   */
  private static interpolateVolume(
    keyframes: TrackKeyframe[],
    time: number,
    defaultVolume: number
  ): number {
    const kfsWithVolume = keyframes.filter((kf) => kf.volume !== undefined);

    if (kfsWithVolume.length === 0) {
      return defaultVolume;
    }

    const sorted = [...kfsWithVolume].sort((a, b) => a.time - b.time);

    // 在第一个关键帧之前
    if (time <= sorted[0].time) {
      return sorted[0].volume!;
    }

    // 在最后一个关键帧之后
    const last = sorted[sorted.length - 1];
    if (time >= last.time) {
      return last.volume!;
    }

    // 找到前后关键帧
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].time <= time && sorted[i + 1].time > time) {
        const prevKf = sorted[i];
        const nextKf = sorted[i + 1];

        const duration = nextKf.time - prevKf.time;
        const elapsed = time - prevKf.time;
        const progress = duration > 0 ? elapsed / duration : 0;

        const easingFn = easingFunctions[prevKf.easing] || easingFunctions.linear;
        const easedProgress = easingFn(progress);

        return prevKf.volume! + (nextKf.volume! - prevKf.volume!) * easedProgress;
      }
    }

    return defaultVolume;
  }

  /**
   * 在指定时间是否有关键帧
   */
  static hasKeyframeAt(keyframes: TrackKeyframe[], time: number, threshold = 1): TrackKeyframe | null {
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
