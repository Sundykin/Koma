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
import { InputNumber, Select, Tooltip } from 'antd';
import { Film, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type {
  LinghuiDirector3DEasing,
  LinghuiDirector3DKeyframe,
  LinghuiDirector3DTimeline,
} from '../../../types/linghui';

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

interface Director3DTimelineHudProps {
  timeline: LinghuiDirector3DTimeline;
  currentTime: number;
  playing: boolean;
  selectedKeyframeId: string | null;
  exportState: Director3DTimelineExportState;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
  onAddKeyframe: () => void;
  onRemoveKeyframe: (keyframeId: string) => void;
  onSelectKeyframe: (keyframeId: string | null) => void;
  onMoveKeyframe: (keyframeId: string, newTime: number) => void;
  onDurationChange: (duration: number) => void;
  onFpsChange: (fps: number) => void;
  onEasingChange: (easing: LinghuiDirector3DEasing) => void;
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
  onPlayToggle,
  onSeek,
  onAddKeyframe,
  onRemoveKeyframe,
  onSelectKeyframe,
  onMoveKeyframe,
  onDurationChange,
  onFpsChange,
  onEasingChange,
  onResetTimeline,
  onExportVideo,
  onCancelExport,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [draggingKeyframeId, setDraggingKeyframeId] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const duration = Math.max(0.5, timeline.duration);

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
    <div className="linghuiDirector3DTimelineHud nopan nowheel" onMouseDown={event => event.stopPropagation()}>
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

        <Tooltip title="在当前时间点加关键帧（拍下场景快照）">
          <button
            type="button"
            className="linghuiDirector3DTimelineButton isAccent"
            onClick={onAddKeyframe}
          >
            <Plus size={14} />
            <span>关键帧</span>
          </button>
        </Tooltip>

        <Tooltip title="删除选中关键帧">
          <button
            type="button"
            className="linghuiDirector3DTimelineButton"
            onClick={() => selectedKeyframeId && onRemoveKeyframe(selectedKeyframeId)}
            disabled={!selectedKeyframeId}
          >
            <Trash2 size={14} />
          </button>
        </Tooltip>

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

        <Tooltip title="补间缓动算法">
          <Select<LinghuiDirector3DEasing>
            size="small"
            // 确保选中态准确：popup 容器放到 body，避免被父级 HUD 的 transform / overflow 截断；
            // value 显式 fallback 'ease-in-out'（旧 timeline 缺 easing 字段时不至于 select 空）
            value={timeline.easing ?? 'ease-in-out'}
            onChange={(value) => onEasingChange(value as LinghuiDirector3DEasing)}
            style={{ width: 96 }}
            getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
            options={[
              { value: 'linear', label: '线性' },
              { value: 'ease-in', label: '缓入' },
              { value: 'ease-out', label: '缓出' },
              { value: 'ease-in-out', label: '平滑' },
            ]}
          />
        </Tooltip>

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
      </div>

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

        {/* 关键帧标记 */}
        {timeline.keyframes.map(kf => (
          <div
            key={kf.id}
            className={`linghuiDirector3DTimelineKeyframe ${kf.id === selectedKeyframeId ? 'isSelected' : ''} ${draggingKeyframeId === kf.id ? 'isDragging' : ''}`}
            style={{ left: `${timeToPercent(kf.time)}%` }}
            onPointerDown={event => handleKeyframePointerDown(event, kf)}
            title={kf.label ?? `t=${kf.time.toFixed(2)}s`}
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
