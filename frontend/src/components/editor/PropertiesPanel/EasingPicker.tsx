/**
 * 缓动选择器组件
 */
import React, { memo, useCallback, useRef, useEffect } from 'react';
import { EasingType } from '../../../types/track';
import { easingFunctions } from '../../../engine/keyframe';

// 缓动选项
const EASING_OPTIONS: { value: EasingType; label: string }[] = [
  { value: EasingType.LINEAR, label: '线性' },
  { value: EasingType.EASE_IN, label: '缓入' },
  { value: EasingType.EASE_OUT, label: '缓出' },
  { value: EasingType.EASE_IN_OUT, label: '缓入缓出' },
  { value: EasingType.EASE_IN_CUBIC, label: '缓入 (三次方)' },
  { value: EasingType.EASE_OUT_CUBIC, label: '缓出 (三次方)' },
  { value: EasingType.EASE_IN_OUT_CUBIC, label: '缓入缓出 (三次方)' },
];

interface EasingPickerProps {
  value: EasingType;
  onChange: (easing: EasingType) => void;
}

// 绘制缓动曲线预览
function drawEasingCurve(
  canvas: HTMLCanvasElement,
  easing: EasingType,
  isSelected: boolean
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 4;

  // 清除画布
  ctx.clearRect(0, 0, width, height);

  // 获取缓动函数
  const easingFn = easingFunctions[easing] || easingFunctions.linear;

  // 绘制曲线
  ctx.beginPath();
  ctx.strokeStyle = isSelected ? '#22d3ee' : '#71717a';
  ctx.lineWidth = 1.5;

  for (let i = 0; i <= width - padding * 2; i++) {
    const t = i / (width - padding * 2);
    const y = easingFn(t);
    const x = padding + i;
    const plotY = height - padding - y * (height - padding * 2);

    if (i === 0) {
      ctx.moveTo(x, plotY);
    } else {
      ctx.lineTo(x, plotY);
    }
  }

  ctx.stroke();

  // 绘制参考线（起点和终点）
  ctx.strokeStyle = isSelected ? 'rgba(34, 211, 238, 0.3)' : 'rgba(113, 113, 122, 0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);

  // 对角线参考
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width - padding, padding);
  ctx.stroke();

  ctx.setLineDash([]);
}

export const EasingPicker = memo(function EasingPicker({ value, onChange }: EasingPickerProps) {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value as EasingType);
  }, [onChange]);

  return (
    <div className="easingPicker">
      {/* 缓动曲线预览 */}
      <div className="easingPreview">
        <EasingPreviewCanvas easing={value} isSelected={true} />
      </div>

      {/* 下拉选择 */}
      <select
        className="easingSelect"
        value={value}
        onChange={handleChange}
      >
        {EASING_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {/* 缓动预设网格 */}
      <div className="easingGrid">
        {EASING_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={`easingGridItem ${value === option.value ? 'selected' : ''}`}
            onClick={() => onChange(option.value)}
            title={option.label}
          >
            <EasingPreviewCanvas easing={option.value} isSelected={value === option.value} />
          </button>
        ))}
      </div>
    </div>
  );
});

// 缓动预览画布组件
const EasingPreviewCanvas = memo(function EasingPreviewCanvas({
  easing,
  isSelected,
}: {
  easing: EasingType;
  isSelected: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawEasingCurve(canvasRef.current, easing, isSelected);
    }
  }, [easing, isSelected]);

  return (
    <canvas
      ref={canvasRef}
      width={48}
      height={32}
      className="easingCanvas"
    />
  );
});

export default EasingPicker;
