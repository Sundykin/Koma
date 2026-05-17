/**
 * Panorama 720° sphere preview.
 *
 * Exports:
 *   - PanoramaViewport: standalone 3D viewport (Canvas + controls), embeddable in any container
 *   - PanoramaViewer: antd Modal fullscreen version, `open` controlled
 *
 * Child modules:
 *   - usePanoramaTexture (hooks/) - texture loading with CORS handling
 *   - PanoramaGeometryComponents - sphere/cylinder/plane mesh components
 *   - PanoramaCameraRig - camera follow rig with lerp
 *   - panoramaViewerConstants - geometry/visual constants
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from 'antd';
import { Maximize2 } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import type { PanoramaProjectionMode, PanoramaViewerMode } from './panoramaProjection';
import { resolvePanoramaViewerMode } from './panoramaProjection';
import { usePanoramaTexture } from './hooks/usePanoramaTexture';
import { PanoramaGeometry, SceneBackdrop } from './PanoramaGeometryComponents';
import { CameraRig } from './PanoramaCameraRig';
import {
  FOV_INITIAL, FOV_MIN, FOV_MAX, AUTO_ROTATE_DURATION_MS,
  pitchLimitForViewerMode,
} from './panoramaViewerConstants';

export interface PanoramaViewportProps {
  imageUrl: string;
  mountReady?: boolean;
  placeholder?: React.ReactNode;
  showFovHint?: boolean;
  onRequestFullscreen?: () => void;
  projectionMode?: PanoramaProjectionMode;
  viewerMode?: PanoramaViewerMode;
  ratioString?: string;
  onCurrentViewChange?: (view: { yaw: number; pitch: number; fovDeg: number }) => void;
}

export const PanoramaViewport: React.FC<PanoramaViewportProps> = ({
  imageUrl, mountReady = true, placeholder, showFovHint = true,
  onRequestFullscreen, projectionMode, viewerMode: viewerModeOverride,
  ratioString, onCurrentViewChange,
}) => {
  const yawTargetRef = useRef(0);
  const pitchTargetRef = useRef(0);
  const yawCurrentRef = useRef(0);
  const pitchCurrentRef = useRef(0);
  const fovRef = useRef(FOV_INITIAL);
  const autoRotateUntilRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [, forceFovTick] = useState(0);
  const textureState = usePanoramaTexture(mountReady ? imageUrl : '');

  const viewerMode: PanoramaViewerMode = useMemo(() => {
    if (viewerModeOverride) return viewerModeOverride;
    const tex = textureState.texture;
    const img = tex?.image as { width?: number; height?: number } | undefined;
    return resolvePanoramaViewerMode({ projectionMode, width: img?.width, height: img?.height, ratioString });
  }, [projectionMode, ratioString, textureState.texture, viewerModeOverride]);

  const pitchLimit = useMemo(() => pitchLimitForViewerMode(viewerMode), [viewerMode]);

  useEffect(() => {
    if (mountReady && imageUrl) {
      yawTargetRef.current = 0; pitchTargetRef.current = 0;
      yawCurrentRef.current = 0; pitchCurrentRef.current = 0;
      fovRef.current = FOV_INITIAL;
      autoRotateUntilRef.current = Date.now() + AUTO_ROTATE_DURATION_MS;
      isDraggingRef.current = false; setIsDragging(false);
      lastPointer.current = null;
    }
  }, [mountReady, imageUrl]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    lastPointer.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = true; setIsDragging(true);
    autoRotateUntilRef.current = 0;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !lastPointer.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    const sensitivity = (fovRef.current / FOV_INITIAL) * 0.005;
    if (viewerMode === 'flat') {
      yawTargetRef.current = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, yawTargetRef.current - dx * sensitivity));
    } else {
      yawTargetRef.current += -dx * sensitivity;
    }
    const next = pitchTargetRef.current + dy * sensitivity;
    pitchTargetRef.current = Math.max(-pitchLimit, Math.min(pitchLimit, next));
  }, [pitchLimit, viewerMode]);

  const onPointerUp = useCallback(() => {
    lastPointer.current = null;
    isDraggingRef.current = false; setIsDragging(false);
    onCurrentViewChange?.({ yaw: yawTargetRef.current, pitch: pitchTargetRef.current, fovDeg: fovRef.current });
  }, [onCurrentViewChange]);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const next = fovRef.current + (e.deltaY > 0 ? 2 : -2);
    fovRef.current = Math.max(FOV_MIN, Math.min(FOV_MAX, next));
    autoRotateUntilRef.current = 0;
    if (showFovHint) forceFovTick(n => n + 1);
    onCurrentViewChange?.({ yaw: yawTargetRef.current, pitch: pitchTargetRef.current, fovDeg: fovRef.current });
  }, [onCurrentViewChange, showFovHint]);

  return (
    <div className={`linghuiPanoramaViewport nodrag nopan nowheel ${imageUrl ? 'hasImage' : ''} ${isDragging ? 'isDragging' : ''}`}
      onPointerDown={imageUrl ? e => { e.stopPropagation(); onPointerDown(e); } : undefined}
      onPointerMove={imageUrl ? e => { e.stopPropagation(); onPointerMove(e); } : undefined}
      onPointerUp={imageUrl ? () => onPointerUp() : undefined}
      onPointerCancel={imageUrl ? () => onPointerUp() : undefined}
      onPointerLeave={imageUrl ? () => onPointerUp() : undefined}
      onWheel={imageUrl ? e => { e.stopPropagation(); onWheel(e); } : undefined}
    >
      {imageUrl && mountReady && textureState.status === 'ready' && textureState.texture ? (
        <div className="linghuiPanoramaCanvasShell">
          <Canvas camera={{ position: [0, 0, 0], fov: FOV_INITIAL, near: 0.1, far: 1000 }} dpr={[1, 2]}
            resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }} gl={{ antialias: true }}>
            <SceneBackdrop />
            <ambientLight intensity={1} />
            <PanoramaGeometry texture={textureState.texture} viewerMode={viewerMode} />
            <CameraRig yawTargetRef={yawTargetRef} pitchTargetRef={pitchTargetRef}
              yawCurrentRef={yawCurrentRef} pitchCurrentRef={pitchCurrentRef}
              fovRef={fovRef} autoRotateUntilRef={autoRotateUntilRef} isDraggingRef={isDraggingRef} />
          </Canvas>
        </div>
      ) : (
        <div className="linghuiPanoramaPlaceholder">
          {!imageUrl ? (placeholder ?? '暂无全景图')
            : textureState.status === 'error' ? `加载失败：${textureState.error || '未知错误'}`
            : (placeholder ?? '加载中…')}
        </div>
      )}
      {showFovHint && imageUrl && mountReady && textureState.status === 'ready' && (
        <div className="linghuiPanoramaFovHint">拖拽旋转 · 滚轮缩放（视野 {Math.round(fovRef.current)}°）</div>
      )}
      {onRequestFullscreen && imageUrl && mountReady && textureState.status === 'ready' && (
        <button type="button" onClick={e => { e.stopPropagation(); onRequestFullscreen(); }} onPointerDown={e => e.stopPropagation()}
          className="linghuiPanoramaFullscreenButton" title="全屏查看"><Maximize2 size={12} />全屏</button>
      )}
    </div>
  );
};

interface PanoramaViewerProps {
  open: boolean;
  imageUrl: string;
  title?: string;
  onClose: () => void;
  projectionMode?: PanoramaProjectionMode;
  viewerMode?: PanoramaViewerMode;
  ratioString?: string;
  onApplyPerspective?: (view: { yaw: number; pitch: number; fovDeg: number }) => Promise<void> | void;
}

export const PanoramaViewer: React.FC<PanoramaViewerProps> = ({
  open, imageUrl, title, onClose, projectionMode, viewerMode, ratioString, onApplyPerspective,
}) => {
  const [mountReady, setMountReady] = useState(false);
  const handleAfterOpenChange = useCallback((nextOpen: boolean) => setMountReady(p => p === nextOpen ? p : nextOpen), []);
  const currentViewRef = useRef<{ yaw: number; pitch: number; fovDeg: number }>({ yaw: 0, pitch: 0, fovDeg: 75 });
  const [applying, setApplying] = useState(false);
  const handleApply = useCallback(async () => {
    if (!onApplyPerspective || applying) return;
    setApplying(true);
    try { await onApplyPerspective({ ...currentViewRef.current }); onClose(); }
    finally { setApplying(false); }
  }, [applying, onApplyPerspective, onClose]);

  return (
    <Modal title={title || '全景预览'} open={open} onCancel={onClose} footer={null} width="min(96vw, 1600px)"
      destroyOnHidden centered className="linghuiPanoramaModal" rootClassName="linghuiPanoramaModal"
      afterOpenChange={handleAfterOpenChange}>
      <div className="linghuiPanoramaModalViewport">
        <PanoramaViewport imageUrl={imageUrl} mountReady={mountReady} projectionMode={projectionMode}
          viewerMode={viewerMode} ratioString={ratioString}
          onCurrentViewChange={view => { currentViewRef.current = view; }} />
        {onApplyPerspective ? (
          <button type="button" className="linghuiPanoramaApplyButton"
            onClick={e => { e.stopPropagation(); void handleApply(); }} disabled={applying}
            title="把当前视角抽成 perspective 图，派生为下游图片节点">
            {applying ? '生成中…' : '应用此视角到图片节点'}
          </button>
        ) : null}
      </div>
    </Modal>
  );
};

export default PanoramaViewer;
