/**
 * 属性编辑面板
 * 编辑选中 Clip 的变换、关键帧等属性
 */
import React from 'react';
import { Form, InputNumber, Slider, Input, Select, Collapse, Empty, Space, Button, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Clip, Timeline, Keyframe, EasingType } from '../../types';
import { addKeyframe, removeKeyframe } from '../../engine/keyframe';
import { v4 as uuid } from 'uuid';

interface PropertiesPanelProps {
  clip: Clip | null;
  timeline: Timeline | null;
  onChange: (clip: Clip) => void;
}

const EASING_OPTIONS: { value: EasingType; label: string }[] = [
  { value: 'linear', label: '线性' },
  { value: 'ease-in', label: '渐入' },
  { value: 'ease-out', label: '渐出' },
  { value: 'ease-in-out', label: '渐入渐出' },
];

export function PropertiesPanel({ clip, timeline, onChange }: PropertiesPanelProps) {
  if (!clip) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="选择一个片段以编辑属性"
        style={{ marginTop: 40 }}
      />
    );
  }

  const handleChange = (field: string, value: any) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      onChange({
        ...clip,
        [parent]: {
          ...(clip as any)[parent],
          [child]: value,
        },
      });
    } else {
      onChange({ ...clip, [field]: value });
    }
  };

  const handleAddKeyframe = (property: string, currentValue: number) => {
    // 默认在当前 clip 中间位置添加关键帧
    const time = clip.duration / 2;
    const newKf: Keyframe = {
      id: uuid(),
      time,
      property,
      value: currentValue,
      easing: 'ease-in-out',
    };
    onChange({ ...clip, keyframes: addKeyframe(clip.keyframes, newKf) });
  };

  const handleRemoveKeyframe = (keyframeId: string) => {
    onChange({ ...clip, keyframes: removeKeyframe(clip.keyframes, keyframeId) });
  };

  const handleKeyframeChange = (keyframeId: string, field: string, value: any) => {
    onChange({
      ...clip,
      keyframes: clip.keyframes.map((kf) =>
        kf.id === keyframeId ? { ...kf, [field]: value } : kf
      ),
    });
  };

  const getPropertyKeyframes = (property: string) =>
    clip.keyframes.filter((kf) => kf.property === property);

  return (
    <div style={styles.container}>
      <Collapse
        defaultActiveKey={['basic', 'transform']}
        ghost
        items={[
          {
            key: 'basic',
            label: '基本信息',
            children: (
              <Form layout="vertical" size="small">
                <Form.Item label="名称">
                  <Input
                    value={clip.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                  />
                </Form.Item>
                <Form.Item label="开始时间 (ms)">
                  <InputNumber
                    value={clip.startTime}
                    onChange={(v) => handleChange('startTime', v || 0)}
                    min={0}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Form.Item label="持续时长 (ms)">
                  <InputNumber
                    value={clip.duration}
                    onChange={(v) => handleChange('duration', v || 100)}
                    min={100}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'transform',
            label: '变换',
            children: (
              <Form layout="vertical" size="small">
                <PropertyRow
                  label="位置 X"
                  property="position.x"
                  value={clip.position.x}
                  onChange={(v) => handleChange('position.x', v)}
                  keyframes={getPropertyKeyframes('position.x')}
                  onAddKeyframe={() => handleAddKeyframe('position.x', clip.position.x)}
                  onRemoveKeyframe={handleRemoveKeyframe}
                  onKeyframeChange={handleKeyframeChange}
                />
                <PropertyRow
                  label="位置 Y"
                  property="position.y"
                  value={clip.position.y}
                  onChange={(v) => handleChange('position.y', v)}
                  keyframes={getPropertyKeyframes('position.y')}
                  onAddKeyframe={() => handleAddKeyframe('position.y', clip.position.y)}
                  onRemoveKeyframe={handleRemoveKeyframe}
                  onKeyframeChange={handleKeyframeChange}
                />
                <PropertyRow
                  label="缩放"
                  property="scale"
                  value={clip.scale}
                  onChange={(v) => handleChange('scale', v)}
                  keyframes={getPropertyKeyframes('scale')}
                  onAddKeyframe={() => handleAddKeyframe('scale', clip.scale)}
                  onRemoveKeyframe={handleRemoveKeyframe}
                  onKeyframeChange={handleKeyframeChange}
                  step={0.01}
                  min={0.01}
                />
                <PropertyRow
                  label="旋转"
                  property="rotation"
                  value={clip.rotation}
                  onChange={(v) => handleChange('rotation', v)}
                  keyframes={getPropertyKeyframes('rotation')}
                  onAddKeyframe={() => handleAddKeyframe('rotation', clip.rotation)}
                  onRemoveKeyframe={handleRemoveKeyframe}
                  onKeyframeChange={handleKeyframeChange}
                />
                <PropertyRow
                  label="不透明度"
                  property="opacity"
                  value={clip.opacity}
                  onChange={(v) => handleChange('opacity', v)}
                  keyframes={getPropertyKeyframes('opacity')}
                  onAddKeyframe={() => handleAddKeyframe('opacity', clip.opacity)}
                  onRemoveKeyframe={handleRemoveKeyframe}
                  onKeyframeChange={handleKeyframeChange}
                  step={0.01}
                  min={0}
                  max={1}
                  useSlider
                />
              </Form>
            ),
          },
          clip.type === 'subtitle' && {
            key: 'text',
            label: '文字样式',
            children: (
              <Form layout="vertical" size="small">
                <Form.Item label="文字内容">
                  <Input.TextArea
                    value={clip.text}
                    onChange={(e) => handleChange('text', e.target.value)}
                    rows={2}
                  />
                </Form.Item>
                <Form.Item label="字号">
                  <InputNumber
                    value={clip.fontSize || 32}
                    onChange={(v) => handleChange('fontSize', v)}
                    min={12}
                    max={200}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Form.Item label="字体">
                  <Input
                    value={clip.fontFamily || 'sans-serif'}
                    onChange={(e) => handleChange('fontFamily', e.target.value)}
                  />
                </Form.Item>
                <Form.Item label="颜色">
                  <Input
                    type="color"
                    value={clip.fontColor || '#ffffff'}
                    onChange={(e) => handleChange('fontColor', e.target.value)}
                    style={{ width: 60, padding: 0 }}
                  />
                </Form.Item>
              </Form>
            ),
          },
        ].filter(Boolean) as any}
      />
    </div>
  );
}

interface PropertyRowProps {
  label: string;
  property: string;
  value: number;
  onChange: (value: number) => void;
  keyframes: Keyframe[];
  onAddKeyframe: () => void;
  onRemoveKeyframe: (id: string) => void;
  onKeyframeChange: (id: string, field: string, value: any) => void;
  step?: number;
  min?: number;
  max?: number;
  useSlider?: boolean;
}

function PropertyRow({
  label,
  property,
  value,
  onChange,
  keyframes,
  onAddKeyframe,
  onRemoveKeyframe,
  onKeyframeChange,
  step = 1,
  min,
  max,
  useSlider,
}: PropertyRowProps) {
  const hasKeyframes = keyframes.length > 0;

  return (
    <div style={styles.propertyRow}>
      <div style={styles.propertyHeader}>
        <span>{label}</span>
        <Tooltip title={hasKeyframes ? '已有关键帧' : '添加关键帧'}>
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={onAddKeyframe}
            style={{ color: hasKeyframes ? '#10b981' : '#71717a' }}
          />
        </Tooltip>
      </div>
      {useSlider ? (
        <Slider
          value={value}
          onChange={onChange}
          step={step}
          min={min ?? 0}
          max={max ?? 100}
        />
      ) : (
        <InputNumber
          value={value}
          onChange={(v) => onChange(v ?? 0)}
          step={step}
          min={min}
          max={max}
          style={{ width: '100%' }}
        />
      )}
      {hasKeyframes && (
        <div style={styles.keyframeList}>
          {keyframes.map((kf) => (
            <div key={kf.id} style={styles.keyframeItem}>
              <InputNumber
                size="small"
                value={kf.time}
                onChange={(v) => onKeyframeChange(kf.id, 'time', v || 0)}
                placeholder="时间"
                style={{ width: 70 }}
              />
              <InputNumber
                size="small"
                value={kf.value}
                onChange={(v) => onKeyframeChange(kf.id, 'value', v ?? 0)}
                step={step}
                placeholder="值"
                style={{ width: 70 }}
              />
              <Select
                size="small"
                value={kf.easing}
                onChange={(v) => onKeyframeChange(kf.id, 'easing', v)}
                options={EASING_OPTIONS}
                style={{ width: 80 }}
              />
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => onRemoveKeyframe(kf.id)}
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
    padding: 8,
    overflowY: 'auto',
  },
  propertyRow: {
    marginBottom: 12,
  },
  propertyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    fontSize: 12,
    color: '#a1a1aa',
  },
  keyframeList: {
    marginTop: 8,
    padding: 8,
    background: '#0f0f11',
    borderRadius: 4,
  },
  keyframeItem: {
    display: 'flex',
    gap: 4,
    marginBottom: 4,
    alignItems: 'center',
  },
};

export default PropertiesPanel;
