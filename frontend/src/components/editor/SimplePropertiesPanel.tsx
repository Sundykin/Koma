/**
 * 属性编辑面板（纯渲染层）
 * 状态与逻辑已拆分至 usePropertiesPanelState.ts
 */
import React from 'react';
import { MediaType } from '../../types/editor';
import { hasKeyframes } from '../../engine/simpleKeyframe';
import { Trash2, Type, Sparkles, Play, Volume2, Square } from 'lucide-react';
import {
  usePropertiesPanelState, PropertiesPanelProps,
  FILTER_PRESETS, ANIMATION_PRESETS, MASK_TYPES, FONT_FAMILIES, FONT_SIZES,
} from './usePropertiesPanelState';

export const SimplePropertiesPanel: React.FC<PropertiesPanelProps> = (props) => {
  const { selectedClip, onDeleteClip, onAddKeyframe } = props;
  const state = usePropertiesPanelState(props);
  const {
    clipLocalTime, isInClipRange, selectedKeyframe, currentProps, keyframeAtCurrentTime,
    isTextClip, isAudioClip, supportsKeyframes, supportsAnimation,
    handlePropertyChange, handleTextUpdate,
    handleFilterChange, handleFilterIntensityChange,
    handleAnimationChange, handleAnimationDurationChange,
    handleAudioFadeChange, handleMaskTypeChange, handleMaskPropertyChange,
  } = state;

  if (!selectedClip || !currentProps) {
    return (
      <div className="w-72 bg-[#18181b] border-l border-[#27272a] p-6 flex flex-col items-center justify-center text-zinc-500">
        <div className="w-12 h-12 mb-4 opacity-20 border-2 border-current rounded" />
        <p className="text-sm">选择片段以编辑属性</p>
      </div>
    );
  }

  return (
    <div className="w-72 bg-[#18181b] border-l border-[#27272a] flex flex-col overflow-y-auto">
      <div className="p-3 border-b border-[#27272a] flex justify-between items-center">
        <h3 className="font-semibold text-zinc-100 text-sm">属性</h3>
        <button onClick={onDeleteClip} className="p-1.5 hover:bg-red-900/30 text-red-400 rounded transition-colors" title="删除片段">
          <Trash2 size={14} />
        </button>
      </div>

      {/* 字幕编辑区 */}
      {isTextClip && (
        <div className="p-3 border-b border-[#27272a] space-y-3">
          <div className="flex items-center gap-2">
            <Type size={14} className="text-cyan-400" />
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">字幕</h4>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">文本内容</label>
            <textarea value={selectedClip.text || selectedClip.src || ''}
              onChange={(e) => handleTextUpdate({ text: e.target.value, src: e.target.value })}
              placeholder="输入字幕内容..." rows={3}
              className="w-full bg-[#27272a] border border-zinc-700 rounded px-2 py-1.5 text-xs focus:border-cyan-500 outline-none resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">字体</label>
              <select value={selectedClip.fontFamily || 'Arial, sans-serif'}
                onChange={(e) => handleTextUpdate({ fontFamily: e.target.value })}
                className="w-full bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-cyan-500 outline-none">
                {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">字号</label>
              <select value={selectedClip.fontSize || 48}
                onChange={(e) => handleTextUpdate({ fontSize: parseInt(e.target.value) })}
                className="w-full bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-cyan-500 outline-none">
                {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">文字颜色</label>
              <div className="flex items-center gap-1">
                <input type="color" value={selectedClip.fontColor || '#FFFFFF'}
                  onChange={(e) => handleTextUpdate({ fontColor: e.target.value })} className="w-8 h-6 rounded cursor-pointer border-0" />
                <input type="text" value={selectedClip.fontColor || '#FFFFFF'}
                  onChange={(e) => handleTextUpdate({ fontColor: e.target.value })}
                  className="flex-1 bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-cyan-500 outline-none" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">背景颜色</label>
              <div className="flex items-center gap-1">
                <input type="color" value={selectedClip.backgroundColor || '#000000'}
                  onChange={(e) => handleTextUpdate({ backgroundColor: e.target.value })} className="w-8 h-6 rounded cursor-pointer border-0" />
                <button onClick={() => handleTextUpdate({ backgroundColor: undefined })}
                  className="px-1.5 py-0.5 text-xs bg-zinc-700 rounded hover:bg-zinc-600" title="清除背景">×</button>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">位置</label>
            <div className="flex gap-1">
              {(['top', 'center', 'bottom'] as const).map(pos => (
                <button key={pos} onClick={() => handleTextUpdate({ textPosition: pos })}
                  className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                    (selectedClip.textPosition || 'bottom') === pos ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                  }`}>{pos === 'top' ? '顶部' : pos === 'center' ? '居中' : '底部'}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">对齐</label>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map(align => (
                <button key={align} onClick={() => handleTextUpdate({ textAlign: align })}
                  className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                    (selectedClip.textAlign || 'center') === align ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                  }`}>{align === 'left' ? '左' : align === 'center' ? '中' : '右'}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 关键帧控制 */}
      {supportsKeyframes && (
        <div className="p-3 border-b border-[#27272a] space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">关键帧</h4>
            <span className="text-xs text-zinc-500">{clipLocalTime.toFixed(2)}s</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => isInClipRange && onAddKeyframe(selectedClip.id, clipLocalTime)}
              disabled={!isInClipRange}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                isInClipRange ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 border border-yellow-500/50' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
              }`}>
              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5"><path d="M6 0L12 6L6 12L0 6Z" fill="currentColor" /></svg>
              添加关键帧
            </button>
            {keyframeAtCurrentTime && (
              <span className="text-xs text-cyan-400 flex items-center gap-1">
                <svg viewBox="0 0 12 12" className="w-2 h-2"><path d="M6 0L12 6L6 12L0 6Z" fill="currentColor" /></svg>当前有帧
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
              {(selectedClip.keyframes?.length || 0) < 2 && <span className="text-yellow-500 ml-1">（需≥2个）</span>}
            </div>
          )}
        </div>
      )}

      <div className="p-3 space-y-4">
        {/* 变换 */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">变换</h4>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 flex justify-between">缩放 <span>{Math.round(currentProps.scale * 100)}%</span></label>
            <input type="range" min="0.1" max="3" step="0.1" value={currentProps.scale}
              onChange={(e) => handlePropertyChange('scale', parseFloat(e.target.value))}
              className="w-full accent-cyan-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">X</label>
              <input type="number" value={Math.round(currentProps.x)}
                onChange={(e) => handlePropertyChange('x', parseInt(e.target.value) || 0)}
                className="w-full bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-cyan-500 outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Y</label>
              <input type="number" value={Math.round(currentProps.y)}
                onChange={(e) => handlePropertyChange('y', parseInt(e.target.value) || 0)}
                className="w-full bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-cyan-500 outline-none" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">旋转</label>
            <div className="flex items-center gap-2">
              <input type="range" min="-180" max="180" value={currentProps.rotation}
                onChange={(e) => handlePropertyChange('rotation', parseInt(e.target.value))}
                className="flex-1 accent-cyan-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer" />
              <span className="text-xs w-8 text-right">{Math.round(currentProps.rotation)}°</span>
            </div>
          </div>
        </div>

        {/* 不透明度 */}
        <div className="space-y-3 pt-3 border-t border-[#27272a]">
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">混合</h4>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 flex justify-between">不透明度 <span>{Math.round(currentProps.opacity * 100)}%</span></label>
            <input type="range" min="0" max="1" step="0.01" value={currentProps.opacity}
              onChange={(e) => handlePropertyChange('opacity', parseFloat(e.target.value))}
              className="w-full accent-cyan-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer" />
          </div>
        </div>

        {/* 滤镜 */}
        {supportsKeyframes && (
          <div className="space-y-3 pt-3 border-t border-[#27272a]">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-purple-400" />
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">滤镜</h4>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">滤镜效果</label>
              <select value={selectedClip.filter?.id || 'none'} onChange={(e) => handleFilterChange(e.target.value)}
                className="w-full bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-purple-500 outline-none">
                {FILTER_PRESETS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            {selectedClip.filter && (
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 flex justify-between">强度 <span>{Math.round((selectedClip.filter.intensity || 1) * 100)}%</span></label>
                <input type="range" min="0" max="1" step="0.01" value={selectedClip.filter.intensity || 1}
                  onChange={(e) => handleFilterIntensityChange(parseFloat(e.target.value))}
                  className="w-full accent-purple-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer" />
              </div>
            )}
          </div>
        )}

        {/* 动画 */}
        {supportsAnimation && (
          <div className="space-y-3 pt-3 border-t border-[#27272a]">
            <div className="flex items-center gap-2">
              <Play size={14} className="text-green-400" />
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">动画</h4>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">入场动画</label>
              <div className="flex gap-1">
                <select value={selectedClip.animations?.find(a => a.type === 'in')?.effectId || 'none'}
                  onChange={(e) => handleAnimationChange('in', e.target.value)}
                  className="flex-1 bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-green-500 outline-none">
                  <option value="none">无</option>
                  {ANIMATION_PRESETS.filter(a => a.type === 'in').map(a => <option key={a.effectId} value={a.effectId}>{a.name}</option>)}
                </select>
                {selectedClip.animations?.find(a => a.type === 'in') && (
                  <input type="number" value={selectedClip.animations.find(a => a.type === 'in')?.duration || 0.5}
                    onChange={(e) => handleAnimationDurationChange('in', parseFloat(e.target.value) || 0.5)}
                    min="0.1" max="5" step="0.1"
                    className="w-16 bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-green-500 outline-none" title="时长(秒)" />
                )}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">出场动画</label>
              <div className="flex gap-1">
                <select value={selectedClip.animations?.find(a => a.type === 'out')?.effectId || 'none'}
                  onChange={(e) => handleAnimationChange('out', e.target.value)}
                  className="flex-1 bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-green-500 outline-none">
                  <option value="none">无</option>
                  {ANIMATION_PRESETS.filter(a => a.type === 'out').map(a => <option key={a.effectId} value={a.effectId}>{a.name}</option>)}
                </select>
                {selectedClip.animations?.find(a => a.type === 'out') && (
                  <input type="number" value={selectedClip.animations.find(a => a.type === 'out')?.duration || 0.5}
                    onChange={(e) => handleAnimationDurationChange('out', parseFloat(e.target.value) || 0.5)}
                    min="0.1" max="5" step="0.1"
                    className="w-16 bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-green-500 outline-none" title="时长(秒)" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* 音频淡入淡出 */}
        {isAudioClip && (
          <div className="space-y-3 pt-3 border-t border-[#27272a]">
            <div className="flex items-center gap-2">
              <Volume2 size={14} className="text-orange-400" />
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">音频效果</h4>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 flex justify-between">淡入 <span>{(selectedClip.audioFade?.fadeIn || 0).toFixed(1)}s</span></label>
              <input type="range" min="0" max="3" step="0.1" value={selectedClip.audioFade?.fadeIn || 0}
                onChange={(e) => handleAudioFadeChange(parseFloat(e.target.value), undefined)}
                className="w-full accent-orange-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 flex justify-between">淡出 <span>{(selectedClip.audioFade?.fadeOut || 0).toFixed(1)}s</span></label>
              <input type="range" min="0" max="3" step="0.1" value={selectedClip.audioFade?.fadeOut || 0}
                onChange={(e) => handleAudioFadeChange(undefined, parseFloat(e.target.value))}
                className="w-full accent-orange-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer" />
            </div>
          </div>
        )}

        {/* 蒙版 */}
        {supportsKeyframes && (
          <div className="space-y-3 pt-3 border-t border-[#27272a]">
            <div className="flex items-center gap-2">
              <Square size={14} className="text-blue-400" />
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">蒙版</h4>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">蒙版类型</label>
              <select value={selectedClip.mask?.type || 'none'}
                onChange={(e) => handleMaskTypeChange(e.target.value as any)}
                className="w-full bg-[#27272a] border border-zinc-700 rounded px-2 py-1 text-xs focus:border-blue-500 outline-none">
                <option value="none">无</option>
                {MASK_TYPES.map(m => <option key={m.type} value={m.type}>{m.name}</option>)}
              </select>
            </div>
            {selectedClip.mask && (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 flex justify-between">大小 <span>{Math.round((selectedClip.mask.size || 0.5) * 100)}%</span></label>
                  <input type="range" min="0" max="1" step="0.01" value={selectedClip.mask.size || 0.5}
                    onChange={(e) => handleMaskPropertyChange('size', parseFloat(e.target.value))}
                    className="w-full accent-blue-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 flex justify-between">羽化 <span>{Math.round((selectedClip.mask.feather || 0) * 100)}%</span></label>
                  <input type="range" min="0" max="1" step="0.01" value={selectedClip.mask.feather || 0}
                    onChange={(e) => handleMaskPropertyChange('feather', parseFloat(e.target.value))}
                    className="w-full accent-blue-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 flex justify-between">旋转 <span>{Math.round(selectedClip.mask.rotation || 0)}°</span></label>
                  <input type="range" min="-180" max="180" step="1" value={selectedClip.mask.rotation || 0}
                    onChange={(e) => handleMaskPropertyChange('rotation', parseInt(e.target.value))}
                    className="w-full accent-blue-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="maskInvert" checked={selectedClip.mask.invert || false}
                    onChange={(e) => handleMaskPropertyChange('invert', e.target.checked)} className="accent-blue-500" />
                  <label htmlFor="maskInvert" className="text-xs text-zinc-400">反转蒙版</label>
                </div>
              </>
            )}
          </div>
        )}

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
