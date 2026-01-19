/**
 * 关键帧右键菜单组件
 */
import React, { memo, useCallback, useEffect } from 'react';
import { EasingType } from '../../../types/track';

interface KeyframeContextMenuProps {
  x: number;
  y: number;
  keyframeTime: number;
  currentEasing: EasingType;
  onDelete: () => void;
  onCopy: () => void;
  onEasingChange: (easing: EasingType) => void;
  onClose: () => void;
}

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

export const KeyframeContextMenu = memo(function KeyframeContextMenu({
  x,
  y,
  keyframeTime,
  currentEasing,
  onDelete,
  onCopy,
  onEasingChange,
  onClose,
}: KeyframeContextMenuProps) {

  // 点击外部关闭
  useEffect(() => {
    const handleClick = () => onClose();
    const handleScroll = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleDelete = useCallback(() => {
    onDelete();
    onClose();
  }, [onDelete, onClose]);

  const handleCopy = useCallback(() => {
    onCopy();
    onClose();
  }, [onCopy, onClose]);

  const handleEasingSelect = useCallback((easing: EasingType) => {
    onEasingChange(easing);
    onClose();
  }, [onEasingChange, onClose]);

  return (
    <div
      className="keyframeContextMenu"
      style={{ left: x, top: y }}
      onClick={handleMenuClick}
    >
      {/* 标题 */}
      <div className="menuHeader">
        关键帧 @ {keyframeTime.toFixed(0)}f
      </div>

      <div className="menuDivider" />

      {/* 缓动设置 */}
      <div className="menuSection">
        <div className="menuSectionTitle">缓动曲线</div>
        {EASING_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={`menuItem ${currentEasing === option.value ? 'active' : ''}`}
            onClick={() => handleEasingSelect(option.value)}
          >
            {currentEasing === option.value && (
              <span className="menuCheck">✓</span>
            )}
            <span className={currentEasing === option.value ? '' : 'menuItemIndent'}>
              {option.label}
            </span>
          </button>
        ))}
      </div>

      <div className="menuDivider" />

      {/* 操作 */}
      <button className="menuItem" onClick={handleCopy}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        复制关键帧
      </button>

      <button className="menuItem danger" onClick={handleDelete}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        删除关键帧
      </button>
    </div>
  );
});

export default KeyframeContextMenu;
