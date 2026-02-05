/**
 * 属性面板组件
 * 编辑选中片段的变换属性和关键帧
 */
import React, { memo, useCallback, useMemo } from 'react';
import { useTrackStore } from '../../../store/trackStore';
import { TransformProperties, EasingType, TrackKeyframe } from '../../../types/track';
import { hasKeyframeAt } from '../../../engine/keyframe';
import PropertyRow from './PropertyRow';
import EasingPicker from './EasingPicker';
import './styles.css';

// 属性配置
const TRANSFORM_PROPERTIES: {
  key: keyof TransformProperties;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}[] = [
  { key: 'x', label: '位置 X', min: -2000, max: 2000, step: 1, unit: 'px' },
  { key: 'y', label: '位置 Y', min: -2000, max: 2000, step: 1, unit: 'px' },
  { key: 'scale', label: '缩放', min: 0.1, max: 5, step: 0.01 },
  { key: 'rotation', label: '旋转', min: -360, max: 360, step: 1, unit: '°' },
  { key: 'opacity', label: '不透明度', min: 0, max: 1, step: 0.01 },
];

interface PropertiesPanelProps {
  className?: string;
}

export const PropertiesPanel = memo(function PropertiesPanel({ className }: PropertiesPanelProps) {
  const {
    tracks,
    selectedTrackId,
    selectedItemId,
    selectedKeyframeId,
    currentTime,
    config,
    selectKeyframe,
    addKeyframeToItem,
    removeKeyframeFromItem,
    updateItemTransform,
    updateKeyframeEasingInItem,
    getAnimatedPropertiesAtTime,
  } = useTrackStore();

  // 获取选中的片段
  const selectedItem = useMemo(() => {
    if (!selectedTrackId || !selectedItemId) return null;
    const track = tracks.find(t => t.id === selectedTrackId);
    return track?.items.find(i => i.id === selectedItemId) || null;
  }, [tracks, selectedTrackId, selectedItemId]);

  // 获取选中的关键帧
  const selectedKeyframe = useMemo(() => {
    if (!selectedItem || !selectedKeyframeId) return null;
    const item = selectedItem as any;
    return item.keyframes?.find((kf: TrackKeyframe) => kf.id === selectedKeyframeId) || null;
  }, [selectedItem, selectedKeyframeId]);

  // 检查是否支持关键帧（视频、图片）
  const supportsKeyframes = useMemo(() => {
    return selectedItem && (selectedItem.type === 'video' || selectedItem.type === 'image');
  }, [selectedItem]);

  // 获取当前时间的属性值（考虑关键帧插值）
  const currentProperties = useMemo(() => {
    if (!selectedItem || !selectedTrackId || !selectedItemId) return null;
    return getAnimatedPropertiesAtTime(selectedTrackId, selectedItemId, currentTime);
  }, [selectedItem, selectedTrackId, selectedItemId, currentTime, getAnimatedPropertiesAtTime]);

  // 检查当前时间是否有关键帧
  const keyframeAtCurrentTime = useMemo(() => {
    if (!selectedItem || !supportsKeyframes) return null;
    const item = selectedItem as any;
    const localTime = currentTime - item.start;
    return hasKeyframeAt(item.keyframes, localTime, 1);
  }, [selectedItem, supportsKeyframes, currentTime]);

  // 处理属性值变更
  const handlePropertyChange = useCallback((property: keyof TransformProperties, value: number) => {
    if (!selectedTrackId || !selectedItemId) return;

    // 检查是否有关键帧，如果有则启用自动打帧
    const item = selectedItem as any;
    const hasKeyframes = item?.keyframes && item.keyframes.length > 0;

    updateItemTransform(selectedTrackId, selectedItemId, property, value, hasKeyframes);
  }, [selectedTrackId, selectedItemId, selectedItem, updateItemTransform]);

  // 处理添加/删除关键帧
  const handleToggleKeyframe = useCallback((_property: keyof TransformProperties) => {
    if (!selectedTrackId || !selectedItemId || !selectedItem) return;

    const item = selectedItem as any;
    const localTime = currentTime - item.start;
    const existingKf = hasKeyframeAt(item.keyframes, localTime, 1);

    if (existingKf) {
      // 删除关键帧
      removeKeyframeFromItem(selectedTrackId, selectedItemId, existingKf.id);
    } else {
      // 添加关键帧
      const kf = addKeyframeToItem(selectedTrackId, selectedItemId, localTime);
      if (kf) {
        selectKeyframe(kf.id);
      }
    }
  }, [selectedTrackId, selectedItemId, selectedItem, currentTime, addKeyframeToItem, removeKeyframeFromItem, selectKeyframe]);

  // 处理缓动变更
  const handleEasingChange = useCallback((easing: EasingType) => {
    if (!selectedTrackId || !selectedItemId || !selectedKeyframeId) return;
    updateKeyframeEasingInItem(selectedTrackId, selectedItemId, selectedKeyframeId, easing);
  }, [selectedTrackId, selectedItemId, selectedKeyframeId, updateKeyframeEasingInItem]);

  // 没有选中片段时显示提示
  if (!selectedItem) {
    return (
      <div className={`propertiesPanel empty ${className || ''}`}>
        <div className="emptyMessage">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <p>选中一个片段以编辑属性</p>
        </div>
      </div>
    );
  }

  const item = selectedItem as any;

  return (
    <div className={`propertiesPanel ${className || ''}`}>
      {/* 片段信息 */}
      <div className="panelSection">
        <div className="sectionHeader">
          <span className="sectionTitle">片段信息</span>
        </div>
        <div className="itemInfo">
          <span className="itemName">{item.name}</span>
          <span className="itemType">{item.type}</span>
        </div>
      </div>

      {/* 变换属性 */}
      <div className="panelSection">
        <div className="sectionHeader">
          <span className="sectionTitle">变换</span>
          {supportsKeyframes && (
            <span className="keyframeHint">
              {keyframeAtCurrentTime ? '◆ 当前帧有关键帧' : '◇ 点击菱形添加关键帧'}
            </span>
          )}
        </div>

        {TRANSFORM_PROPERTIES.map((prop) => (
          <PropertyRow
            key={prop.key}
            label={prop.label}
            value={currentProperties?.[prop.key] ?? item[prop.key] ?? 0}
            min={prop.min}
            max={prop.max}
            step={prop.step}
            unit={prop.unit}
            onChange={(value) => handlePropertyChange(prop.key, value)}
            showKeyframeButton={supportsKeyframes}
            hasKeyframe={!!keyframeAtCurrentTime}
            onKeyframeToggle={() => handleToggleKeyframe(prop.key)}
          />
        ))}
      </div>

      {/* 缓动设置（仅在选中关键帧时显示） */}
      {selectedKeyframe && (
        <div className="panelSection">
          <div className="sectionHeader">
            <span className="sectionTitle">关键帧缓动</span>
          </div>
          <EasingPicker
            value={selectedKeyframe.easing}
            onChange={handleEasingChange}
          />
        </div>
      )}

      {/* 关键帧列表 */}
      {supportsKeyframes && item.keyframes && item.keyframes.length > 0 && (
        <div className="panelSection">
          <div className="sectionHeader">
            <span className="sectionTitle">关键帧列表</span>
            <span className="keyframeCount">{item.keyframes.length}</span>
          </div>
          <div className="keyframeList">
            {[...item.keyframes]
              .sort((a: TrackKeyframe, b: TrackKeyframe) => a.time - b.time)
              .map((kf: TrackKeyframe) => (
                <div
                  key={kf.id}
                  className={`keyframeItem ${selectedKeyframeId === kf.id ? 'selected' : ''}`}
                  onClick={() => selectKeyframe(kf.id)}
                >
                  <span className="keyframeDiamond">◆</span>
                  <span className="keyframeTime">
                    {((item.start + kf.time) / config.fps).toFixed(2)}s
                  </span>
                  <span className="keyframeEasing">{kf.easing}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default PropertiesPanel;
