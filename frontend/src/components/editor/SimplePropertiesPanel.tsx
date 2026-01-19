/**
 * 属性编辑面板
 * 迁移自 electron-egg
 */
import React, { useMemo } from 'react';
import { Clip, Keyframe, AnimatableProperty, MediaType } from '../../types/editor';
import { getAnimatedProperties, hasKeyframes, getKeyframeAtTime } from '../../engine/simpleKeyframe';
import { Trash2 } from 'lucide-react';

interface PropertiesPanelProps {
  selectedClip: Clip | null;
  selectedKeyframeId: string | null;
  currentTime: number;
  onUpdateClip: (clipId: string, updates: Partial<Clip>) => void;
  onDeleteClip: () => void;
  onAddKeyframe: (clipId: string, clipLocalTime: number) => void;
  onUpdateKeyframe: (clipId: string, keyframeId: string, updates: Partial<Keyframe>) => void;
}

export const SimplePropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedClip,
  selectedKeyframeId,
  currentTime,
  onUpdateClip,
  onDeleteClip,
  onAddKeyframe,
  onUpdateKeyframe
}) => {
  const clipLocalTime = selectedClip ? currentTime - selectedClip.start : 0;
  const isInClipRange = selectedClip && clipLocalTime >= 0 && clipLocalTime <= selectedClip.duration;

  const selectedKeyframe = useMemo(() => {
    if (!selectedClip?.keyframes || !selectedKeyframeId) return null;
    return selectedClip.keyframes.find(kf => kf.id === selectedKeyframeId) || null;
  }, [selectedClip, selectedKeyframeId]);

  const currentProps = useMemo(() => {
    if (!selectedClip) return null;
    if (selectedKeyframe) {
      return {
        x: selectedKeyframe.x,
        y: selectedKeyframe.y,
        scale: selectedKeyframe.scale,
        rotation: selectedKeyframe.rotation,
        opacity: selectedKeyframe.opacity
      };
    }
    if (hasKeyframes(selectedClip)) {
      return getAnimatedProperties(selectedClip, clipLocalTime);
    }
    return {
      x: selectedClip.x,
      y: selectedClip.y,
      scale: selectedClip.scale,
      rotation: selectedClip.rotation,
      opacity: selectedClip.opacity
    };
  }, [selectedClip, selectedKeyframe, clipLocalTime]);

  const keyframeAtCurrentTime = useMemo(() => {
    if (!selectedClip) return null;
    return getKeyframeAtTime(selectedClip, clipLocalTime, 0.05);
  }, [selectedClip, clipLocalTime]);

  if (!selectedClip || !currentProps) {
    return (
      <div className="w-72 bg-[#18181b] border-l border-[#27272a] p-6 flex flex-col items-center justify-center text-zinc-500">
        <div className="w-12 h-12 mb-4 opacity-20 border-2 border-current rounded" />
        <p className="text-sm">选择片段以编辑属性</p>
      </div>
    );
  }

  // 仅视频/图片支持关键帧
  const supportsKeyframes = selectedClip.type === MediaType.VIDEO || selectedClip.type === MediaType.IMAGE;

  const handlePropertyChange = (property: AnimatableProperty, value: number) => {
    if (selectedKeyframe) {
      onUpdateKeyframe(selectedClip.id, selectedKeyframe.id, { [property]: value });
    } else if (hasKeyframes(selectedClip)) {
      if (keyframeAtCurrentTime) {
        onUpdateKeyframe(selectedClip.id, keyframeAtCurrentTime.id, { [property]: value });
      } else {
        // 自动打帧时需要先创建关键帧，然后更新属性
        onAddKeyframe(selectedClip.id, clipLocalTime);
        // 属性会在下一帧更新
      }
    } else {
      onUpdateClip(selectedClip.id, { [property]: value });
    }
  };

  return (
    <div className="w-72 bg-[#18181b] border-l border-[#27272a] flex flex-col overflow-y-auto">
      <div className="p-3 border-b border-[#27272a] flex justify-between items-center">
        <h3 className="font-semibold text-zinc-100 text-sm">属性</h3>
        <button
          onClick={onDeleteClip}
          className="p-1.5 hover:bg-red-900/30 text-red-400 rounded transition-colors"
          title="删除片段"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 关键帧控制 */}
      {supportsKeyframes && (
        <div className="p-3 border-b border-[#27272a] space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">关键帧</h4>
            <span className="text-xs text-zinc-500">{clipLocalTime.toFixed(2)}s</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => isInClipRange && onAddKeyframe(selectedClip.id, clipLocalTime)}
              disabled={!isInClipRange}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors
                ${isInClipRange
                  ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 border border-yellow-500/50'
                  : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}
              `}
            >
              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5">
                <path d="M6 0L12 6L6 12L0 6Z" fill="currentColor" />
              </svg>
              添加关键帧
            </button>

            {keyframeAtCurrentTime && (
              <span className="text-xs text-cyan-400 flex items-center gap-1">
                <svg viewBox="0 0 12 12" className="w-2 h-2">
                  <path d="M6 0L12 6L6 12L0 6Z" fill="currentColor" />
                </svg>
                当前有帧
              </span>
            )}
          </div>

          {selectedKeyframe && (
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded p-1.5 text-xs text-cyan-300">
              已选中关键帧 @ {selectedKeyframe.time.toFixed(2)}s
            </div>
          )}

          {hasKeyframes(selectedClip) && (
            <div className="text-xs text-zinc-500">
              共 {selectedClip.keyframes?.length || 0} 个关键帧
              {(selectedClip.keyframes?.length || 0) < 2 && (
                <span className="text-yellow-500 ml-1">（需≥2个）</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="p-3 space-y-4">
        {/* 变换 */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">变换</h4>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400 flex justify-between">
              缩放 <span>{Math.round(currentProps.scale * 100)}%</span>
            </label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={currentProps.scale}
              onChange={(e) => handlePropertyChange('scale', parseFloat(e.target.value))}
              className="w-full accent-cyan-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">X</label>
              <input
                type="number"
                value={Math.round(currentProps.x)}
                onChange={(e) => handlePropertyChange('x', parseInt(e.target.value) || 0)}
                className="w-full bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-cyan-500 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Y</label>
              <input
                type="number"
                value={Math.round(currentProps.y)}
                onChange={(e) => handlePropertyChange('y', parseInt(e.target.value) || 0)}
                className="w-full bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-cyan-500 outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400">旋转</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="-180"
                max="180"
                value={currentProps.rotation}
                onChange={(e) => handlePropertyChange('rotation', parseInt(e.target.value))}
                className="flex-1 accent-cyan-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs w-8 text-right">{Math.round(currentProps.rotation)}°</span>
            </div>
          </div>
        </div>

        {/* 不透明度 */}
        <div className="space-y-3 pt-3 border-t border-[#27272a]">
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">混合</h4>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 flex justify-between">
              不透明度 <span>{Math.round(currentProps.opacity * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={currentProps.opacity}
              onChange={(e) => handlePropertyChange('opacity', parseFloat(e.target.value))}
              className="w-full accent-cyan-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        {/* 信息 */}
        <div className="pt-3 border-t border-[#27272a] text-xs text-zinc-500 space-y-1">
          <p>素材: <span className="text-zinc-300 truncate block">{selectedClip.name}</span></p>
          <p>时长: <span className="text-zinc-300">{selectedClip.duration.toFixed(1)}s</span></p>
          <p>起始: <span className="text-zinc-300">{selectedClip.start.toFixed(1)}s</span></p>
        </div>
      </div>
    </div>
  );
};

export default SimplePropertiesPanel;
