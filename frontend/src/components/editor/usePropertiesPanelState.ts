/**
 * SimplePropertiesPanel 状态与逻辑 hook
 * 从 SimplePropertiesPanel.tsx 拆分
 */
import { useMemo, useCallback } from 'react';
import {
  Clip, Keyframe, AnimatableProperty, MediaType,
  ClipFilter, ClipAnimation, AudioFade, ClipMask, MaskType
} from '../../types/editor';
import { getAnimatedProperties, hasKeyframes, getKeyframeAtTime } from '../../engine/simpleKeyframe';

// 预设滤镜列表
export const FILTER_PRESETS: { id: string; name: string; resourceId: string }[] = [
  { id: 'none', name: '无', resourceId: '' },
  { id: 'warm', name: '暖色', resourceId: '7082737037045217799' },
  { id: 'cool', name: '冷色', resourceId: '7082737037045217800' },
  { id: 'vintage', name: '复古', resourceId: '7082737037045217801' },
  { id: 'blackwhite', name: '黑白', resourceId: '7082737037045217802' },
  { id: 'vivid', name: '鲜艳', resourceId: '7082737037045217803' },
];

// 预设动画列表
export const ANIMATION_PRESETS: { effectId: string; name: string; type: 'in' | 'out' }[] = [
  { effectId: 'fade_in', name: '淡入', type: 'in' },
  { effectId: 'slide_in_left', name: '左滑入', type: 'in' },
  { effectId: 'slide_in_right', name: '右滑入', type: 'in' },
  { effectId: 'zoom_in', name: '放大入', type: 'in' },
  { effectId: 'fade_out', name: '淡出', type: 'out' },
  { effectId: 'slide_out_left', name: '左滑出', type: 'out' },
  { effectId: 'slide_out_right', name: '右滑出', type: 'out' },
  { effectId: 'zoom_out', name: '缩小出', type: 'out' },
];

// 蒙版类型
export const MASK_TYPES: { type: MaskType; name: string }[] = [
  { type: 'linear', name: '线性' },
  { type: 'mirror', name: '镜像' },
  { type: 'circle', name: '圆形' },
  { type: 'rectangle', name: '矩形' },
  { type: 'heart', name: '心形' },
  { type: 'star', name: '星形' },
];

// 预设字体
export const FONT_FAMILIES = [
  { label: '默认', value: 'Arial, sans-serif' },
  { label: '黑体', value: 'SimHei, sans-serif' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '微软雅黑', value: 'Microsoft YaHei, sans-serif' },
  { label: '楷体', value: 'KaiTi, serif' },
];

// 预设字号
export const FONT_SIZES = [24, 32, 40, 48, 56, 64, 72, 96];

export interface PropertiesPanelProps {
  selectedClip: Clip | null;
  selectedKeyframeId: string | null;
  currentTime: number;
  onUpdateClip: (clipId: string, updates: Partial<Clip>) => void;
  onDeleteClip: () => void;
  onAddKeyframe: (clipId: string, clipLocalTime: number) => void;
  onUpdateKeyframe: (clipId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
}

export function usePropertiesPanelState(props: PropertiesPanelProps) {
  const { selectedClip, selectedKeyframeId, currentTime, onUpdateClip, onAddKeyframe, onUpdateKeyframe } = props;

  const clipLocalTime = selectedClip ? currentTime - selectedClip.start : 0;
  const isInClipRange = selectedClip && clipLocalTime >= 0 && clipLocalTime <= selectedClip.duration;

  const selectedKeyframe = useMemo(() => {
    if (!selectedClip?.keyframes || !selectedKeyframeId) return null;
    return selectedClip.keyframes.find(kf => kf.id === selectedKeyframeId) || null;
  }, [selectedClip, selectedKeyframeId]);

  const currentProps = useMemo(() => {
    if (!selectedClip) return null;
    if (selectedKeyframe) {
      return { x: selectedKeyframe.x, y: selectedKeyframe.y, scale: selectedKeyframe.scale, rotation: selectedKeyframe.rotation, opacity: selectedKeyframe.opacity };
    }
    if (hasKeyframes(selectedClip)) {
      return getAnimatedProperties(selectedClip, clipLocalTime);
    }
    return { x: selectedClip.x, y: selectedClip.y, scale: selectedClip.scale, rotation: selectedClip.rotation, opacity: selectedClip.opacity };
  }, [selectedClip, selectedKeyframe, clipLocalTime]);

  const keyframeAtCurrentTime = useMemo(() => {
    if (!selectedClip) return null;
    return getKeyframeAtTime(selectedClip, clipLocalTime, 0.05);
  }, [selectedClip, clipLocalTime]);

  const isTextClip = selectedClip?.type === MediaType.TEXT;
  const isAudioClip = selectedClip?.type === MediaType.AUDIO;
  const supportsKeyframes = selectedClip?.type === MediaType.VIDEO || selectedClip?.type === MediaType.IMAGE;
  const supportsAnimation = supportsKeyframes || isTextClip;

  const handlePropertyChange = useCallback((property: AnimatableProperty, value: number) => {
    if (!selectedClip) return;
    if (selectedKeyframe) {
      onUpdateKeyframe(selectedClip.id, selectedKeyframe.id, { [property]: value });
    } else if (hasKeyframes(selectedClip)) {
      if (keyframeAtCurrentTime) {
        onUpdateKeyframe(selectedClip.id, keyframeAtCurrentTime.id, { [property]: value });
      } else {
        onAddKeyframe(selectedClip.id, clipLocalTime);
      }
    } else {
      onUpdateClip(selectedClip.id, { [property]: value });
    }
  }, [selectedClip, selectedKeyframe, keyframeAtCurrentTime, clipLocalTime, onUpdateClip, onAddKeyframe, onUpdateKeyframe]);

  const handleTextUpdate = useCallback((updates: Partial<Clip>) => {
    if (selectedClip) onUpdateClip(selectedClip.id, updates);
  }, [selectedClip, onUpdateClip]);

  const handleFilterChange = useCallback((filterId: string) => {
    if (!selectedClip) return;
    if (filterId === 'none') {
      onUpdateClip(selectedClip.id, { filter: undefined });
    } else {
      const preset = FILTER_PRESETS.find(f => f.id === filterId);
      if (preset) {
        onUpdateClip(selectedClip.id, {
          filter: { id: preset.id, name: preset.name, resourceId: preset.resourceId, intensity: selectedClip.filter?.intensity ?? 1.0 }
        });
      }
    }
  }, [selectedClip, onUpdateClip]);

  const handleFilterIntensityChange = useCallback((intensity: number) => {
    if (selectedClip?.filter) {
      onUpdateClip(selectedClip.id, { filter: { ...selectedClip.filter, intensity } });
    }
  }, [selectedClip, onUpdateClip]);

  const handleAnimationChange = useCallback((type: 'in' | 'out', effectId: string) => {
    if (!selectedClip) return;
    const currentAnimations = selectedClip.animations || [];
    const filtered = currentAnimations.filter(a => a.type !== type);
    if (effectId === 'none') {
      onUpdateClip(selectedClip.id, { animations: filtered.length > 0 ? filtered : undefined });
    } else {
      const preset = ANIMATION_PRESETS.find(a => a.effectId === effectId);
      if (preset) {
        const newAnim: ClipAnimation = { type, effectId, name: preset.name, duration: currentAnimations.find(a => a.type === type)?.duration ?? 0.5 };
        onUpdateClip(selectedClip.id, { animations: [...filtered, newAnim] });
      }
    }
  }, [selectedClip, onUpdateClip]);

  const handleAnimationDurationChange = useCallback((type: 'in' | 'out', duration: number) => {
    if (!selectedClip) return;
    const currentAnimations = selectedClip.animations || [];
    const updated = currentAnimations.map(a => a.type === type ? { ...a, duration } : a);
    onUpdateClip(selectedClip.id, { animations: updated });
  }, [selectedClip, onUpdateClip]);

  const handleAudioFadeChange = useCallback((fadeIn?: number, fadeOut?: number) => {
    if (!selectedClip) return;
    const current = selectedClip.audioFade || { fadeIn: 0, fadeOut: 0 };
    const updated: AudioFade = { fadeIn: fadeIn ?? current.fadeIn, fadeOut: fadeOut ?? current.fadeOut };
    onUpdateClip(selectedClip.id, updated.fadeIn === 0 && updated.fadeOut === 0 ? { audioFade: undefined } : { audioFade: updated });
  }, [selectedClip, onUpdateClip]);

  const handleMaskTypeChange = useCallback((maskType: MaskType | 'none') => {
    if (!selectedClip) return;
    if (maskType === 'none') {
      onUpdateClip(selectedClip.id, { mask: undefined });
    } else {
      const current = selectedClip.mask;
      onUpdateClip(selectedClip.id, {
        mask: { type: maskType, centerX: current?.centerX ?? 0, centerY: current?.centerY ?? 0, size: current?.size ?? 0.5, rotation: current?.rotation ?? 0, feather: current?.feather ?? 0.1, invert: current?.invert ?? false }
      });
    }
  }, [selectedClip, onUpdateClip]);

  const handleMaskPropertyChange = useCallback((prop: keyof ClipMask, value: number | boolean) => {
    if (selectedClip?.mask) {
      onUpdateClip(selectedClip.id, { mask: { ...selectedClip.mask, [prop]: value } });
    }
  }, [selectedClip, onUpdateClip]);

  return {
    clipLocalTime, isInClipRange, selectedKeyframe, currentProps, keyframeAtCurrentTime,
    isTextClip, isAudioClip, supportsKeyframes, supportsAnimation,
    handlePropertyChange, handleTextUpdate,
    handleFilterChange, handleFilterIntensityChange,
    handleAnimationChange, handleAnimationDurationChange,
    handleAudioFadeChange, handleMaskTypeChange, handleMaskPropertyChange,
  };
}
