/**
 * 关键帧编辑器组件
 * 可视化编辑关键帧动画
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Button, Slider, Select, InputNumber, Tooltip, Space, Popover } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useTrackStore } from '../../store/trackStore';
import type { TrackKeyframe, EasingType, TrackItem } from '../../types/track';
import { nanoid } from 'nanoid';

interface KeyframeEditorProps {
  trackId: string;
  itemId: string;
}

const EASING_OPTIONS: { value: EasingType; label: string }[] = [
  { value: 'linear', label: '线性' },
  { value: 'ease-in', label: '缓入' },
  { value: 'ease-out', label: '缓出' },
  { value: 'ease-in-out', label: '缓入缓出' },
  { value: 'ease-in-cubic', label: '立方缓入' },
  { value: 'ease-out-cubic', label: '立方缓出' },
  { value: 'ease-in-out-cubic', label: '立方缓入缓出' },
];

const PROPERTIES = [
  { key: 'x', label: '位置 X', min: -1000, max: 1000, step: 1 },
  { key: 'y', label: '位置 Y', min: -1000, max: 1000, step: 1 },
  { key: 'scale', label: '缩放', min: 0.1, max: 5, step: 0.1 },
  { key: 'rotation', label: '旋转', min: -360, max: 360, step: 1 },
  { key: 'opacity', label: '透明度', min: 0, max: 1, step: 0.01 },
  { key: 'volume', label: '音量', min: 0, max: 1, step: 0.01 },
];

export function KeyframeEditor({ trackId, itemId }: KeyframeEditorProps) {
  const {
    currentTime,
    config,
    getItem,
    addKeyframe,
    removeKeyframe,
    updateKeyframe,
    updateItem,
  } = useTrackStore();

  const item = getItem(trackId, itemId);
  const keyframes = (item as any)?.keyframes as TrackKeyframe[] | undefined || [];

  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);

  // 当前帧相对于片段起点的时间（帧）
  const relativeFrame = currentTime - (item?.start || 0);
  const relativeTime = relativeFrame * (1000 / config.fps);

  // 检查当前时间是否有关键帧
  const currentKeyframe = useMemo(() => {
    return keyframes.find((kf) => Math.abs(kf.time - relativeTime) < 50);
  }, [keyframes, relativeTime]);

  // 添加关键帧
  const handleAddKeyframe = useCallback(() => {
    if (!item) return;

    const newKeyframe: TrackKeyframe = {
      id: nanoid(),
      time: relativeTime,
      x: (item as any).x ?? 0,
      y: (item as any).y ?? 0,
      scale: (item as any).scale ?? 1,
      rotation: (item as any).rotation ?? 0,
      opacity: (item as any).opacity ?? 1,
      volume: (item as any).volume ?? 1,
      easing: 'ease-in-out',
    };

    addKeyframe(trackId, itemId, newKeyframe);
    setSelectedKeyframeId(newKeyframe.id);
  }, [item, relativeTime, trackId, itemId, addKeyframe]);

  // 删除关键帧
  const handleDeleteKeyframe = useCallback((keyframeId: string) => {
    removeKeyframe(trackId, itemId, keyframeId);
    if (selectedKeyframeId === keyframeId) {
      setSelectedKeyframeId(null);
    }
  }, [trackId, itemId, removeKeyframe, selectedKeyframeId]);

  // 更新关键帧属性
  const handleUpdateKeyframe = useCallback((keyframeId: string, property: string, value: any) => {
    updateKeyframe(trackId, itemId, keyframeId, { [property]: value });
  }, [trackId, itemId, updateKeyframe]);

  // 获取可用属性
  const availableProperties = useMemo(() => {
    if (!item) return [];

    const props = PROPERTIES.filter((p) => {
      if (p.key === 'volume') {
        return item.type === 'audio';
      }
      if (['x', 'y', 'scale', 'rotation', 'opacity'].includes(p.key)) {
        return item.type === 'video' || item.type === 'image' || item.type === 'text';
      }
      return false;
    });

    return props;
  }, [item]);

  if (!item) return null;

  const selectedKf = selectedKeyframeId
    ? keyframes.find((kf) => kf.id === selectedKeyframeId)
    : currentKeyframe;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>关键帧</span>
        <Tooltip title={currentKeyframe ? '更新当前关键帧' : '添加关键帧'}>
          <Button
            type={currentKeyframe ? 'primary' : 'default'}
            size="small"
            icon={<KeyOutlined />}
            onClick={handleAddKeyframe}
          />
        </Tooltip>
      </div>

      {/* 关键帧列表 */}
      <div style={styles.keyframeList}>
        {keyframes.length === 0 ? (
          <div style={styles.empty}>暂无关键帧</div>
        ) : (
          keyframes.map((kf) => (
            <div
              key={kf.id}
              style={{
                ...styles.keyframeItem,
                ...(selectedKeyframeId === kf.id ? styles.keyframeItemSelected : {}),
              }}
              onClick={() => setSelectedKeyframeId(kf.id)}
            >
              <span style={styles.keyframeTime}>
                {Math.round(kf.time)}ms
              </span>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteKeyframe(kf.id);
                }}
              />
            </div>
          ))
        )}
      </div>

      {/* 选中关键帧的属性编辑 */}
      {selectedKf && (
        <div style={styles.propertyEditor}>
          <div style={styles.propertyRow}>
            <span style={styles.propertyLabel}>缓动</span>
            <Select
              size="small"
              value={selectedKf.easing}
              onChange={(v) => handleUpdateKeyframe(selectedKf.id, 'easing', v)}
              options={EASING_OPTIONS}
              style={{ width: 120 }}
            />
          </div>

          {availableProperties.map((prop) => (
            <div key={prop.key} style={styles.propertyRow}>
              <span style={styles.propertyLabel}>{prop.label}</span>
              <InputNumber
                size="small"
                min={prop.min}
                max={prop.max}
                step={prop.step}
                value={(selectedKf as any)[prop.key] ?? 0}
                onChange={(v) => handleUpdateKeyframe(selectedKf.id, prop.key, v)}
                style={{ width: 80 }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1f1f23',
    borderRadius: 6,
    padding: 12,
    fontSize: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#fafafa',
    fontWeight: 500,
  },
  keyframeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    maxHeight: 120,
    overflowY: 'auto',
    marginBottom: 12,
  },
  empty: {
    color: '#71717a',
    textAlign: 'center',
    padding: 12,
  },
  keyframeItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 8px',
    background: '#27272a',
    borderRadius: 4,
    cursor: 'pointer',
  },
  keyframeItemSelected: {
    background: '#3b82f6',
  },
  keyframeTime: {
    color: '#d4d4d8',
    fontFamily: 'monospace',
  },
  propertyEditor: {
    borderTop: '1px solid #3f3f46',
    paddingTop: 12,
  },
  propertyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  propertyLabel: {
    color: '#a1a1aa',
  },
};

export default KeyframeEditor;
