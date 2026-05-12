/**
 * Director3D 时间轴 HUD（C-6A）。
 *
 * 一条横向时间轴 HUD，固定在 Modal 底部（CameraBar 之上）：
 *   播放/暂停 | 当前时间 / 总时长 | 帧率 | ────●────●──────● ──── | + 关键帧 | 删除选中
 *
 * 关键行为：
 *  - 拖拽轨道游标 → 更新 currentTime（视口实时显示插值后的 runtimeScene）
 *  - 点击关键帧标记 → 选中 + 时间游标跳到那一帧
 *  - 拖拽关键帧标记 → 修改该帧的 time（自动重排序）
 *  - 加号 → 在当前时间用 scene 快照创建新关键帧（自动覆盖同一时间的旧帧）
 *  - 删除 → 移除选中关键帧
 *  - 播放：requestAnimationFrame 推进 currentTime，到达 duration 自动停
 *
 * 沉浸态隐藏；时间轴为空时 HUD 仍显示（提示用户加第一帧）。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { InputNumber, Modal, Select, Tooltip } from 'antd';
import { Film, MonitorPlay, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toFileSystemDisplayUrl } from '../../../services/fileSystemPort';
import type {
  LinghuiDirector3DEasing,
  LinghuiDirector3DExportResolution,
  LinghuiDirector3DKeyframe,
  LinghuiDirector3DTimeline,
} from '../../../types/linghui';
import {
  DIRECTOR3D_EXPORT_RESOLUTION_OPTIONS,
  resolveDirector3DExportResolution,
} from './director3dScene';

export interface Director3DTimelineExportState {
  /** 导出中标记 */
  active: boolean;
  /** 当前阶段：'render'（逐帧）或 'encode'（ffmpeg） */
  phase: 'render' | 'encode' | null;
  /** 当前进度 */
  current: number;
  /** 总数 */
  total: number;
}

/**
 * 时间线图层：每个图层对应一组独立关键帧轨道。
 *  - 'camera'：镜头层（scope='camera' 或 'scene'）
 *  - { kind: 'actor'; actorId; label }：某个 actor 的层（scope='actor:{id}' 或 'scene' 含此 actor）
 *
 * 时间线 UI 只显示当前图层的关键帧，新增 / 删除 / 拖动也只影响当前图层。
 */
export type Director3DTimelineLayer =
  | { kind: 'camera'; label: string }
  | { kind: 'actor'; actorId: string; label: string };

interface Director3DTimelineHudProps {
  timeline: LinghuiDirector3DTimeline;
  currentTime: number;
  playing: boolean;
  selectedKeyframeId: string | null;
  exportState: Director3DTimelineExportState;
  /** 当前激活图层（决定时间线显示哪些关键帧 + 增删针对哪条轨） */
  activeLayer: Director3DTimelineLayer;
  /** 已导出的视频 koma-local URL（若有），用于"预览"按钮的 mp4 来源 */
  exportedVideoUrl?: string;
  exportedVideoPosterUrl?: string;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
  onAddKeyframe: () => void;
  onRemoveKeyframe: (keyframeId: string) => void;
  onSelectKeyframe: (keyframeId: string | null) => void;
  onMoveKeyframe: (keyframeId: string, newTime: number) => void;
  onDurationChange: (duration: number) => void;
  onFpsChange: (fps: number) => void;
  onEasingChange: (easing: LinghuiDirector3DEasing) => void;
  onExportResolutionChange: (resolution: LinghuiDirector3DExportResolution) => void;
  onResetTimeline: () => void;
  onExportVideo: () => void;
  onCancelExport: () => void;
}

const TRACK_HEIGHT = 24;

function formatTime(t: number): string {
  return `${t.toFixed(2)}s`;
}

export const Director3DTimelineHud: React.FC<Director3DTimelineHudProps> = ({
  timeline,
  currentTime,
  playing,
  selectedKeyframeId,
  exportState,
  activeLayer,
  exportedVideoUrl,
  exportedVideoPosterUrl,
  onPlayToggle,
  onSeek,
  onAddKeyframe,
  onRemoveKeyframe,
  onSelectKeyframe,
  onMoveKeyframe,
  onDurationChange,
  onFpsChange,
  onEasingChange,
  onExportResolutionChange,
  onResetTimeline,
  onExportVideo,
  onCancelExport,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [draggingKeyframeId, setDraggingKeyframeId] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewVideoSrc = exportedVideoUrl ? toFileSystemDisplayUrl(exportedVideoUrl) || exportedVideoUrl : '';
  const previewPosterSrc = exportedVideoPosterUrl ? toFileSystemDisplayUrl(exportedVideoPosterUrl) || exportedVideoPosterUrl : undefined;

  const duration = Math.max(0.5, timeline.duration);

  // 当前图层可见的关键帧（**按实例 id 严格过滤**）：
  //   - camera 层：scope='camera' 实心 / scope='scene' 虚化（同含 camera 数据）
  //   - actor:X 层：仅 scope='actor:X'（按实例 id 唯一）。
  //     scene 帧虽然含此 actor 数据，但同时也含其他所有 actor 数据，UI 不展示，
  //     避免"切了图层看起来一模一样"的按类型过滤错觉。数据上仍参与 fallback 插值。
  const visibleKeyframes = React.useMemo<Array<{ kf: LinghuiDirector3DKeyframe; isGlobal: boolean }>>(() => {
    const acc: Array<{ kf: LinghuiDirector3DKeyframe; isGlobal: boolean }> = [];
    for (const kf of timeline.keyframes) {
      const scope = kf.scope ?? 'scene';
      if (activeLayer.kind === 'camera') {
        if (scope === 'camera') acc.push({ kf, isGlobal: false });
        else if (scope === 'scene') acc.push({ kf, isGlobal: true });
      } else if (scope === `actor:${activeLayer.actorId}`) {
        acc.push({ kf, isGlobal: false });
      }
    }
    return acc;
  }, [activeLayer, timeline.keyframes]);

  const timeToPercent = useCallback((t: number): number => {
    return Math.min(100, Math.max(0, (t / duration) * 100));
  }, [duration]);

  const clientXToTime = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Number((ratio * duration).toFixed(3));
  }, [duration]);

  // 拖拽：游标
  useEffect(() => {
    if (!scrubbing && !draggingKeyframeId) return undefined;
    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      const t = clientXToTime(event.clientX);
      if (draggingKeyframeId) {
        onMoveKeyframe(draggingKeyframeId, t);
      } else if (scrubbing) {
        onSeek(t);
      }
    };
    const handleUp = () => {
      setScrubbing(false);
      setDraggingKeyframeId(null);
    };
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [clientXToTime, draggingKeyframeId, onMoveKeyframe, onSeek, scrubbing]);

  const handleTrackPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // 不点在 keyframe 上时才是 scrub
    if ((event.target as HTMLElement).closest('.linghuiDirector3DTimelineKeyframe')) return;
    event.preventDefault();
    setScrubbing(true);
    onSeek(clientXToTime(event.clientX));
  }, [clientXToTime, onSeek]);

  const handleKeyframePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>, kf: LinghuiDirector3DKeyframe) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectKeyframe(kf.id);
    onSeek(kf.time);
    setDraggingKeyframeId(kf.id);
  }, [onSeek, onSelectKeyframe]);

  return (
    // nopan / nowheel 已经告诉 RF 不要拖拽 / 滚轮缩放；额外的 React onMouseDown
    // stopPropagation 会破坏 antd Select / InputNumber 的内部状态机（dropdown
    // option 选中失败、Number 上下箭头失灵），移除。
    <div className="linghuiDirector3DTimelineHud nopan nowheel">
      <div className="linghuiDirector3DTimelineControls">
        <Tooltip title={playing ? '暂停 (Space)' : '播放 (Space)'}>
          <button
            type="button"
            className={`linghuiDirector3DTimelineButton ${playing ? 'isActive' : ''}`}
            onClick={onPlayToggle}
            disabled={timeline.keyframes.length < 2}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
        </Tooltip>

        <Tooltip title="回到 0">
          <button
            type="button"
            className="linghuiDirector3DTimelineButton"
            onClick={() => onSeek(0)}
          >
            <RotateCcw size={14} />
          </button>
        </Tooltip>

        <span className="linghuiDirector3DTimelineTimeReadout">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <Tooltip title={`在当前时间点为「${activeLayer.label}」加一帧`}>
          <button
            type="button"
            className="linghuiDirector3DTimelineButton isAccent"
            onClick={onAddKeyframe}
          >
            <Plus size={14} />
            <span>关键帧</span>
          </button>
        </Tooltip>

        <Tooltip title="删除选中关键帧（仅当前图层）">
          <button
            type="button"
            className="linghuiDirector3DTimelineButton"
            onClick={() => selectedKeyframeId && onRemoveKeyframe(selectedKeyframeId)}
            disabled={!selectedKeyframeId}
          >
            <Trash2 size={14} />
          </button>
        </Tooltip>

        {/* 当前图层 chip：展示在编辑哪条轨；用户切换选中即切换图层 */}
        <span className="linghuiDirector3DTimelineLayerChip" title="当前图层；选中视口里的物体可切换到对应轨">
          {activeLayer.kind === 'camera' ? '镜头层' : `物体：${activeLayer.label}`}
        </span>

        <span className="linghuiDirector3DTimelineSeparator" />

        <Tooltip title="总时长（秒）">
          <InputNumber
            size="small"
            min={0.5}
            max={120}
            step={0.5}
            value={timeline.duration}
            onChange={value => onDurationChange(Math.max(0.5, Math.min(120, Number(value) || 0.5)))}
            style={{ width: 64 }}
            controls={false}
            suffix="s"
          />
        </Tooltip>

        <Tooltip title="输出帧率">
          <InputNumber
            size="small"
            min={6}
            max={60}
            step={1}
            value={timeline.fps}
            onChange={value => onFpsChange(Math.max(6, Math.min(60, Math.round(Number(value) || 24))))}
            style={{ width: 56 }}
            controls={false}
            suffix="fps"
          />
        </Tooltip>

        {/* getPopupContainer 改成 trigger.parentElement：editor 本身已经 portal 到 body，
           Select dropdown 默认还会 portal 到 body，形成「body-portal A 包 body-portal B」
           的双重 portal，React 19 在合成事件跨 portal 冒泡时 option onClick 不能
           可靠 commit。挂到 parentElement 让 dropdown 留在 director3d portal 内部，
           事件路径就只走一层 portal，select 正常生效。 */}
        <Select<LinghuiDirector3DEasing>
          size="small"
          title="补间缓动算法"
          value={timeline.easing ?? 'ease-in-out'}
          onChange={(value) => onEasingChange(value as LinghuiDirector3DEasing)}
          style={{ width: 96 }}
          getPopupContainer={triggerNode => triggerNode.parentElement ?? triggerNode.ownerDocument.body}
          popupClassName="nopan nowheel nodrag linghuiDirector3DSelectDropdown"
          options={[
            { value: 'linear', label: '线性' },
            { value: 'ease-in', label: '缓入' },
            { value: 'ease-out', label: '缓出' },
            { value: 'ease-in-out', label: '平滑' },
          ]}
        />

        <Select<LinghuiDirector3DExportResolution>
          size="small"
          title="视频导出分辨率（按 aspectRatio 计算宽）"
          value={resolveDirector3DExportResolution(timeline.exportResolution)}
          onChange={(value) => onExportResolutionChange(value)}
          style={{ width: 96 }}
          getPopupContainer={triggerNode => triggerNode.parentElement ?? triggerNode.ownerDocument.body}
          popupClassName="nopan nowheel nodrag linghuiDirector3DSelectDropdown"
          options={DIRECTOR3D_EXPORT_RESOLUTION_OPTIONS.map(option => ({
            value: option.value,
            label: option.label,
            title: option.hint,
          }))}
        />

        <span className="linghuiDirector3DTimelineSeparator" />

        <Tooltip title="清空时间轴（不动 scene）">
          <button
            type="button"
            className="linghuiDirector3DTimelineButton isDanger"
            onClick={onResetTimeline}
            disabled={timeline.keyframes.length === 0}
          >
            清空
          </button>
        </Tooltip>

        <span className="linghuiDirector3DTimelineSeparator" />

        {exportState.active ? (
          <button
            type="button"
            className="linghuiDirector3DTimelineButton isDanger"
            onClick={onCancelExport}
          >
            取消导出 {exportState.phase === 'render'
              ? `（渲染 ${exportState.current}/${exportState.total}）`
              : exportState.phase === 'encode'
                ? `（编码 ${exportState.current}%）`
                : ''}
          </button>
        ) : (
          <Tooltip title="按当前时间轴逐帧渲染，ffmpeg 拼成 mp4，输出到 properties.timelineVideoUrl，下游 video 节点可消费">
            <button
              type="button"
              className="linghuiDirector3DTimelineButton isAccent"
              onClick={onExportVideo}
              disabled={timeline.keyframes.length < 2}
            >
              <Film size={14} />
              <span>导出视频</span>
            </button>
          </Tooltip>
        )}

        {/* 预览已导出的视频（不依赖工作台时间轴，直接播放 mp4） */}
        {previewVideoSrc ? (
          <Tooltip title="播放已导出的 mp4 文件，确认动画是否符合预期">
            <button
              type="button"
              className="linghuiDirector3DTimelineButton"
              onClick={() => setPreviewOpen(true)}
            >
              <MonitorPlay size={14} />
              <span>预览</span>
            </button>
          </Tooltip>
        ) : null}
      </div>

      {/* 已导出视频预览 Modal */}
      <Modal
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        title="时间轴动画预览"
        width={720}
        destroyOnClose
        zIndex={2000}
      >
        {previewVideoSrc ? (
          <video
            src={previewVideoSrc}
            poster={previewPosterSrc}
            controls
            autoPlay
            style={{ width: '100%', maxHeight: '70vh', background: '#000', borderRadius: 8 }}
          />
        ) : (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--token-text-muted)' }}>
            暂无可预览的视频
          </div>
        )}
      </Modal>

      <div
        ref={trackRef}
        className={`linghuiDirector3DTimelineTrack ${scrubbing ? 'isScrubbing' : ''}`}
        style={{ height: TRACK_HEIGHT }}
        onPointerDown={handleTrackPointerDown}
      >
        {/* 刻度线（每秒一格） */}
        <div className="linghuiDirector3DTimelineTicks">
          {Array.from({ length: Math.floor(duration) + 1 }, (_, idx) => (
            <span
              key={idx}
              className="linghuiDirector3DTimelineTick"
              style={{ left: `${timeToPercent(idx)}%` }}
            >
              {idx}s
            </span>
          ))}
        </div>

        {/* 关键帧标记。isGlobal=true 表示这是 scene 帧（在多个图层都会出现，虚化展示） */}
        {visibleKeyframes.map(({ kf, isGlobal }) => (
          <div
            key={kf.id}
            className={`linghuiDirector3DTimelineKeyframe ${kf.id === selectedKeyframeId ? 'isSelected' : ''} ${draggingKeyframeId === kf.id ? 'isDragging' : ''} ${isGlobal ? 'isGlobalScope' : ''}`}
            style={{ left: `${timeToPercent(kf.time)}%` }}
            onPointerDown={event => handleKeyframePointerDown(event, kf)}
            title={`${kf.label ?? `t=${kf.time.toFixed(2)}s`}${isGlobal ? ' · 全局帧' : ''}`}
          />
        ))}

        {/* 当前时间游标 */}
        <div
          className="linghuiDirector3DTimelineCursor"
          style={{ left: `${timeToPercent(currentTime)}%` }}
        />
      </div>

    </div>
  );
};

export default Director3DTimelineHud;
