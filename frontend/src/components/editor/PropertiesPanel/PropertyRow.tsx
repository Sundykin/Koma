/**
 * 属性行组件
 * 支持数值输入和拖拽调整
 */
import React, { memo, useCallback, useRef, useState } from 'react';

interface PropertyRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  showKeyframeButton?: boolean;
  hasKeyframe?: boolean;
  onKeyframeToggle?: () => void;
}

export const PropertyRow = memo(function PropertyRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  showKeyframeButton,
  hasKeyframe,
  onKeyframeToggle,
}: PropertyRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; value: number } | null>(null);

  // 格式化显示值
  const formatValue = (val: number) => {
    if (step < 1) {
      return val.toFixed(2);
    }
    return Math.round(val).toString();
  };

  // 处理输入变更
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    if (!isNaN(newValue)) {
      onChange(Math.max(min, Math.min(max, newValue)));
    }
  }, [onChange, min, max]);

  // 处理输入失焦
  const handleInputBlur = useCallback(() => {
    // 确保值在范围内
    onChange(Math.max(min, Math.min(max, value)));
  }, [onChange, min, max, value]);

  // 处理拖拽开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();

    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, value };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = moveEvent.clientX - dragStartRef.current.x;
      // 根据 step 调整灵敏度
      const sensitivity = step < 1 ? 0.01 : step < 10 ? 1 : 10;
      const deltaValue = deltaX * sensitivity;
      const newValue = dragStartRef.current.value + deltaValue;

      onChange(Math.max(min, Math.min(max, newValue)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [value, onChange, min, max, step]);

  // 处理滚轮
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -step : step;
    onChange(Math.max(min, Math.min(max, value + delta)));
  }, [value, onChange, min, max, step]);

  return (
    <div className={`propertyRow ${isDragging ? 'dragging' : ''}`}>
      <label className="propertyLabel">{label}</label>

      <div className="propertyInput">
        <div
          className="inputDragArea"
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
        >
          <input
            ref={inputRef}
            type="number"
            value={formatValue(value)}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            min={min}
            max={max}
            step={step}
          />
          {unit && <span className="propertyUnit">{unit}</span>}
        </div>

        {showKeyframeButton && (
          <button
            className={`keyframeButton ${hasKeyframe ? 'active' : ''}`}
            onClick={onKeyframeToggle}
            title={hasKeyframe ? '删除关键帧' : '添加关键帧'}
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path
                d="M6 0L12 6L6 12L0 6Z"
                fill={hasKeyframe ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});

export default PropertyRow;
