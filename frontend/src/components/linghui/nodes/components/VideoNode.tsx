import React, { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { LoaderCircle, Pause, Play } from 'lucide-react';
import type {
  LinghuiNodeData,
  LinghuiRunStatus,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import { getLinghuiResultPrimaryMedia } from '../../../../types/linghui';
import {
  useNodeRunState,
  useLinghuiNodeInteraction,
  useLinghuiNodeEditorVisibility,
} from '../state/LinghuiNodeRunsContext';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { fromKomaLocalUrl } from '../../../../utils/urlUtils';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import { resolveMediaCardSize } from '../state/linghuiNodeCardSizing';
import { getVideoCapabilityDescriptor } from '../../editors/state/videoCapabilityUtils';
import { electronService } from '../../../../services/electronService';
import { base64ToBytes } from '../../../../utils/encoding';
import { cssVars } from '../../../../theme/runtime';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: 'var(--token-text-muted)',
  running: 'var(--token-status-info)',
  succeeded: 'var(--token-status-success)',
  failed: 'var(--token-status-error)',
  stale: 'var(--token-status-warning)',
};

function getPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}

const decodeLinghuiSource = fromKomaLocalUrl;

function isPlayableUrlSource(source: string): boolean {
  return (
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('data:') ||
    source.startsWith('blob:')
  );
}

function inferVideoMimeType(source: string, mimeType?: string): string {
  const normalizedMimeType = String(mimeType ?? '').trim();
  if (normalizedMimeType) {
    return normalizedMimeType;
  }

  const normalizedSource = source.split('?')[0].split('#')[0].toLowerCase();
  if (normalizedSource.endsWith('.webm')) return 'video/webm';
  if (normalizedSource.endsWith('.mov')) return 'video/quicktime';
  if (normalizedSource.endsWith('.m4v')) return 'video/x-m4v';
  return 'video/mp4';
}

async function resolvePlayableVideoSource(
  source: string,
  mimeType?: string,
): Promise<{ url: string; dispose?: () => void }> {
  if (!source) {
    return { url: '' };
  }

  if (isPlayableUrlSource(source)) {
    return { url: source };
  }

  const rawPath = decodeLinghuiSource(source);
  const base64 = await electronService.fs.readFileAsBase64(rawPath);
  const resolvedMimeType = inferVideoMimeType(rawPath, mimeType);

  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const objectUrl = URL.createObjectURL(new Blob([base64ToBytes(base64)], { type: resolvedMimeType }));
    return {
      url: objectUrl,
      dispose: () => URL.revokeObjectURL(objectUrl),
    };
  }

  return {
    url: `data:${resolvedMimeType};base64,${base64}`,
  };
}

function resolveHandleTop(index: number, total: number): string {
  if (total <= 1) return '50%';
  const step = 100 / (total + 1);
  return `${step * (index + 1)}%`;
}

function getHandleColor(dataType: LinghuiNodeData['inputs'][number]['dataType'], accent: string): string {
  switch (dataType) {
    case 'text':
      return 'var(--token-status-warning)';
    case 'audio':
      return 'var(--token-status-warning)';
    case 'video':
      return 'var(--token-status-info)';
    default:
      return accent;
  }
}

function drawVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): boolean {
  const width = Math.max(1, Math.round(canvas.clientWidth || canvas.offsetWidth || 0));
  const height = Math.max(1, Math.round(canvas.clientHeight || canvas.offsetHeight || 0));
  if (width <= 0 || height <= 0 || video.videoWidth <= 0 || video.videoHeight <= 0 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return false;
  }

  const devicePixelRatio = window.devicePixelRatio || 1;
  const scaledWidth = Math.max(1, Math.round(width * devicePixelRatio));
  const scaledHeight = Math.max(1, Math.round(height * devicePixelRatio));
  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
  }

  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d');
  } catch {
    context = null;
  }

  if (!context) {
    return false;
  }

  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--token-bg-app').trim() || 'Canvas';
  context.fillRect(0, 0, width, height);

  const sourceRatio = video.videoWidth / video.videoHeight;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  if (sourceRatio > targetRatio) {
    drawHeight = height;
    drawWidth = height * sourceRatio;
    offsetX = (width - drawWidth) / 2;
  } else {
    drawWidth = width;
    drawHeight = width / sourceRatio;
    offsetY = (height - drawHeight) / 2;
  }

  try {
    context.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
    return true;
  } catch {
    return false;
  }
}

function VideoNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiVideoNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasRenderableFrame, setHasRenderableFrame] = useState(false);
  const [hasMediaLoaded, setHasMediaLoaded] = useState(false);

  const primaryVideo = getLinghuiResultPrimaryMedia(runState?.result);
  const rawVideoSource = String(primaryVideo?.source ?? props.source ?? '').trim();
  const rawPosterSource = String(primaryVideo?.posterSource ?? props.posterSource ?? '').trim();
  const videoMimeType = String(primaryVideo?.mimeType ?? '').trim();
  const [videoSource, setVideoSource] = useState(() => (isPlayableUrlSource(rawVideoSource) ? rawVideoSource : ''));
  const posterSource = getPreviewSource(rawPosterSource);
  const hasUploadedSource = Boolean(String(props.source ?? '').trim());
  const modeLabel = getVideoCapabilityDescriptor(props.videoCapability).label;
  const mediaCardStyle = resolveMediaCardSize({
    width: primaryVideo?.width,
    height: primaryVideo?.height,
    aspectRatio: typeof runState?.result?.metadata?.aspectRatio === 'string'
      ? runState.result.metadata.aspectRatio
      : String(props.aspectRatio ?? '16:9'),
  }).style;
  const nodeStyle = cssVars({
    ...mediaCardStyle,
    '--linghui-node-shadow': status !== 'idle'
      ? `0 0 0 1px color-mix(in srgb, ${statusColor} 66%, transparent), 0 12px 28px color-mix(in srgb, var(--token-bg-app) 32%, transparent)`
      : selected
        ? '0 0 0 1px color-mix(in srgb, var(--token-text-primary) 8%, transparent), 0 12px 24px color-mix(in srgb, var(--token-bg-app) 26%, transparent)'
        : 'none',
    '--linghui-accent': nodeData.accent,
    '--linghui-progress': `${runState?.progress ?? 0}%`,
  });
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/video');
  const normalizedRunProgress = typeof runState?.progress === 'number' && Number.isFinite(runState.progress)
    ? Math.max(0, Math.min(100, Math.round(runState.progress)))
    : 0;
  const normalizedRunMessage = String(runState?.message ?? '').trim();
  const footerCaption = status === 'running'
    ? `${normalizedRunMessage && normalizedRunMessage !== '准备执行' ? normalizedRunMessage : '等待视频生成…'}${normalizedRunProgress > 0 ? ` · ${normalizedRunProgress}%` : ''}`
    : hasUploadedSource
      ? '透传输出'
      : modeLabel;

  const syncVideoFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return false;
    }

    const rendered = drawVideoFrame(video, canvas);
    if (rendered) {
      setHasRenderableFrame(true);
    }
    return rendered;
  }, []);

  useEffect(() => {
    if (isPlayableUrlSource(rawVideoSource)) {
      setVideoSource(rawVideoSource);
      return undefined;
    }

    let cancelled = false;
    let dispose: (() => void) | undefined;

    const loadVideoSource = async () => {
      if (!rawVideoSource) {
        setVideoSource('');
        return;
      }

      setVideoSource('');

      try {
        const nextSource = await resolvePlayableVideoSource(rawVideoSource, videoMimeType);
        if (cancelled) {
          nextSource.dispose?.();
          return;
        }

        dispose = nextSource.dispose;
        setVideoSource(nextSource.url);
      } catch {
        if (!cancelled) {
          setVideoSource(getPreviewSource(rawVideoSource));
        }
      }
    };

    void loadVideoSource();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [rawVideoSource, videoMimeType]);

  useEffect(() => {
    videoRef.current?.pause();
    setIsPlaying(false);
    setHasRenderableFrame(false);
    setHasMediaLoaded(false);
  }, [videoSource]);

  useEffect(() => () => {
    videoRef.current?.pause();
  }, []);

  useEffect(() => {
    if (!videoSource || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      syncVideoFrame();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [syncVideoFrame, videoSource]);

  const stopSurfaceEvent = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const handleTogglePlayback = useCallback((event: React.SyntheticEvent) => {
    stopSurfaceEvent(event);

    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused || video.ended) {
      if (video.ended) {
        video.currentTime = 0;
        syncVideoFrame();
      }
      void video.play().catch(() => undefined);
      return;
    }

    video.pause();
  }, [stopSurfaceEvent, syncVideoFrame]);

  const handleMediaReady = useCallback(() => {
    setHasMediaLoaded(true);
    requestAnimationFrame(() => {
      syncVideoFrame();
    });
  }, [syncVideoFrame]);

  const handleVideoPlay = useCallback(() => {
    setIsPlaying(true);
    setHasMediaLoaded(true);
  }, []);

  const handleVideoPause = useCallback(() => {
    setIsPlaying(false);
    requestAnimationFrame(() => {
      syncVideoFrame();
    });
  }, [syncVideoFrame]);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
    requestAnimationFrame(() => {
      syncVideoFrame();
    });
  }, [syncVideoFrame]);

  const handleVideoError = useCallback(() => {
    setIsPlaying(false);
    setHasRenderableFrame(false);
  }, []);

  return (
    <div
      className={`linghuiCompactNode nopan ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${isEditorVisible ? 'hasInlineEditor' : ''}`}
      data-view-mode={viewMode}
      style={nodeStyle}
      {...interactionHandlers}
    >
      {nodeData.inputs.map((slot, index) => (
        <Handle
          key={`input-${index}`}
          type="target"
          position={Position.Left}
          id={`input-${index}`}
          className="linghuiCompactHandle"
          style={{
            '--linghui-handle-bg': getHandleColor(slot.dataType, nodeData.accent),
            '--linghui-handle-top': resolveHandleTop(index, nodeData.inputs.length),
          } as CSSProperties}
          isConnectable
        />
      ))}

      <Handle
        type="source"
        position={Position.Right}
        id="output-0"
        className="linghuiCompactHandle"
        style={{ '--linghui-handle-bg': nodeData.accent } as CSSProperties}
      />

      <div className="linghuiCompactThumb">
        {videoSource ? (
          <div className="linghuiCompactVideoStage">
            <video
              ref={videoRef}
              className={`linghuiCompactVideoMedia ${isPlaying ? 'isActivePlayback' : ''}`}
              src={videoSource}
              poster={posterSource || undefined}
              preload="auto"
              playsInline
              disablePictureInPicture
              disableRemotePlayback
              onLoadedMetadata={handleMediaReady}
              onLoadedData={handleMediaReady}
              onCanPlay={handleMediaReady}
              onTimeUpdate={syncVideoFrame}
              onSeeking={syncVideoFrame}
              onSeeked={syncVideoFrame}
              onPlay={handleVideoPlay}
              onPause={handleVideoPause}
              onEnded={handleVideoEnded}
              onError={handleVideoError}
            />
            <canvas
              ref={canvasRef}
              className={`linghuiCompactVideoCanvas ${hasRenderableFrame && !isPlaying ? 'hasFrame' : ''}`}
              aria-hidden="true"
            />
            {!isPlaying && !hasRenderableFrame && posterSource ? (
              <img
                className={`linghuiCompactVideoFallback ${hasMediaLoaded ? 'isLoaded' : ''}`}
                src={posterSource}
                alt="视频封面"
                draggable={false}
              />
            ) : null}
            {!isPlaying && !hasRenderableFrame && !posterSource ? (
              <div className="linghuiCompactThumbEmpty">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="3" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" />
                  <polygon points="10,8 16,12 10,16" fill={nodeData.accent} fillOpacity="0.5" />
                </svg>
              </div>
            ) : null}
            <div className={`linghuiCompactVideoOverlay ${isPlaying ? 'isPlaying' : ''}`}>
              <button
                type="button"
                className={`linghuiCompactVideoToggle nodrag nopan ${isPlaying ? 'isPlaying' : ''}`}
                onMouseDown={stopSurfaceEvent}
                onPointerDown={stopSurfaceEvent}
                onClick={handleTogglePlayback}
                aria-label={isPlaying ? '暂停视频' : '播放视频'}
                title={isPlaying ? '暂停视频' : '播放视频'}
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
            </div>
          </div>
        ) : posterSource ? (
          <img src={posterSource} alt="preview" draggable={false} />
        ) : (
          <div className="linghuiCompactThumbEmpty">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" />
              <polygon points="10,8 16,12 10,16" fill={nodeData.accent} fillOpacity="0.5" />
            </svg>
          </div>
        )}
        <div className="linghuiCompactThumbMeta">
          <EditableCompactNodeLabel
            nodeId={id}
            label={nodeData.label}
            fallbackLabel="视频"
          />
          <div className="linghuiCompactVideoIndicator">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
              <polygon points="3,1 10,6 3,11" />
            </svg>
          </div>
        </div>
        <div className="linghuiCompactThumbFooter">
          <span className={`linghuiCompactThumbCaption ${status === 'running' ? 'isRunning' : ''}`}>
            {status === 'running' ? <LoaderCircle size={12} className="linghuiCompactInlineSpinner" aria-hidden="true" /> : null}
            {footerCaption}
          </span>
        </div>
        {status === 'running' && (
          <div className="linghuiCompactThumbProgress">
            <div className="linghuiCompactProgressBar" />
          </div>
        )}
      </div>

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/video" /> : null}
    </div>
  );
}

export const VideoNode = memo(VideoNodeInner);
