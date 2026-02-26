/**
 * 简洁版时间线组件（纯渲染层）
 * 状态与逻辑已拆分至 useTimelineState.ts
 */
import React from 'react';
import { Clip, MediaType, EasingType } from '../../types/editor';
import { toKomaLocalUrl } from '../../utils/urlUtils';
import {
  Play, Pause, Film, Music, Type, Trash2, Copy, ZoomIn, ZoomOut, Magnet,
  Volume2, VolumeX, Eye, EyeOff
} from 'lucide-react';
import {
  useTimelineState, TimelineProps, formatTime,
  TRACK_HEIGHT, CLIP_HEIGHT, HEADER_WIDTH, RULER_HEIGHT,
  ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, ZOOM_PRESETS,
} from './useTimelineState';

// 缓动选项
const EASING_OPTIONS: { value: EasingType; label: string }[] = [
  { value: EasingType.LINEAR, label: '线性' },
  { value: EasingType.EASE_IN, label: '缓入' },
  { value: EasingType.EASE_OUT, label: '缓出' },
  { value: EasingType.EASE_IN_OUT, label: '缓入缓出' },
  { value: EasingType.EASE_IN_CUBIC, label: '三次缓入' },
  { value: EasingType.EASE_OUT_CUBIC, label: '三次缓出' },
  { value: EasingType.EASE_IN_OUT_CUBIC, label: '三次缓入缓出' },
];

// Filmstrip 组件
const Filmstrip: React.FC<{ clip: Clip; frames?: string[]; pixelsPerSecond: number }> = ({ clip, frames, pixelsPerSecond }) => {
  if (clip.type === MediaType.TEXT) {
    return (
      <div className="w-full h-full flex items-center px-2 pointer-events-none overflow-hidden bg-purple-900/40">
        <span className="text-[10px] text-zinc-200 truncate">{clip.name}</span>
      </div>
    );
  }

  if (clip.type === MediaType.AUDIO) {
    return (
      <div className="w-full h-full flex items-center overflow-hidden bg-green-900/40 pointer-events-none px-1">
        <div className="flex gap-0.5 h-1/2 w-full items-center">
          {Array.from({ length: Math.ceil(clip.duration * 5) }).map((_, i) => (
            <div key={i} className="w-1 bg-green-400/50 rounded-full flex-shrink-0" style={{ height: `${20 + Math.random() * 80}%` }} />
          ))}
        </div>
        <span className="absolute left-2 text-[10px] text-zinc-300 drop-shadow truncate">{clip.name}</span>
      </div>
    );
  }

  const frameAspectRatio = 16 / 9;
  const frameWidth = CLIP_HEIGHT * frameAspectRatio;
  const totalWidth = clip.duration * pixelsPerSecond;
  const frameCount = Math.max(1, Math.ceil(totalWidth / frameWidth));
  const hasFrames = frames && frames.length > 0;
  const fallbackSrc = toKomaLocalUrl(clip.src);
  const extractFps = 1;
  const timePerFrame = frameWidth / pixelsPerSecond;

  return (
    <div className="flex h-full w-full pointer-events-none select-none overflow-hidden bg-blue-900/20">
      {Array.from({ length: frameCount }).map((_, i) => {
        const positionTime = i * timePerFrame;
        let frameIndex = Math.floor(positionTime * extractFps);
        if (hasFrames) frameIndex = Math.min(frameIndex, frames.length - 1);
        const frameSrc = hasFrames ? frames[frameIndex] : fallbackSrc;
        return (
          <div key={i} className="flex-shrink-0 h-full border-r border-white/20 relative bg-zinc-800" style={{ width: frameWidth }}>
            <img src={frameSrc} className="w-full h-full object-cover opacity-90" alt="" draggable={false}
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
            <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 to-blue-800/20 -z-10" />
          </div>
        );
      })}
      <span className="absolute top-1 left-2 text-[10px] text-white font-medium truncate px-1 drop-shadow-md z-10 bg-black/40 rounded">
        {clip.name}
      </span>
    </div>
  );
};

export const SimpleTimeline: React.FC<TimelineProps> = (props) => {
  const {
    tracks, currentTime, duration, onSeek, selectedClipId, onSelectClip,
    onDeleteClip, onAddKeyframe, onSelectKeyframe, onDeleteKeyframe,
    onDuplicateClip, onUpdateKeyframeEasing, selectedKeyframeId,
    isPlaying, togglePlay, onDeleteTrack, onUpdateTrack,
    draggingAsset, onExport
  } = props;

  const state = useTimelineState(props);
  const {
    containerRef, rulerRef,
    zoom, setZoom, snapEnabled, setSnapEnabled, snapLine,
    pixelsPerSecond,
    isDraggingPlayhead, playheadPositionRef, playheadX,
    handlePlayheadMouseDown,
    totalWidth, highlightedTrackId, mousePos,
    dragState,
    handleClipMouseDown, handleResizeMouseDown,
    handleDragOver, handleDrop,
    contextMenu, closeContextMenu,
    handleClipContextMenu, handleKeyframeContextMenu,
    editingTrackId, setEditingTrackId, editingTrackName, setEditingTrackName,
    handleZoomIn, handleZoomOut, handleZoomPreset,
    frameMap, markers,
  } = state;

  return (
    <div className="flex flex-col h-full bg-[#18181b] border-t border-[#27272a] select-none">
      {/* 工具栏 */}
      <div className="h-10 border-b border-[#27272a] flex items-center px-4 justify-between bg-[#18181b] flex-shrink-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={togglePlay} className="text-zinc-300 hover:text-white transition-colors">
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <span className="text-xs font-mono text-cyan-400">{formatTime(currentTime)}</span>
          <span className="text-xs text-zinc-600">/</span>
          <span className="text-xs font-mono text-zinc-500">{formatTime(duration)}</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setSnapEnabled(!snapEnabled)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
              snapEnabled ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`} title="吸附对齐">
            <Magnet size={12} /><span>吸附</span>
          </button>
          <div className="flex items-center gap-1 bg-zinc-800 rounded px-1">
            <button onClick={handleZoomOut} className="p-1 text-zinc-400 hover:text-white transition-colors" title="缩小"><ZoomOut size={14} /></button>
            <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-20 h-1 accent-cyan-500 cursor-pointer" />
            <button onClick={handleZoomIn} className="p-1 text-zinc-400 hover:text-white transition-colors" title="放大"><ZoomIn size={14} /></button>
            <span className="text-xs text-zinc-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
          </div>
          <div className="flex gap-0.5">
            {ZOOM_PRESETS.map(preset => (
              <button key={preset} onClick={() => handleZoomPreset(preset)}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                  Math.abs(zoom - preset) < 0.05 ? 'bg-cyan-500/30 text-cyan-300' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}>{preset}x</button>
            ))}
          </div>
          <span className="text-xs text-zinc-400">{tracks.length} 轨道</span>
          {onExport && (
            <button onClick={onExport} className="ml-2 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded transition-colors">导出</button>
          )}
        </div>
      </div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-auto bg-[#09090b] relative" ref={containerRef}
        onDragOver={(e) => handleDragOver(e)} onDrop={(e) => handleDrop(e)}>
        <div className="min-w-max pb-32" style={{ minWidth: totalWidth + HEADER_WIDTH }}>
          {/* 时间标尺 */}
          <div ref={rulerRef} className="sticky top-0 z-30 flex bg-[#0f0f10] border-b border-zinc-800" style={{ height: RULER_HEIGHT }}>
            <div className="sticky left-0 w-[200px] flex-shrink-0 bg-[#18181b] border-r border-[#27272a] z-40" />
            <div className="relative flex-1 h-full" style={{ width: totalWidth }}>
              {markers.map(m => m.isMain ? (
                <div key={m.key} className="absolute top-0 h-full flex flex-col justify-end pb-1 select-none pointer-events-none" style={{ left: m.left }}>
                  <div className="h-3 border-l border-zinc-500" />
                  <span className="text-[10px] text-zinc-500 pl-1 whitespace-nowrap">{m.label}</span>
                </div>
              ) : (
                <div key={m.key} className="absolute top-0 h-full flex flex-col justify-end pb-1 select-none pointer-events-none" style={{ left: m.left }}>
                  <div className="h-2 border-l border-zinc-700" />
                </div>
              ))}
              <div className="absolute top-0 z-50" style={{ left: currentTime * pixelsPerSecond }}>
                <div className={`absolute top-0 left-0 -translate-x-1/2 transition-transform ${isDraggingPlayhead ? 'scale-110 cursor-grabbing' : 'hover:scale-105 cursor-grab'}`}
                  onMouseDown={handlePlayheadMouseDown}>
                  <svg width="12" height="16" viewBox="0 0 12 16">
                    <path d="M1 1C1 0.447715 1.44772 0 2 0H10C10.5523 0 11 0.447715 11 1V11.382C11 11.7607 10.786 12.107 10.4472 12.2764L6.44721 14.2764C6.16569 14.4172 5.83431 14.4172 5.55279 14.2764L1.55279 12.2764C1.214 12.107 1 11.7607 1 11.382V1Z" fill="#22d3ee" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* 轨道列表 */}
          {tracks.map((track, index) => (
            <div key={track.id} data-track-id={track.id}
              className={`flex border-b border-[#27272a]/30 group/track relative transition-all ${
                highlightedTrackId === track.id ? 'bg-cyan-500/20 ring-1 ring-cyan-500/50' : 'bg-zinc-900/20 hover:bg-zinc-900/40'
              } ${track.isMainTrack ? 'border-l-4 border-l-blue-500' : ''}`}
              style={{ height: TRACK_HEIGHT }}
              onDragOver={(e) => handleDragOver(e, track.id)} onDrop={(e) => handleDrop(e, track.id)}>
              {/* 轨道头部 */}
              <div className="sticky left-0 w-[200px] flex-shrink-0 bg-[#18181b] border-r border-[#27272a] z-20 flex flex-col justify-center px-3">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium flex-1 min-w-0">
                    {track.type === 'video' && <Film size={14} className="text-blue-400 flex-shrink-0" />}
                    {track.type === 'audio' && <Music size={14} className="text-green-400 flex-shrink-0" />}
                    {track.type === 'text' && <Type size={14} className="text-purple-400 flex-shrink-0" />}
                    {editingTrackId === track.id ? (
                      <input type="text" value={editingTrackName}
                        onChange={(e) => setEditingTrackName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { onUpdateTrack?.(track.id, { name: editingTrackName }); setEditingTrackId(null); }
                          else if (e.key === 'Escape') { setEditingTrackId(null); }
                        }}
                        onBlur={() => { onUpdateTrack?.(track.id, { name: editingTrackName }); setEditingTrackId(null); }}
                        autoFocus className="bg-zinc-700 text-zinc-200 text-xs px-1 py-0.5 rounded w-full outline-none border border-cyan-500" />
                    ) : (
                      <span className="truncate cursor-pointer hover:text-zinc-200"
                        onDoubleClick={() => { if (onUpdateTrack) { setEditingTrackId(track.id); setEditingTrackName(track.name || (track.isMainTrack ? '主轨道' : `${track.type.toUpperCase()} ${index + 1}`)); } }}>
                        {track.name || (track.isMainTrack ? '主轨道' : `${track.type.toUpperCase()} ${index + 1}`)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    {(track.type === 'video' || track.type === 'audio') && onUpdateTrack && (
                      <button onClick={() => onUpdateTrack(track.id, { muted: !track.muted })}
                        className={`p-1 rounded transition-colors ${track.muted ? 'text-red-400 bg-red-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                        title={track.muted ? '取消静音' : '静音'}>
                        {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      </button>
                    )}
                    {!track.isMainTrack && onUpdateTrack && (
                      <button onClick={() => onUpdateTrack(track.id, { hidden: !track.hidden })}
                        className={`p-1 rounded transition-colors ${track.hidden ? 'text-orange-400 bg-orange-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                        title={track.hidden ? '显示轨道' : '隐藏轨道'}>
                        {track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    )}
                    {!track.isMainTrack && (
                      <button onClick={() => onDeleteTrack(track.id)}
                        className="opacity-0 group-hover/track:opacity-100 text-red-400 hover:text-red-300 p-1 rounded" title="删除轨道">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 轨道内容 */}
              <div className="relative flex-1 h-full" style={{ width: totalWidth }}>
                {track.clips.map(clip => (
                  <div key={clip.id} onMouseDown={(e) => handleClipMouseDown(e, clip)}
                    onContextMenu={(e) => handleClipContextMenu(e, clip)}
                    className={`absolute top-2 bottom-2 rounded-md overflow-hidden transition-shadow border shadow-sm group/clip select-none
                      ${selectedClipId === clip.id ? 'border-cyan-400 ring-2 ring-cyan-500/20 z-10' : 'border-transparent hover:border-zinc-500 z-0'}
                      ${dragState?.clipId === clip.id ? 'cursor-grabbing opacity-90 shadow-xl' : 'cursor-grab'}
                      ${dragState?.clipId === clip.id && dragState.hasCollision ? 'border-red-500 ring-2 ring-red-500/50' : ''}
                    `}
                    style={{ left: clip.start * pixelsPerSecond, width: clip.duration * pixelsPerSecond }}>
                    <Filmstrip clip={clip} frames={frameMap.get(clip.id)?.frames} pixelsPerSecond={pixelsPerSecond} />
                    {clip.keyframes?.map(kf => (
                      <div key={kf.id}
                        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 cursor-pointer z-30 ${selectedKeyframeId === kf.id ? 'scale-125' : 'hover:scale-110'}`}
                        style={{ left: kf.time * pixelsPerSecond }}
                        onClick={(e) => { e.stopPropagation(); onSelectKeyframe?.(clip.id, kf.id); onSeek(clip.start + kf.time); }}
                        onContextMenu={(e) => handleKeyframeContextMenu(e, clip.id, kf)}>
                        <svg viewBox="0 0 12 12" className="w-full h-full drop-shadow">
                          <path d="M6 0L12 6L6 12L0 6Z" fill={selectedKeyframeId === kf.id ? '#22d3ee' : '#facc15'} stroke={selectedKeyframeId === kf.id ? '#0891b2' : '#ca8a04'} strokeWidth="1" />
                        </svg>
                      </div>
                    ))}
                    {selectedClipId === clip.id && (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-3 cursor-w-resize hover:bg-cyan-400/50 z-20 flex items-center justify-center"
                          onMouseDown={(e) => handleResizeMouseDown(e, clip, 'start')}>
                          <div className="w-1 h-4 bg-white/80 rounded-full" />
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-3 cursor-e-resize hover:bg-cyan-400/50 z-20 flex items-center justify-center"
                          onMouseDown={(e) => handleResizeMouseDown(e, clip, 'end')}>
                          <div className="w-1 h-4 bg-white/80 rounded-full" />
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* 新建轨道区域 */}
          <div className="flex h-24 group" onDragOver={(e) => handleDragOver(e)} onDrop={(e) => handleDrop(e)}>
            <div className="sticky left-0 w-[200px] flex-shrink-0 bg-[#18181b] border-r border-[#27272a] z-20" />
            <div className="flex-1 border-t-2 border-dashed border-zinc-800 m-2 rounded flex items-center justify-center text-zinc-700 transition-colors group-hover:border-zinc-600">
              拖入素材创建新轨道
            </div>
          </div>
        </div>
      </div>

      {/* 播放头竖线 */}
      {playheadX > 0 && playheadPositionRef.current.lineTop > 0 && (
        <div className="fixed bg-cyan-400 pointer-events-none z-20"
          style={{ left: playheadX, top: playheadPositionRef.current.lineTop, bottom: 0, width: 1, transform: 'translateX(-50%)' }} />
      )}

      {/* 吸附对齐线 */}
      {snapLine && playheadPositionRef.current.lineTop > 0 && (
        <div className="fixed pointer-events-none z-30"
          style={{
            left: playheadPositionRef.current.viewportX + snapLine.x - (containerRef.current?.scrollLeft || 0),
            top: playheadPositionRef.current.lineTop, bottom: 0, width: 2, transform: 'translateX(-50%)',
            background: snapLine.type === 'playhead'
              ? 'linear-gradient(to bottom, #22d3ee, #22d3ee 4px, transparent 4px, transparent 8px)'
              : 'linear-gradient(to bottom, #a855f7, #a855f7 4px, transparent 4px, transparent 8px)',
            backgroundSize: '2px 8px',
          }} />
      )}

      {/* 素材拖拽预览 */}
      {draggingAsset && (
        <div className="fixed pointer-events-none z-[9999] transform -translate-x-1/2 -translate-y-1/2" style={{ left: mousePos.x, top: mousePos.y }}>
          <div className="bg-cyan-500/90 text-white text-xs px-3 py-2 rounded-lg shadow-xl flex items-center gap-2 whitespace-nowrap">
            {(draggingAsset.type === MediaType.VIDEO || draggingAsset.type === MediaType.IMAGE) && <Film size={14} />}
            {draggingAsset.type === MediaType.AUDIO && <Music size={14} />}
            {draggingAsset.type === MediaType.TEXT && <Type size={14} />}
            <span className="font-medium">{draggingAsset.name}</span>
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div className="fixed z-[10000] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.type === 'clip' && (
            <>
              {onAddKeyframe && contextMenu.clipLocalTime !== undefined && (
                <button className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                  onClick={() => { onAddKeyframe(contextMenu.clipId, contextMenu.clipLocalTime!); closeContextMenu(); }}>
                  <svg viewBox="0 0 12 12" className="w-3 h-3"><path d="M6 0L12 6L6 12L0 6Z" fill="#facc15" /></svg>
                  添加关键帧
                </button>
              )}
              {onDuplicateClip && (
                <button className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                  onClick={() => { onDuplicateClip(contextMenu.clipId); closeContextMenu(); }}>
                  <Copy size={12} />复制片段
                </button>
              )}
              <div className="my-1 border-t border-zinc-800" />
              {onDeleteClip && (
                <button className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-900/30 flex items-center gap-2"
                  onClick={() => { onDeleteClip(contextMenu.clipId); closeContextMenu(); }}>
                  <Trash2 size={12} />删除片段
                </button>
              )}
            </>
          )}
          {contextMenu.type === 'keyframe' && contextMenu.keyframeId && (
            <>
              <div className="px-3 py-1 text-[10px] text-zinc-500 uppercase tracking-wider">缓动类型</div>
              {EASING_OPTIONS.map(opt => (
                <button key={opt.value} className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                  onClick={() => { onUpdateKeyframeEasing?.(contextMenu.clipId, contextMenu.keyframeId!, opt.value); closeContextMenu(); }}>
                  {opt.label}
                </button>
              ))}
              <div className="my-1 border-t border-zinc-800" />
              {onDeleteKeyframe && (
                <button className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-900/30 flex items-center gap-2"
                  onClick={() => { onDeleteKeyframe(contextMenu.clipId, contextMenu.keyframeId!); closeContextMenu(); }}>
                  <Trash2 size={12} />删除关键帧
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SimpleTimeline;
