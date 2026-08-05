import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DEasing,
  LinghuiDirector3DExportResolution,
  LinghuiDirector3DKeyframe,
  LinghuiDirector3DRenderMode,
  LinghuiDirector3DScene,
  LinghuiDirector3DTimeline,
  LinghuiNodeData,
} from '../../../../types/linghui';
import {
  cloneCameraForKeyframe,
  createDefaultDirector3DTimeline,
  interpolateSceneAt,
  resolveDirector3DExportDimensions,
  resolveDirector3DExportResolution,
  snapshotActorAsKeyframeActor,
} from '../../director3d/director3dScene';
import { exportDirector3DTimelineVideo } from '../../director3d/director3dTimelineExport';
import type {
  Director3DTimelineExportState,
  Director3DTimelineLayer,
} from '../../director3d/Director3DTimelineHud';
import type { Director3DViewportHandle } from '../../director3d/Director3DViewport';

interface UseDirector3DTimelineControllerParams {
  message: MessageInstance;
  nodeData: LinghuiNodeData;
  nodeId: string;
  renderModeForExport: LinghuiDirector3DRenderMode;
  scene: LinghuiDirector3DScene;
  selectedActor: LinghuiDirector3DActor | null;
  selectionKind: 'actor' | null;
  updateNodeData: (
    nodeId: string,
    updater: (previous: LinghuiNodeData) => LinghuiNodeData,
  ) => void;
  updateScene: (updater: (prev: LinghuiDirector3DScene) => LinghuiDirector3DScene) => void;
  viewportRef: React.RefObject<Director3DViewportHandle | null>;
}

export function useDirector3DTimelineController({
  message,
  nodeData,
  nodeId,
  renderModeForExport,
  scene,
  selectedActor,
  selectionKind,
  updateNodeData,
  updateScene,
  viewportRef,
}: UseDirector3DTimelineControllerParams) {
  const timeline = useMemo<LinghuiDirector3DTimeline>(
    () => scene.timeline ?? createDefaultDirector3DTimeline(),
    [scene.timeline],
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);

  useEffect(() => {
    if (!playing) return undefined;
    if (timeline.keyframes.length < 2) {
      setPlaying(false);
      return undefined;
    }
    let raf = 0;
    let lastTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setCurrentTime(prev => {
        const next = prev + dt;
        if (next >= timeline.duration) {
          setPlaying(false);
          return timeline.duration;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, timeline.duration, timeline.keyframes.length]);

  const runtimeScene = useMemo<LinghuiDirector3DScene>(() => {
    if (!scene.timeline || scene.timeline.keyframes.length === 0) return scene;
    return interpolateSceneAt(scene, currentTime);
  }, [currentTime, scene]);

  const updateTimeline = useCallback((updater: (prev: LinghuiDirector3DTimeline) => LinghuiDirector3DTimeline) => {
    updateScene(prev => {
      const nextTimeline = updater(prev.timeline ?? createDefaultDirector3DTimeline());
      return { ...prev, timeline: nextTimeline };
    });
  }, [updateScene]);

  const activeTimelineLayer = useMemo<Director3DTimelineLayer>(() => {
    if (selectionKind === 'actor' && selectedActor) {
      return { kind: 'actor', actorId: selectedActor.id, label: selectedActor.label || '物体' };
    }
    return { kind: 'camera', label: '镜头' };
  }, [selectedActor, selectionKind]);

  const handleAddKeyframe = useCallback(() => {
    updateScene(prev => {
      const baseTimeline = prev.timeline ?? createDefaultDirector3DTimeline();
      const captureTime = Math.max(0, Math.min(baseTimeline.duration, Number(currentTime.toFixed(3))));
      const newKfId = `kf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

      if (activeTimelineLayer.kind === 'camera') {
        const existing = baseTimeline.keyframes.find(k => {
          const scope = k.scope ?? 'scene';
          return (scope === 'camera' || scope === 'scene') && Math.abs(k.time - captureTime) < 0.02;
        });
        const cameraSnapshot = cloneCameraForKeyframe(prev.camera);
        const currentOrbit = viewportRef.current?.getCurrentOrbit();
        const cameraOrbit = currentOrbit ? { ...currentOrbit } : undefined;
        if (existing) {
          const updated = {
            ...existing,
            camera: cameraSnapshot,
            ...(cameraOrbit ? { cameraOrbit } : {}),
          };
          setSelectedKeyframeId(existing.id);
          return { ...prev, timeline: { ...baseTimeline, keyframes: baseTimeline.keyframes.map(k => (k.id === existing.id ? updated : k)) } };
        }
        const newKf: LinghuiDirector3DKeyframe = {
          id: newKfId,
          time: captureTime,
          scope: 'camera',
          actors: [],
          camera: cameraSnapshot,
          ...(cameraOrbit ? { cameraOrbit } : {}),
        };
        setSelectedKeyframeId(newKfId);
        return { ...prev, timeline: { ...baseTimeline, keyframes: [...baseTimeline.keyframes, newKf].sort((a, b) => a.time - b.time) } };
      }

      const actorId = activeTimelineLayer.actorId;
      const actor = prev.actors.find(a => a.id === actorId);
      if (!actor) return prev;
      const scope = `actor:${actorId}` as const;
      const existing = baseTimeline.keyframes.find(k => (k.scope ?? 'scene') === scope && Math.abs(k.time - captureTime) < 0.02);
      const snapshot = snapshotActorAsKeyframeActor(actor);
      if (existing) {
        const updated = { ...existing, actors: [snapshot] };
        setSelectedKeyframeId(existing.id);
        return { ...prev, timeline: { ...baseTimeline, keyframes: baseTimeline.keyframes.map(k => (k.id === existing.id ? updated : k)) } };
      }
      const newKf: LinghuiDirector3DKeyframe = {
        id: newKfId,
        time: captureTime,
        scope,
        actors: [snapshot],
        camera: prev.camera,
      };
      setSelectedKeyframeId(newKfId);
      return { ...prev, timeline: { ...baseTimeline, keyframes: [...baseTimeline.keyframes, newKf].sort((a, b) => a.time - b.time) } };
    });
  }, [activeTimelineLayer, currentTime, updateScene, viewportRef]);

  const handleRemoveKeyframe = useCallback((keyframeId: string) => {
    updateTimeline(prev => ({
      ...prev,
      keyframes: prev.keyframes.filter(k => k.id !== keyframeId),
    }));
    setSelectedKeyframeId(null);
  }, [updateTimeline]);

  const handleMoveKeyframe = useCallback((keyframeId: string, newTime: number) => {
    updateTimeline(prev => {
      const clamped = Math.max(0, Math.min(prev.duration, newTime));
      const moved = prev.keyframes
        .map(k => (k.id === keyframeId ? { ...k, time: Number(clamped.toFixed(3)) } : k))
        .sort((a, b) => a.time - b.time);
      return { ...prev, keyframes: moved };
    });
  }, [updateTimeline]);

  const handleSeek = useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(timeline.duration, t));
    setPlaying(false);
    setCurrentTime(clamped);
  }, [timeline.duration]);

  const handleDurationChange = useCallback((duration: number) => {
    updateTimeline(prev => ({ ...prev, duration }));
  }, [updateTimeline]);

  const handleFpsChange = useCallback((fps: number) => {
    updateTimeline(prev => ({ ...prev, fps }));
  }, [updateTimeline]);

  const handleEasingChange = useCallback((easing: LinghuiDirector3DEasing) => {
    updateTimeline(prev => ({ ...prev, easing }));
  }, [updateTimeline]);

  const handleExportResolutionChange = useCallback((resolution: LinghuiDirector3DExportResolution) => {
    updateTimeline(prev => ({ ...prev, exportResolution: resolution }));
  }, [updateTimeline]);

  const handleResetTimeline = useCallback(() => {
    updateScene(prev => ({ ...prev, timeline: createDefaultDirector3DTimeline() }));
    setSelectedKeyframeId(null);
    setCurrentTime(0);
    setPlaying(false);
  }, [updateScene]);

  const handlePlayToggle = useCallback(() => {
    setPlaying(prev => {
      if (prev) return false;
      if (currentTime >= timeline.duration - 0.001) {
        setCurrentTime(0);
      }
      return true;
    });
  }, [currentTime, timeline.duration]);

  const [timelineExport, setTimelineExport] = useState<Director3DTimelineExportState>({
    active: false,
    phase: null,
    current: 0,
    total: 0,
  });
  const exportAbortRef = useRef<AbortController | null>(null);

  const handleCancelTimelineExport = useCallback(() => {
    exportAbortRef.current?.abort();
  }, []);

  const handleExportTimelineVideo = useCallback(async () => {
    if (timelineExport.active) return;
    if (timeline.keyframes.length < 2) {
      message.warning('请先添加至少 2 个关键帧再导出');
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      message.warning('视口未就绪，请重试');
      return;
    }

    const exportResolution = resolveDirector3DExportResolution(timeline.exportResolution);
    const { width, height } = resolveDirector3DExportDimensions(exportResolution, scene.camera.aspectRatio);

    setPlaying(false);
    const abort = new AbortController();
    exportAbortRef.current = abort;
    setTimelineExport({ active: true, phase: 'render', current: 0, total: 0 });

    try {
      const result = await exportDirector3DTimelineVideo({
        nodeId,
        duration: timeline.duration,
        fps: timeline.fps,
        width,
        height,
        signal: abort.signal,
        renderFrameToDataUrl: async (t: number) => {
          if (abort.signal.aborted) return null;
          const frameScene = interpolateSceneAt(scene, t);
          setCurrentTime(t);
          return await viewport.captureCurrentView({
            width,
            height,
            renderMode: renderModeForExport,
            sceneOverride: frameScene,
            cameraOverride: frameScene.camera,
          });
        },
        onProgress: (current, total, phase) => {
          setTimelineExport({ active: true, phase, current, total });
        },
      });

      updateNodeData(nodeId, prev => ({
        ...prev,
        properties: {
          ...prev.properties,
          outputMode: 'video',
          timelineVideoUrl: result.localUrl,
          timelineVideoPosterUrl: result.firstFrameUrl,
          timelineVideoMeta: {
            duration: result.duration,
            fps: result.fps,
            frameCount: result.frameCount,
            width: result.width,
            height: result.height,
          },
        },
      }));
      message.success(`时间轴动画已导出 ${result.frameCount} 帧 (${result.duration.toFixed(1)}s @ ${result.fps}fps)`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('取消')) {
        message.info('已取消导出');
      } else {
        message.error(`导出失败：${msg}`);
      }
    } finally {
      exportAbortRef.current = null;
      setTimelineExport({ active: false, phase: null, current: 0, total: 0 });
    }
  }, [
    message,
    nodeId,
    renderModeForExport,
    scene,
    timeline.duration,
    timeline.exportResolution,
    timeline.fps,
    timeline.keyframes.length,
    timelineExport.active,
    updateNodeData,
    viewportRef,
  ]);

  const timelineVideoUrl = typeof (nodeData.properties as { timelineVideoUrl?: string } | undefined)?.timelineVideoUrl === 'string'
    ? (nodeData.properties as { timelineVideoUrl: string }).timelineVideoUrl
    : undefined;
  const timelineVideoPosterUrl = typeof (nodeData.properties as { timelineVideoPosterUrl?: string } | undefined)?.timelineVideoPosterUrl === 'string'
    ? (nodeData.properties as { timelineVideoPosterUrl: string }).timelineVideoPosterUrl
    : undefined;

  return {
    activeTimelineLayer,
    currentTime,
    handleAddKeyframe,
    handleCancelTimelineExport,
    handleDurationChange,
    handleEasingChange,
    handleExportResolutionChange,
    handleExportTimelineVideo,
    handleFpsChange,
    handleMoveKeyframe,
    handlePlayToggle,
    handleRemoveKeyframe,
    handleResetTimeline,
    handleSeek,
    playing,
    runtimeScene,
    selectedKeyframeId,
    setSelectedKeyframeId,
    timeline,
    timelineExport,
    timelineVideoPosterUrl,
    timelineVideoUrl,
  };
}
