/**
 * Director3D 节点编辑器：三层布局参考用户提供的截图。
 *
 *   ┌─────────┬───────────────────────────────┬───────────┐
 *   │ 资产库   │  3D 视口（中心）                │ 属性面板    │
 *   │ 道具/人物│  + 镜头条 + 渲染模式切换         │ 选中物体    │
 *   │ 视角/模板 │                               │            │
 *   └─────────┴───────────────────────────────┴───────────┘
 *
 *  - 左：可点击的资产 = 添加道具 / 添加假人 / 视角预设 / 场景模板
 *  - 中：Director3DViewport + 镜头条（FOV / 比例）
 *  - 右：选中假人 → 编辑位置/朝向/姿态/颜色；未选中假人 → 编辑当前取景视角参数
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, InputNumber, Popover, Slider, Tooltip } from 'antd';
import { useNodes } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { ArrowRight, Box, Camera, Cylinder, Eye, Grid2x2, Grid3x3, Image as ImageIcon, LayoutTemplate, Layers, Link2, Link2Off, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Square, Trash2, Users, Wand2, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DActorPose,
  LinghuiDirector3DAngleView,
  LinghuiDirector3DBackgroundMode,
  LinghuiDirector3DEasing,
  LinghuiDirector3DKeyframe,
  LinghuiDirector3DNodeProperties,
  LinghuiDirector3DRenderMode,
  LinghuiDirector3DScene,
  LinghuiDirector3DTimeline,
  LinghuiNodeData,
  LinghuiNodeRunState,
} from '../../../../types/linghui';
import {
  DIRECTOR3D_CAMERA_PRESETS,
  DIRECTOR3D_CAMERA_PRESET_CATEGORY_LABELS,
  DIRECTOR3D_CHARACTER_PRESETS,
  DIRECTOR3D_ORBIT_9_DEGREES,
  DIRECTOR3D_POSE_OPTIONS,
  DIRECTOR3D_PROP_CATEGORY_LABELS,
  DIRECTOR3D_PROP_LIBRARY,
  DIRECTOR3D_SCENE_TEMPLATES,
  DIRECTOR3D_THREE_VIEW_DEGREES,
  type Director3DBattalionOptions,
  type Director3DCameraPreset,
  type Director3DCameraPresetCategory,
  type Director3DCharacterPreset,
  type Director3DPropCategory,
  type Director3DPropPreset,
  buildOrbitCameras,
  buildTopDownCamera,
  captureSceneAsKeyframe,
  compileDirector3DPromptFragment,
  createDefaultDirector3DScene,
  createDefaultDirector3DTimeline,
  createDirector3DActor,
  createDirector3DBattalion,
  createDirector3DCharacter,
  createDirector3DLiteSoldier,
  createDirector3DProp,
  groupDirector3DCameraPresets,
  interpolateSceneAt,
} from '../../director3d/director3dScene';
import { Director3DTimelineHud, type Director3DTimelineExportState } from '../../director3d/Director3DTimelineHud';
import { exportDirector3DTimelineVideo } from '../../director3d/director3dTimelineExport';
import { useLinghuiGlobalAssets, type LinghuiGlobalAsset, type LinghuiGlobalAssetCategory, type LinghuiGlobalAssetPropType } from '../../../../store/linghuiGlobalAssets';
import { Save as SaveIcon, Bookmark, BookmarkCheck } from 'lucide-react';
import { toDirector3DColorInputValue } from '../../director3d/director3dColors';
import { Director3DViewport, type Director3DViewportHandle } from '../../director3d/Director3DViewport';
import { useLinghuiNodeEditorApi, useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { getLinghuiResultPrimaryMedia } from '../../../../types/linghui';

interface Director3DNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  onRun?: () => void;
}

type SelectionKind = 'actor' | null;
interface Selection {
  kind: SelectionKind;
  actorId?: string;
}

const ASSET_PROPS: Array<{ id: string; label: string }> = [
  { id: 'mannequin', label: '假人' },
];

const PROP_ICON_BY_TYPE: Record<Director3DPropPreset['type'], LucideIcon> = {
  'prop-box': Box,
  'prop-cylinder': Cylinder,
  'prop-plane': Square,
  'prop-camera': Camera,
  'prop-arrow': ArrowRight,
};

// 摄影机预设分组顺序：景别 → 角度 → 焦段 → 经典镜头
const CAMERA_PRESET_CATEGORY_ORDER: Director3DCameraPresetCategory[] = ['shot-size', 'angle', 'lens', 'classic'];

const ASPECT_RATIOS = ['16:9', '21:9', '4:3', '1:1', '9:16'];

const RENDER_MODE_LABELS: Record<LinghuiDirector3DRenderMode, string> = {
  lineart: '线稿',
  silhouette: '剪影',
  depth: '深度',
  composition: '构图',
};

function getScene(properties: Record<string, unknown> | undefined): LinghuiDirector3DScene {
  const raw = (properties as Partial<LinghuiDirector3DNodeProperties> | undefined)?.scene;
  if (raw && typeof raw === 'object') return raw as LinghuiDirector3DScene;
  return createDefaultDirector3DScene();
}

export const Director3DNodeEditor: React.FC<Director3DNodeEditorProps> = ({ nodeId, nodeData }) => {
  const { message } = App.useApp();
  const { updateNodeData } = useLinghuiNodeMutation();
  const editorApi = useLinghuiNodeEditorApi();
  const canvasNodes = useNodes();
  // split-view 候选源：画布上所有 image / panorama / video 节点
  const previewCandidates = useMemo(() => {
    return (canvasNodes as Array<Node<Record<string, unknown>>>).flatMap((node) => {
      const data = node.data as { linghuiType?: string; label?: string } | undefined;
      const kind = data?.linghuiType;
      if (kind !== 'linghui/image' && kind !== 'linghui/panorama' && kind !== 'linghui/video') {
        return [];
      }
      return [{
        id: node.id,
        label: data?.label || node.id.slice(0, 6),
        kind: kind as 'linghui/image' | 'linghui/panorama' | 'linghui/video',
      }];
    });
  }, [canvasNodes]);

  const previewBindingId = editorApi.directorPreviewBindings?.[nodeId];
  const previewNodeRun = previewBindingId ? editorApi.nodeRuns[previewBindingId] : undefined;
  const previewCandidate = previewBindingId ? previewCandidates.find(item => item.id === previewBindingId) : undefined;
  const previewPrimary = getLinghuiResultPrimaryMedia(previewNodeRun?.result);
  const previewSource = toFileSystemDisplayUrl(previewPrimary?.source) ?? previewPrimary?.posterSource ?? '';
  const [previewPickerOpen, setPreviewPickerOpen] = useState(false);

  const handleBindPreview = useCallback((previewNodeId: string) => {
    editorApi.setDirectorPreviewBinding?.(nodeId, previewNodeId);
    setPreviewPickerOpen(false);
  }, [editorApi, nodeId]);

  const handleUnbindPreview = useCallback(() => {
    editorApi.setDirectorPreviewBinding?.(nodeId, null);
  }, [editorApi, nodeId]);

  const handleRunBoundPreview = useCallback(() => {
    if (!previewBindingId) return;
    editorApi.onRunNode?.(previewBindingId);
  }, [editorApi, previewBindingId]);

  // 实时模式状态：场景变更（actors / camera）→ 防抖 800ms → 静默重导出 lineart → 跑预览节点
  // 实际 useEffect 在 scene / renderModeForExport / viewportRef 声明之后定义
  const [realtimeOn, setRealtimeOn] = useState(false);
  const realtimePendingRef = useRef<number | null>(null);
  const realtimeRunningRef = useRef(false);

  const scene = useMemo(() => getScene(nodeData.properties), [nodeData.properties]);
  const [selection, setSelection] = useState<Selection>({ kind: null });
  const [activeAssetTab, setActiveAssetTab] = useState<'props' | 'characters' | 'cameras' | 'templates'>('characters');
  const [renderModeForExport, setRenderModeForExport] = useState<LinghuiDirector3DRenderMode>('lineart');
  const [previewMode, setPreviewMode] = useState<'preview' | 'lineart' | 'silhouette'>('preview');
  // HUD 控制：左/右两侧浮层可分别折叠；Cmd+F 进入沉浸（隐藏全部）
  const [assetsHudOpen, setAssetsHudOpen] = useState(true);
  const [inspectorHudOpen, setInspectorHudOpen] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const viewportRef = useRef<Director3DViewportHandle | null>(null);

  const updateScene = useCallback((updater: (prev: LinghuiDirector3DScene) => LinghuiDirector3DScene) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, scene: updater(getScene(prev.properties)) },
    }));
  }, [nodeId, updateNodeData]);

  const selectedActor = useMemo(() => {
    if (selection.kind !== 'actor') return null;
    return scene.actors.find(a => a.id === selection.actorId) ?? null;
  }, [scene.actors, selection]);

  // "派兵布阵"：生成一个整体方阵 actor（type='formation'），rows × cols 个小人由
  // Director3DFormation 派生渲染，整体可移动旋转，不可单独拆移
  const [battalionConfig, setBattalionConfig] = useState<{
    rows: number;
    cols: number;
    spacing: number;
    memberFacing: Director3DBattalionOptions['memberFacing'];
  }>({ rows: 3, cols: 5, spacing: 1.0, memberFacing: 'forward' });
  const [battalionOpen, setBattalionOpen] = useState(false);

  const handleDeployBattalion = useCallback(() => {
    const total = battalionConfig.rows * battalionConfig.cols;
    if (total > 64) {
      message.warning(`方阵规模 ${total} 个成员偏大，可能影响视口流畅度`);
    }
    updateScene(prev => {
      const formationCount = prev.actors.filter(a => a.type === 'formation').length + 1;
      const formation = createDirector3DBattalion({
        rows: battalionConfig.rows,
        cols: battalionConfig.cols,
        spacing: battalionConfig.spacing,
        memberFacing: battalionConfig.memberFacing,
        label: `方阵 ${formationCount} (${battalionConfig.rows}×${battalionConfig.cols})`,
      });
      return { ...prev, actors: [...prev.actors, formation] };
    });
    message.success(`已部署方阵 ${battalionConfig.rows}×${battalionConfig.cols}（${total} 人，整体可拖拽）`);
    setBattalionOpen(false);
  }, [battalionConfig, message, updateScene]);

  // 单兵群演占位：点一次加一个独立可拖拽的 mannequin-lite
  const handleAddLiteSoldier = useCallback(() => {
    updateScene(prev => {
      const liteCount = prev.actors.filter(a => a.type === 'mannequin-lite').length;
      const lite = createDirector3DLiteSoldier({
        id: `lite_${Date.now().toString(36)}_${liteCount}`,
        label: `群演 ${liteCount + 1}`,
        position: [
          (liteCount % 2 === 0 ? 1 : -1) * 0.6 * (Math.floor(liteCount / 2) + 1),
          0,
          -0.8,
        ],
      });
      return { ...prev, actors: [...prev.actors, lite] };
    });
  }, [updateScene]);

  const handleAddCharacter = useCallback((preset: Director3DCharacterPreset) => {
    updateScene(prev => {
      const seq = prev.actors.filter(a => a.type === 'mannequin').length + 1;
      const offsetX = (seq % 2 === 1 ? 1 : -1) * 0.7 * Math.ceil(seq / 2);
      const character = createDirector3DCharacter(preset, {
        id: `char_${preset.id}_${Date.now().toString(36)}`,
        label: `${preset.label} ${seq}`,
        position: [Number(offsetX.toFixed(2)), 0, 0],
      });
      return { ...prev, actors: [...prev.actors, character] };
    });
  }, [updateScene]);

  // 全局资产库（C-5B）：跨 workspace 用户自定义角色 / 道具
  const characterAssets = useLinghuiGlobalAssets({ kind: 'character' });
  const propAssets = useLinghuiGlobalAssets({ kind: 'prop' });

  const handleSaveSelectedAsGlobalAsset = useCallback(async () => {
    if (selection.kind !== 'actor' || !selectedActor) {
      message.info('请先选中一个角色 / 道具再保存到全局库');
      return;
    }
    if (selectedActor.type === 'formation' || selectedActor.type === 'mannequin-lite') {
      message.warning('方阵 / 群演不支持保存到全局库');
      return;
    }
    const isProp = selectedActor.type.startsWith('prop-');
    try {
      const saved = isProp
        ? await propAssets.save({
            kind: 'prop',
            label: selectedActor.label,
            color: selectedActor.color,
            scale: selectedActor.scale,
            propType: selectedActor.type as LinghuiGlobalAssetPropType,
            category: 'gear',
          })
        : await characterAssets.save({
            kind: 'character',
            label: selectedActor.label,
            color: selectedActor.color,
            scale: selectedActor.scale,
            posePreset: selectedActor.posePreset,
          });
      message.success(`已保存到全局库：${saved.label}`);
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '保存到全局库失败');
    }
  }, [characterAssets, message, propAssets, selectedActor, selection.kind]);

  const handleAddGlobalAsset = useCallback((asset: LinghuiGlobalAsset) => {
    if (asset.kind === 'character') {
      updateScene(prev => {
        const seq = prev.actors.filter(a => a.type === 'mannequin').length + 1;
        const offsetX = (seq % 2 === 1 ? 1 : -1) * 0.7 * Math.ceil(seq / 2);
        const actor = createDirector3DActor({
          id: `char_${asset.id}_${Date.now().toString(36)}`,
          type: 'mannequin',
          label: asset.label,
          color: asset.color,
          scale: asset.scale ?? 1,
          posePreset: asset.posePreset ?? 'idle',
          position: [Number(offsetX.toFixed(2)), 0, 0],
        });
        return { ...prev, actors: [...prev.actors, actor] };
      });
    } else {
      // prop
      updateScene(prev => {
        const propsInScene = prev.actors.filter(a => a.type === asset.propType).length;
        const actor = createDirector3DActor({
          id: `prop_${asset.id}_${Date.now().toString(36)}`,
          type: asset.propType ?? 'prop-box',
          label: asset.label,
          color: asset.color,
          scale: asset.scale ?? 1,
          position: [
            (propsInScene % 2 === 0 ? 1 : -1) * 0.8 * (Math.floor(propsInScene / 2) + 1),
            0,
            -1.2,
          ],
        });
        return { ...prev, actors: [...prev.actors, actor] };
      });
    }
  }, [updateScene]);

  const handleToggleAssetFavorite = useCallback(async (asset: LinghuiGlobalAsset) => {
    const target = asset.kind === 'character' ? characterAssets : propAssets;
    await target.save({
      id: asset.id,
      kind: asset.kind,
      label: asset.label,
      color: asset.color,
      scale: asset.scale,
      posePreset: asset.posePreset,
      propType: asset.propType,
      category: asset.category as LinghuiGlobalAssetCategory | undefined,
      favorite: !asset.favorite,
    });
  }, [characterAssets, propAssets]);

  const handleDeleteGlobalAsset = useCallback(async (asset: LinghuiGlobalAsset) => {
    const target = asset.kind === 'character' ? characterAssets : propAssets;
    const ok = await target.remove(asset.id);
    if (ok) message.success(`已从全局库删除：${asset.label}`);
  }, [characterAssets, message, propAssets]);

  // 道具分组：UI 按 category 折行渲染（基础/家具/载具/自然/道具）
  const propsByCategory = useMemo(() => {
    return DIRECTOR3D_PROP_LIBRARY.reduce((acc, preset) => {
      acc[preset.category] = acc[preset.category] || [];
      acc[preset.category].push(preset);
      return acc;
    }, {} as Record<Director3DPropCategory, Director3DPropPreset[]>);
  }, []);
  const propCategoryOrder: Director3DPropCategory[] = ['basic', 'furniture', 'vehicle', 'nature', 'gear'];

  const handleAddActor = useCallback(() => {
    updateScene(prev => {
      const id = `actor_${Date.now().toString(36)}`;
      const actor = createDirector3DActor({
        id,
        label: `角色${prev.actors.length + 1}`,
        position: [
          (prev.actors.length % 2 === 0 ? 1 : -1) * 0.6 * (Math.floor(prev.actors.length / 2) + 1),
          0,
          0,
        ],
      });
      return { ...prev, actors: [...prev.actors, actor] };
    });
  }, [updateScene]);

  const handleApplyCameraPreset = useCallback((preset: Director3DCameraPreset) => {
    updateScene(prev => {
      const nextCamera = preset.apply(prev.camera);
      // 保留最近 3 个预设 id（最新在前）；同一预设连点不会重复记录
      const previousTrail = prev.render.lastCameraPresetIds ?? [];
      const filteredTrail = previousTrail.filter(id => id !== preset.id);
      const nextTrail = [preset.id, ...filteredTrail].slice(0, 3);
      return {
        ...prev,
        camera: nextCamera,
        render: { ...prev.render, lastCameraPresetIds: nextTrail },
      };
    });
    setSelection({ kind: null });
  }, [updateScene]);

  // 预设分组（memo 一次，避免每次渲染都 reduce）
  const cameraPresetGroups = useMemo(() => groupDirector3DCameraPresets(), []);
  const lastCameraPresetIds = scene.render.lastCameraPresetIds ?? [];

  /* ========== 时间轴（C-6A）========== */
  const timeline = useMemo<LinghuiDirector3DTimeline>(
    () => scene.timeline ?? createDefaultDirector3DTimeline(),
    [scene.timeline],
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);

  // 播放循环：requestAnimationFrame 推进 currentTime，到达 duration 自动停
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

  // runtimeScene：用于 viewport 渲染的"当前时间帧"，不回写到 properties
  const runtimeScene = useMemo<LinghuiDirector3DScene>(() => {
    if (!scene.timeline || scene.timeline.keyframes.length === 0) return scene;
    return interpolateSceneAt(scene, currentTime);
  }, [currentTime, scene]);

  // 工具：把 timeline 写回 scene
  const updateTimeline = useCallback((updater: (prev: LinghuiDirector3DTimeline) => LinghuiDirector3DTimeline) => {
    updateScene(prev => {
      const nextTimeline = updater(prev.timeline ?? createDefaultDirector3DTimeline());
      return { ...prev, timeline: nextTimeline };
    });
  }, [updateScene]);

  const handleAddKeyframe = useCallback(() => {
    updateScene(prev => {
      const baseTimeline = prev.timeline ?? createDefaultDirector3DTimeline();
      // 同时间点已存在 → 覆盖；否则插入并排序
      const captureTime = Math.max(0, Math.min(baseTimeline.duration, currentTime));
      const existing = baseTimeline.keyframes.find(k => Math.abs(k.time - captureTime) < 0.01);
      const newKf = captureSceneAsKeyframe(prev, captureTime);
      const nextKeyframes = existing
        ? baseTimeline.keyframes.map(k => (k.id === existing.id ? { ...newKf, id: existing.id, label: existing.label } : k))
        : [...baseTimeline.keyframes, newKf].sort((a, b) => a.time - b.time);
      setSelectedKeyframeId(existing ? existing.id : newKf.id);
      return { ...prev, timeline: { ...baseTimeline, keyframes: nextKeyframes } };
    });
  }, [currentTime, updateScene]);

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

  const handleResetTimeline = useCallback(() => {
    updateScene(prev => ({ ...prev, timeline: createDefaultDirector3DTimeline() }));
    setSelectedKeyframeId(null);
    setCurrentTime(0);
    setPlaying(false);
  }, [updateScene]);

  const handlePlayToggle = useCallback(() => {
    setPlaying(prev => {
      if (prev) return false;
      // 从末尾按 play → 跳回开头
      if (currentTime >= timeline.duration - 0.001) {
        setCurrentTime(0);
      }
      return true;
    });
  }, [currentTime, timeline.duration]);

  /* ========== 时间轴导出视频（C-6B）========== */
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

    // 计算输出尺寸：按当前镜头 aspectRatio 推 1024 宽
    const aspectParts = scene.camera.aspectRatio.split(':');
    const ratio = aspectParts.length === 2 ? Number(aspectParts[0]) / Number(aspectParts[1]) : 16 / 9;
    const width = 1024;
    const height = Math.round(width / ratio);

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
          setCurrentTime(t);
          // 等两个 RAF 让 React 状态提交 + r3f 渲染完成
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          if (abort.signal.aborted) return null;
          return await viewport.captureCurrentView({ width, height, renderMode: renderModeForExport });
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
  }, [message, nodeId, renderModeForExport, scene.camera.aspectRatio, timeline.duration, timeline.fps, timeline.keyframes.length, timelineExport.active, updateNodeData]);
  /* ========== 时间轴 end ========== */

  const handleAddProp = useCallback((preset: Director3DPropPreset) => {
    updateScene(prev => {
      const propsInScene = prev.actors.filter(a => a.type === preset.type).length;
      const prop = createDirector3DProp(preset, {
        id: `${preset.type}_${Date.now().toString(36)}`,
        label: `${preset.label} ${propsInScene + 1}`,
        position: [
          (propsInScene % 2 === 0 ? 1 : -1) * 0.8 * (Math.floor(propsInScene / 2) + 1),
          0,
          -1.2,
        ],
      });
      return { ...prev, actors: [...prev.actors, prop] };
    });
  }, [updateScene]);

  const handleApplyTemplate = useCallback((templateId: string) => {
    const template = DIRECTOR3D_SCENE_TEMPLATES.find(item => item.id === templateId);
    if (!template) return;

    updateScene(prev => {
      const built = template.build();
      return {
        ...built,
        // 保留用户当前的背景设置，模板只负责动相机与演员摆位
        background: prev.background,
      };
    });
    setSelection({ kind: null });
    message.success(`已应用模板：${template.label}`);
  }, [message, updateScene]);

  const handleActorChange = useCallback((actorId: string, patch: Partial<LinghuiDirector3DActor>) => {
    updateScene(prev => ({
      ...prev,
      actors: prev.actors.map(a => (a.id === actorId ? { ...a, ...patch } : a)),
    }));
  }, [updateScene]);

  const handleActorMove = useCallback((actorId: string, position: [number, number, number]) => {
    handleActorChange(actorId, { position });
  }, [handleActorChange]);

  const handleDeleteActor = useCallback((actorId: string) => {
    updateScene(prev => ({ ...prev, actors: prev.actors.filter(a => a.id !== actorId) }));
    setSelection({ kind: null });
  }, [updateScene]);

  const handleCameraField = useCallback(<K extends keyof LinghuiDirector3DScene['camera']>(
    field: K,
    value: LinghuiDirector3DScene['camera'][K],
  ) => {
    updateScene(prev => ({ ...prev, camera: { ...prev.camera, [field]: value } }));
  }, [updateScene]);

  const handleCameraChange = useCallback((camera: LinghuiDirector3DScene['camera']) => {
    updateScene(prev => ({ ...prev, camera }));
  }, [updateScene]);

  const handleBackgroundModeChange = useCallback((mode: LinghuiDirector3DBackgroundMode) => {
    updateScene(prev => ({ ...prev, background: { ...prev.background, mode } }));
  }, [updateScene]);

  const handleExportLineart = useCallback(async () => {
    const currentCamera = viewportRef.current?.getCurrentCamera();
    const dataUrl = await viewportRef.current?.captureCurrentView({ width: 1280, renderMode: renderModeForExport });
    if (!dataUrl) {
      message.warning('导出失败，请重试');
      return;
    }
    const modeLabel = RENDER_MODE_LABELS[renderModeForExport];
    // 把 dataUrl 写到节点 properties，方便下游图片节点直接拿来当参考。
    // 不同 renderMode 共享同一份 lineartDataUrl 字段（下游不感知具体风格，只需要"参考图"），
    // 但 metadata 里同时透传 exportRenderMode 用于排错与日志。
    updateNodeData(nodeId, prev => {
      const props = prev.properties as Partial<LinghuiDirector3DNodeProperties>;
      const nextScene = {
        ...getScene(prev.properties),
        camera: currentCamera ?? getScene(prev.properties).camera,
        render: {
          ...getScene(prev.properties).render,
          mode: renderModeForExport,
        },
      };
      const fragment = compileDirector3DPromptFragment(nextScene);
      return {
        ...prev,
        properties: {
          ...prev.properties,
          scene: nextScene,
          prompt: props.prompt ?? '',
          lineartDataUrl: dataUrl,
          directorPromptFragment: fragment,
          exportRenderMode: renderModeForExport,
        },
      };
    });
    message.success(`${modeLabel}已生成，可在下游图片节点引用`);
  }, [message, nodeId, renderModeForExport, updateNodeData]);

  const handleBatchExport = useCallback(async (
    kind: 'three-view' | 'orbit-9',
  ) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const baseCamera = viewport.getCurrentCamera();

    const cameras = kind === 'three-view'
      ? buildOrbitCameras(baseCamera, DIRECTOR3D_THREE_VIEW_DEGREES).map((cam, idx) => ({
          camera: cam,
          label: ['正面', '侧面', '背面'][idx] ?? `视角 ${idx + 1}`,
        }))
      : [
          ...buildOrbitCameras(baseCamera, DIRECTOR3D_ORBIT_9_DEGREES).map((cam, idx) => ({
            camera: cam,
            label: `环绕 ${DIRECTOR3D_ORBIT_9_DEGREES[idx]}°`,
          })),
          { camera: buildTopDownCamera(baseCamera), label: '俯视' },
        ];

    const exported: LinghuiDirector3DAngleView[] = [];
    for (let i = 0; i < cameras.length; i += 1) {
      const { camera, label } = cameras[i];
      const dataUrl = await viewport.captureCurrentView({
        width: 768,
        renderMode: renderModeForExport,
        cameraOverride: camera,
      });
      if (!dataUrl) continue;
      exported.push({
        id: `angle_${Date.now().toString(36)}_${i}`,
        label,
        dataUrl,
        camera,
        renderMode: renderModeForExport,
      });
    }

    if (!exported.length) {
      message.warning('批量导出失败，请重试');
      return;
    }

    // 主图取第一张，scene.camera 也跟着第一张视角；其余存入 angleViews
    const [primary, ...rest] = exported;
    updateNodeData(nodeId, prev => {
      const baseScene = getScene(prev.properties);
      const nextScene = {
        ...baseScene,
        camera: primary.camera,
        render: { ...baseScene.render, mode: renderModeForExport },
      };
      return {
        ...prev,
        properties: {
          ...prev.properties,
          scene: nextScene,
          lineartDataUrl: primary.dataUrl,
          directorPromptFragment: compileDirector3DPromptFragment(nextScene),
          exportRenderMode: renderModeForExport,
          angleViews: rest,
          lastAngleBatchKind: kind,
        },
      };
    });
    const label = kind === 'three-view' ? '三视图' : '九宫格';
    message.success(`${label}已生成 ${exported.length} 张，主图为第一张，其余可在下游用 item N 引用`);
  }, [message, nodeId, renderModeForExport, updateNodeData]);

  // 监听场景关键变化（actors / camera / background），实时模式下据此触发防抖出图
  const sceneSignature = useMemo(() => JSON.stringify({
    actors: scene.actors.map(a => ({ id: a.id, pos: a.position, rot: a.rotationY, scale: a.scale, pose: a.posePreset, type: a.type, formation: a.formation })),
    camera: scene.camera,
    background: scene.background,
  }), [scene]);

  useEffect(() => {
    if (!realtimeOn || !previewBindingId) return undefined;
    if (realtimePendingRef.current !== null) {
      window.clearTimeout(realtimePendingRef.current);
    }
    realtimePendingRef.current = window.setTimeout(async () => {
      realtimePendingRef.current = null;
      if (realtimeRunningRef.current) return;
      realtimeRunningRef.current = true;
      try {
        // 1. 静默重导出 lineart 到 properties，让 director3d.executeNode 拿到新数据
        const dataUrl = await viewportRef.current?.captureCurrentView({ width: 1280, renderMode: renderModeForExport });
        if (dataUrl) {
          updateNodeData(nodeId, prev => {
            const baseScene = getScene(prev.properties);
            const nextScene = {
              ...baseScene,
              camera: viewportRef.current?.getCurrentCamera() ?? baseScene.camera,
              render: { ...baseScene.render, mode: renderModeForExport },
            };
            return {
              ...prev,
              properties: {
                ...prev.properties,
                scene: nextScene,
                lineartDataUrl: dataUrl,
                directorPromptFragment: compileDirector3DPromptFragment(nextScene),
                exportRenderMode: renderModeForExport,
              },
            };
          });
        }
        // 2. 串联跑 director3d + 预览节点
        if (editorApi.onRunDirectorWithPreview) {
          await editorApi.onRunDirectorWithPreview(nodeId, previewBindingId);
        }
      } catch (_error) {
        // 静默失败：实时模式不应该因为一次失败而炸窗
      } finally {
        realtimeRunningRef.current = false;
      }
    }, 800);

    return () => {
      if (realtimePendingRef.current !== null) {
        window.clearTimeout(realtimePendingRef.current);
        realtimePendingRef.current = null;
      }
    };
  }, [editorApi, nodeId, previewBindingId, realtimeOn, renderModeForExport, sceneSignature, updateNodeData]);

  useEffect(() => () => {
    // 卸载（关闭 Modal / 切节点）时清掉 pending，防止后台炸 run
    if (realtimePendingRef.current !== null) {
      window.clearTimeout(realtimePendingRef.current);
      realtimePendingRef.current = null;
    }
  }, []);

  const lineartPreview = (nodeData.properties as { lineartDataUrl?: string } | undefined)?.lineartDataUrl;
  const angleViews = useMemo<LinghuiDirector3DAngleView[]>(() => {
    const raw = (nodeData.properties as { angleViews?: unknown } | undefined)?.angleViews;
    return Array.isArray(raw) ? (raw as LinghuiDirector3DAngleView[]) : [];
  }, [nodeData.properties]);

  // HUD 快捷键：Tab 折叠、Cmd/Ctrl+F 沉浸、1-4 切渲染模式、F 聚焦演员（暂未实装聚焦相机，仅切换选中）
  const renderModeKeys = useMemo<LinghuiDirector3DRenderMode[]>(
    () => Object.keys(RENDER_MODE_LABELS) as LinghuiDirector3DRenderMode[],
    [],
  );
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // 在文本输入控件里时不接管快捷键（避免与 InputNumber / 命名输入冲突）
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setImmersive(prev => !prev);
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        const bothOpen = assetsHudOpen && inspectorHudOpen;
        if (bothOpen) {
          setAssetsHudOpen(false);
          setInspectorHudOpen(false);
        } else {
          setAssetsHudOpen(true);
          setInspectorHudOpen(true);
        }
        return;
      }

      if (/^[1-9]$/.test(event.key)) {
        const idx = Number(event.key) - 1;
        const mode = renderModeKeys[idx];
        if (mode) {
          event.preventDefault();
          setRenderModeForExport(mode);
          setPreviewMode(mode === 'silhouette' ? 'silhouette' : mode === 'lineart' ? 'lineart' : 'preview');
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [assetsHudOpen, inspectorHudOpen, renderModeKeys]);

  const stats = useMemo(() => {
    const mannequins = scene.actors.filter(a => a.type === 'mannequin').length;
    const liteMannequins = scene.actors.filter(a => a.type === 'mannequin-lite').length;
    const formationActors = scene.actors.filter(a => a.type === 'formation');
    const formations = formationActors.length;
    const formationMembers = formationActors.reduce((sum, actor) => {
      const cfg = actor.formation;
      if (!cfg) return sum;
      return sum + Math.max(1, Math.round(cfg.rows)) * Math.max(1, Math.round(cfg.cols));
    }, 0);
    const props = scene.actors.length - mannequins - liteMannequins - formations;
    return { mannequins, liteMannequins, formations, formationMembers, props };
  }, [scene.actors]);

  const panelClassName = [
    'linghuiEditorPanel',
    'linghuiDirector3DEditorPanel',
    immersive ? 'isImmersive' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={panelClassName} onMouseDown={event => event.stopPropagation()}>
      <div className="linghuiDirector3DLayout">
        {/* 顶部 HUD：状态条 */}
        <div className="linghuiDirector3DTopBar">
          <span className="linghuiDirector3DTopBarChip">
            <Camera size={11} />
            {Math.round(scene.camera.fov)}° · {scene.camera.aspectRatio}
          </span>
          <span className="linghuiDirector3DTopBarChip">
            <Users size={11} />
            {stats.mannequins} 角色
          </span>
          {stats.liteMannequins > 0 ? (
            <span className="linghuiDirector3DTopBarChip">
              <Users size={11} style={{ opacity: 0.6 }} />
              {stats.liteMannequins} 群演
            </span>
          ) : null}
          {stats.formations > 0 ? (
            <span className="linghuiDirector3DTopBarChip" title={`${stats.formations} 个方阵 / 共 ${stats.formationMembers} 人`}>
              <Grid2x2 size={11} />
              {stats.formations} 方阵 · {stats.formationMembers} 人
            </span>
          ) : null}
          {stats.props > 0 ? (
            <span className="linghuiDirector3DTopBarChip">
              <Box size={11} />
              {stats.props} 道具
            </span>
          ) : null}
          <span className="linghuiDirector3DTopBarChip">
            {RENDER_MODE_LABELS[renderModeForExport]}
          </span>
          <span className="linghuiDirector3DTopBarChip" title="Tab 折叠侧栏 · Cmd/Ctrl+F 沉浸 · 1-4 切换渲染模式">
            ⌨ Tab / ⌘F / 1-4
          </span>
        </div>

        {/* 折叠 / 沉浸控制按钮（独立浮层，沉浸态仍可点） */}
        {!immersive ? (
          <Tooltip title={assetsHudOpen ? '收起资产库 (Tab)' : '展开资产库'} placement="right">
            <button
              type="button"
              className="linghuiDirector3DSideHandle"
              style={{ left: assetsHudOpen ? 280 : 12 }}
              onClick={() => setAssetsHudOpen(open => !open)}
            >
              {assetsHudOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            </button>
          </Tooltip>
        ) : null}
        {!immersive ? (
          <Tooltip title={inspectorHudOpen ? '收起属性面板 (Tab)' : '展开属性面板'} placement="left">
            <button
              type="button"
              className="linghuiDirector3DSideHandle"
              style={{ right: inspectorHudOpen ? 328 : 12 }}
              onClick={() => setInspectorHudOpen(open => !open)}
            >
              {inspectorHudOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            </button>
          </Tooltip>
        ) : null}
        <Tooltip title={immersive ? '退出沉浸 (Cmd/Ctrl+F)' : '沉浸模式 (Cmd/Ctrl+F)'} placement="bottom">
          <button
            type="button"
            className="linghuiDirector3DSideHandle"
            style={{ left: '50%', top: 'auto', bottom: 12, transform: 'translateX(-50%)' }}
            onClick={() => setImmersive(prev => !prev)}
          >
            {immersive ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </Tooltip>

        {/* 左侧：资产库 HUD */}
        {assetsHudOpen ? (
        <aside className="linghuiDirector3DAssets">
          <div className="linghuiDirector3DTabs">
            <button type="button" className={`linghuiDirector3DTab ${activeAssetTab === 'props' ? 'isActive' : ''}`} onClick={() => setActiveAssetTab('props')}>道具</button>
            <button type="button" className={`linghuiDirector3DTab ${activeAssetTab === 'characters' ? 'isActive' : ''}`} onClick={() => setActiveAssetTab('characters')}>人物</button>
            <button type="button" className={`linghuiDirector3DTab ${activeAssetTab === 'cameras' ? 'isActive' : ''}`} onClick={() => setActiveAssetTab('cameras')}>视角</button>
            <button type="button" className={`linghuiDirector3DTab ${activeAssetTab === 'templates' ? 'isActive' : ''}`} onClick={() => setActiveAssetTab('templates')}>模板</button>
          </div>

          <div className="linghuiDirector3DAssetGrid">
            {activeAssetTab === 'characters' && (
              <>
                <div className="linghuiDirector3DCameraGroupHeading">主角预设</div>
                {DIRECTOR3D_CHARACTER_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    className="linghuiDirector3DAssetTile"
                    onClick={() => handleAddCharacter(preset)}
                    title={`${preset.label} · ${preset.hint}`}
                  >
                    <Users size={18} style={{ color: preset.color.startsWith('var(') ? undefined : preset.color }} />
                    <span>{preset.label}</span>
                  </button>
                ))}
                <div className="linghuiDirector3DCameraGroupHeading">通用</div>
                {ASSET_PROPS.map(asset => (
                  <button key={asset.id} type="button" className="linghuiDirector3DAssetTile" onClick={handleAddActor} title="加一个空白主角假人">
                    <Users size={20} />
                    <span>{asset.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="linghuiDirector3DAssetTile"
                  onClick={handleAddLiteSoldier}
                  title="加一个低多边形群演占位，独立可拖拽，作为人群路人或填充背景"
                >
                  <Users size={20} style={{ opacity: 0.6 }} />
                  <span>群演</span>
                </button>
                {characterAssets.assets.length > 0 ? (
                  <>
                    <div className="linghuiDirector3DCameraGroupHeading">我的全局库</div>
                    {characterAssets.assets.map(asset => (
                      <button
                        key={asset.id}
                        type="button"
                        className={`linghuiDirector3DAssetTile linghuiDirector3DGlobalTile ${asset.favorite ? 'isFavorite' : ''}`}
                        onClick={() => handleAddGlobalAsset(asset)}
                        onContextMenu={event => {
                          event.preventDefault();
                          void handleDeleteGlobalAsset(asset);
                        }}
                        title={`${asset.label}（右键删除 / 点击星标切换收藏）`}
                      >
                        <span className="linghuiDirector3DGlobalTileFavoriteSlot" onClick={(event) => { event.stopPropagation(); void handleToggleAssetFavorite(asset); }}>
                          {asset.favorite ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
                        </span>
                        <Users size={18} style={{ color: asset.color?.startsWith('var(') ? undefined : asset.color }} />
                        <span>{asset.label}</span>
                      </button>
                    ))}
                  </>
                ) : null}
              </>
            )}
            {activeAssetTab === 'characters' && (
              <Popover
                open={battalionOpen}
                onOpenChange={setBattalionOpen}
                trigger="click"
                placement="rightTop"
                overlayClassName="linghuiDirector3DBattalionPopover"
                getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
                content={(
                  <div className="linghuiDirector3DBattalionPanel" onClick={event => event.stopPropagation()}>
                    <div className="linghuiDirector3DBattalionTitle">派兵布阵</div>
                    <div className="linghuiDirector3DBattalionHint">一键铺 M 行 × N 列的低级假人，用于群戏排布或受阅式构图。</div>
                    <div className="linghuiDirector3DBattalionRow">
                      <span className="linghuiDirector3DBattalionLabel">行 × 列</span>
                      <InputNumber
                        size="small"
                        min={1}
                        max={12}
                        value={battalionConfig.rows}
                        onChange={value => setBattalionConfig(prev => ({ ...prev, rows: Math.max(1, Math.min(12, Math.round(Number(value) || 1))) }))}
                      />
                      <span className="linghuiDirector3DBattalionTimes">×</span>
                      <InputNumber
                        size="small"
                        min={1}
                        max={12}
                        value={battalionConfig.cols}
                        onChange={value => setBattalionConfig(prev => ({ ...prev, cols: Math.max(1, Math.min(12, Math.round(Number(value) || 1))) }))}
                      />
                      <span className="linghuiDirector3DBattalionTotal">= {battalionConfig.rows * battalionConfig.cols} 人</span>
                    </div>
                    <div className="linghuiDirector3DBattalionRow">
                      <span className="linghuiDirector3DBattalionLabel">间距</span>
                      <div className="linghuiDirector3DBattalionChipGroup">
                        {[
                          { value: 0.6, label: '密集' },
                          { value: 1.0, label: '标准' },
                          { value: 1.6, label: '稀疏' },
                        ].map(option => (
                          <button
                            key={option.value}
                            type="button"
                            className={`linghuiDirector3DBattalionChip ${Math.abs(battalionConfig.spacing - option.value) < 0.01 ? 'isActive' : ''}`}
                            onClick={() => setBattalionConfig(prev => ({ ...prev, spacing: option.value }))}
                          >
                            {option.label}
                            <span className="linghuiDirector3DBattalionChipMeta">{option.value}m</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="linghuiDirector3DBattalionRow">
                      <span className="linghuiDirector3DBattalionLabel">朝向</span>
                      <div className="linghuiDirector3DBattalionChipGroup">
                        {([
                          { value: 'forward' as const, label: '正向' },
                          { value: 'away' as const, label: '背向' },
                          { value: 'inward' as const, label: '向心' },
                          { value: 'outward' as const, label: '向外' },
                        ]).map(option => (
                          <button
                            key={option.value}
                            type="button"
                            className={`linghuiDirector3DBattalionChip ${battalionConfig.memberFacing === option.value ? 'isActive' : ''}`}
                            onClick={() => setBattalionConfig(prev => ({ ...prev, memberFacing: option.value }))}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="linghuiDirector3DBattalionActions">
                      <Button size="small" onClick={() => setBattalionOpen(false)}>取消</Button>
                      <Button size="small" type="primary" icon={<Plus size={14} />} onClick={handleDeployBattalion}>
                        部署
                      </Button>
                    </div>
                  </div>
                )}
              >
                <button type="button" className="linghuiDirector3DAssetTile">
                  <Grid2x2 size={20} />
                  <span>派兵布阵</span>
                </button>
              </Popover>
            )}
            {activeAssetTab === 'cameras' && CAMERA_PRESET_CATEGORY_ORDER.flatMap(category => {
              const presets = cameraPresetGroups[category] ?? [];
              if (presets.length === 0) return [];
              return [
                <div key={`${category}-heading`} className="linghuiDirector3DCameraGroupHeading">
                  {DIRECTOR3D_CAMERA_PRESET_CATEGORY_LABELS[category]}
                </div>,
                ...presets.map(preset => {
                  const active = lastCameraPresetIds[0] === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`linghuiDirector3DAssetTile linghuiDirector3DCameraTile ${active ? 'isActive' : ''}`}
                      onClick={() => handleApplyCameraPreset(preset)}
                      title={preset.hint ? `${preset.label} · ${preset.hint}` : preset.label}
                    >
                      <Camera size={18} />
                      <span>{preset.label}</span>
                    </button>
                  );
                }),
              ];
            })}
            {activeAssetTab === 'props' && propCategoryOrder.flatMap(category => {
              const presets = propsByCategory[category] ?? [];
              if (presets.length === 0) return [];
              return [
                <div key={`prop-cat-${category}`} className="linghuiDirector3DCameraGroupHeading">
                  {DIRECTOR3D_PROP_CATEGORY_LABELS[category]}
                </div>,
                ...presets.map(preset => {
                  const Icon = PROP_ICON_BY_TYPE[preset.type] ?? Box;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className="linghuiDirector3DAssetTile"
                      onClick={() => handleAddProp(preset)}
                      title={preset.promptHint ? `${preset.label} · ${preset.promptHint}` : preset.label}
                    >
                      <Icon size={20} />
                      <span>{preset.label}</span>
                    </button>
                  );
                }),
              ];
            })}
            {activeAssetTab === 'props' && propAssets.assets.length > 0 && (
              <>
                <div className="linghuiDirector3DCameraGroupHeading">我的全局库</div>
                {propAssets.assets.map(asset => {
                  const Icon = PROP_ICON_BY_TYPE[asset.propType ?? 'prop-box'] ?? Box;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`linghuiDirector3DAssetTile linghuiDirector3DGlobalTile ${asset.favorite ? 'isFavorite' : ''}`}
                      onClick={() => handleAddGlobalAsset(asset)}
                      onContextMenu={event => {
                        event.preventDefault();
                        void handleDeleteGlobalAsset(asset);
                      }}
                      title={`${asset.label}（右键删除 / 星标切换收藏）`}
                    >
                      <span className="linghuiDirector3DGlobalTileFavoriteSlot" onClick={(event) => { event.stopPropagation(); void handleToggleAssetFavorite(asset); }}>
                        {asset.favorite ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
                      </span>
                      <Icon size={18} />
                      <span>{asset.label}</span>
                    </button>
                  );
                })}
              </>
            )}
            {activeAssetTab === 'templates' && DIRECTOR3D_SCENE_TEMPLATES.map(template => (
              <button
                key={template.id}
                type="button"
                className="linghuiDirector3DAssetTile"
                onClick={() => handleApplyTemplate(template.id)}
                title={template.hint}
              >
                <LayoutTemplate size={20} />
                <span>{template.label}</span>
              </button>
            ))}
          </div>
        </aside>
        ) : null}

        {/* 中央：3D 视口 + 镜头条 */}
        <main className="linghuiDirector3DStage">
          <div className="linghuiDirector3DStageSurface">
            <Director3DViewport
              ref={viewportRef}
              scene={runtimeScene}
              selectedActorId={selection.kind === 'actor' ? selection.actorId : null}
              onActorClick={(id) => setSelection({ kind: 'actor', actorId: id })}
              onActorMove={handleActorMove}
              onCanvasClick={() => setSelection({ kind: null })}
              onCameraChange={handleCameraChange}
              renderMode={previewMode}
            />
          </div>

          <div className="linghuiDirector3DCameraBar">
            <div className="linghuiDirector3DCameraChip">
              <Camera size={14} />
              <span>{Math.round(scene.camera.fov)}° FOV · {scene.camera.aspectRatio}</span>
            </div>
            <div className="linghuiDirector3DRenderModes">
              {(Object.keys(RENDER_MODE_LABELS) as LinghuiDirector3DRenderMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={`linghuiDirector3DRenderMode ${renderModeForExport === mode ? 'isActive' : ''}`}
                  onClick={() => {
                    setRenderModeForExport(mode);
                    // 预览只支持 preview / lineart / silhouette；depth / composition 在预览态
                    // 落回 preview（防止 viewport 渲染异常），导出时再走专用 capture 分支
                    setPreviewMode(mode === 'silhouette' ? 'silhouette' : mode === 'lineart' ? 'lineart' : 'preview');
                  }}
                  title={`导出 ${RENDER_MODE_LABELS[mode]} 风格`}
                >
                  {RENDER_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
            <Button type="primary" size="small" icon={<Wand2 size={14} />} onClick={handleExportLineart}>
              导出 {RENDER_MODE_LABELS[renderModeForExport]}
            </Button>
            <Button
              size="small"
              icon={<Layers size={14} />}
              onClick={() => { void handleBatchExport('three-view'); }}
              title="围绕场景中心生成正面 / 侧面 / 背面 3 张"
            >
              三视图
            </Button>
            <Button
              size="small"
              icon={<Grid3x3 size={14} />}
              onClick={() => { void handleBatchExport('orbit-9'); }}
              title="环绕 8 个方位 + 俯视，共 9 张"
            >
              九宫格
            </Button>
          </div>

          {lineartPreview || angleViews.length ? (
            <div className="linghuiDirector3DLineartPreview">
              <span className="linghuiDirector3DLineartLabel">
                最近导出{angleViews.length ? ` · ${1 + angleViews.length} 张` : ''}
              </span>
              <div className="linghuiDirector3DAngleStrip">
                {lineartPreview ? (
                  <img src={lineartPreview} alt="primary export" title="主图" />
                ) : null}
                {angleViews.map((view) => (
                  <img key={view.id} src={view.dataUrl} alt={view.label} title={view.label} />
                ))}
              </div>
            </div>
          ) : null}
        </main>

        {/* 右上：split-view 预览 HUD（沉浸态自动隐藏） */}
        {!immersive ? (
          <div className="linghuiDirector3DPreviewHud">
            {!previewBindingId ? (
              <Popover
                open={previewPickerOpen}
                onOpenChange={setPreviewPickerOpen}
                trigger="click"
                placement="bottomRight"
                getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
                overlayClassName="linghuiDirector3DPreviewPickerPopover"
                content={(
                  <div className="linghuiDirector3DPreviewPicker" onClick={event => event.stopPropagation()}>
                    <div className="linghuiDirector3DPreviewPickerTitle">绑定 split-view 预览节点</div>
                    {previewCandidates.length === 0 ? (
                      <div className="linghuiDirector3DPreviewPickerEmpty">
                        画布上还没有图片 / 全景 / 视频节点，无法绑定。
                      </div>
                    ) : (
                      <ul className="linghuiDirector3DPreviewPickerList">
                        {previewCandidates.map(item => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className="linghuiDirector3DPreviewPickerItem"
                              onClick={() => handleBindPreview(item.id)}
                              title={item.id}
                            >
                              <span className="linghuiDirector3DPreviewPickerKind">
                                {item.kind === 'linghui/video' ? '视频' : item.kind === 'linghui/panorama' ? '全景' : '图片'}
                              </span>
                              <span className="linghuiDirector3DPreviewPickerName">{item.label}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              >
                <button type="button" className="linghuiDirector3DPreviewBindButton">
                  <Link2 size={14} />
                  <span>绑定预览节点</span>
                </button>
              </Popover>
            ) : (
              <div className="linghuiDirector3DPreviewCard">
                <div className="linghuiDirector3DPreviewCardHeader">
                  <span className="linghuiDirector3DPreviewCardLabel">
                    <Eye size={11} />
                    {previewCandidate?.label ?? '（已删除节点）'}
                  </span>
                  <span className="linghuiDirector3DPreviewCardActions">
                    <Tooltip title={realtimeOn ? '关闭实时模式（场景变动自动重出图）' : '开启实时模式（场景变动 800ms 后自动重出图）'}>
                      <button
                        type="button"
                        className={`linghuiDirector3DPreviewCardAction ${realtimeOn ? 'isActive' : ''}`}
                        onClick={() => setRealtimeOn(v => !v)}
                      >
                        <Zap size={11} />
                      </button>
                    </Tooltip>
                    <Tooltip title="重新执行预览节点">
                      <button
                        type="button"
                        className="linghuiDirector3DPreviewCardAction"
                        onClick={handleRunBoundPreview}
                        disabled={previewNodeRun?.status === 'running'}
                      >
                        <Wand2 size={11} />
                      </button>
                    </Tooltip>
                    <Tooltip title="解绑">
                      <button
                        type="button"
                        className="linghuiDirector3DPreviewCardAction"
                        onClick={handleUnbindPreview}
                      >
                        <Link2Off size={11} />
                      </button>
                    </Tooltip>
                  </span>
                </div>
                <div className="linghuiDirector3DPreviewCardBody">
                  {previewSource ? (
                    <img src={previewSource} alt={previewCandidate?.label ?? 'preview'} />
                  ) : (
                    <div className="linghuiDirector3DPreviewCardPlaceholder">
                      <ImageIcon size={20} />
                      {previewNodeRun?.status === 'running' ? '正在生成...' : '暂无产物，先执行一次'}
                    </div>
                  )}
                </div>
                <div className="linghuiDirector3DPreviewCardFooter">
                  <span className={`linghuiDirector3DPreviewCardStatus is-${previewNodeRun?.status ?? 'idle'}`}>
                    {previewNodeRun?.status === 'running' ? '执行中' :
                      previewNodeRun?.status === 'succeeded' ? '已就绪' :
                        previewNodeRun?.status === 'failed' ? '失败' :
                          previewNodeRun?.status === 'stale' ? '已失效' : '空闲'}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* 右侧：属性面板 HUD */}
        {inspectorHudOpen ? (
        <aside className="linghuiDirector3DInspector">
          <div className="linghuiDirector3DInspectorHeader">属性</div>

          {selection.kind === 'actor' && selectedActor ? (
            <div className="linghuiDirector3DInspectorBody">
              <Field label="名称">
                <input
                  className="linghuiDirector3DInspectorInput"
                  value={selectedActor.label}
                  onChange={(e) => handleActorChange(selectedActor.id, { label: e.target.value })}
                />
              </Field>
              <Field label="位置 (m)">
                <Vec3Input
                  value={selectedActor.position}
                  onChange={(value) => handleActorChange(selectedActor.id, { position: value })}
                />
              </Field>
              <Field label="朝向 (°)">
                <Slider
                  min={-180}
                  max={180}
                  value={Math.round((selectedActor.rotationY * 180) / Math.PI)}
                  onChange={(deg) => handleActorChange(selectedActor.id, { rotationY: ((deg as number) * Math.PI) / 180 })}
                />
              </Field>
              {selectedActor.type === 'mannequin' ? (
                <Field label="姿势">
                  <div className="linghuiDirector3DPoseGrid">
                    {DIRECTOR3D_POSE_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={`linghuiDirector3DPoseTile ${selectedActor.posePreset === option.value ? 'isActive' : ''}`}
                        onClick={() => handleActorChange(selectedActor.id, { posePreset: option.value as LinghuiDirector3DActorPose })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Field>
              ) : null}
              {selectedActor.type === 'formation' && selectedActor.formation ? (
                <>
                  <Field label="行 × 列">
                    <div className="linghuiDirector3DVec3">
                      <div className="linghuiDirector3DVec3Cell">
                        <span className="linghuiDirector3DVec3Axis">R</span>
                        <InputNumber
                          size="small"
                          controls={false}
                          min={1}
                          max={12}
                          value={selectedActor.formation.rows}
                          onChange={value => handleActorChange(selectedActor.id, {
                            formation: {
                              ...selectedActor.formation!,
                              rows: Math.max(1, Math.min(12, Math.round(Number(value) || 1))),
                            },
                          })}
                        />
                      </div>
                      <div className="linghuiDirector3DVec3Cell">
                        <span className="linghuiDirector3DVec3Axis">C</span>
                        <InputNumber
                          size="small"
                          controls={false}
                          min={1}
                          max={12}
                          value={selectedActor.formation.cols}
                          onChange={value => handleActorChange(selectedActor.id, {
                            formation: {
                              ...selectedActor.formation!,
                              cols: Math.max(1, Math.min(12, Math.round(Number(value) || 1))),
                            },
                          })}
                        />
                      </div>
                      <div className="linghuiDirector3DVec3Cell">
                        <span className="linghuiDirector3DVec3Axis">S</span>
                        <InputNumber
                          size="small"
                          controls={false}
                          min={0.3}
                          max={3}
                          step={0.1}
                          value={selectedActor.formation.spacing}
                          onChange={value => handleActorChange(selectedActor.id, {
                            formation: {
                              ...selectedActor.formation!,
                              spacing: Math.max(0.3, Math.min(3, Number(value) || 1)),
                            },
                          })}
                        />
                      </div>
                    </div>
                  </Field>
                  <Field label="成员朝向">
                    <div className="linghuiDirector3DPoseGrid">
                      {([
                        { value: 'forward' as const, label: '正向' },
                        { value: 'away' as const, label: '背向' },
                        { value: 'inward' as const, label: '向心' },
                        { value: 'outward' as const, label: '向外' },
                      ]).map(option => (
                        <button
                          key={option.value}
                          type="button"
                          className={`linghuiDirector3DPoseTile ${selectedActor.formation?.memberFacing === option.value ? 'isActive' : ''}`}
                          onClick={() => handleActorChange(selectedActor.id, {
                            formation: { ...selectedActor.formation!, memberFacing: option.value },
                          })}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              ) : null}
              <Field label="缩放">
                <Slider
                  min={0.3}
                  max={selectedActor.type === 'mannequin' ? 1.5 : 3}
                  step={0.05}
                  value={selectedActor.scale}
                  onChange={(scale) => handleActorChange(selectedActor.id, { scale: scale as number })}
                />
              </Field>
              <Field label="颜色">
                <input
                  type="color"
                  className="linghuiDirector3DColorInput"
                  value={toDirector3DColorInputValue(selectedActor.color)}
                  onChange={(e) => handleActorChange(selectedActor.id, { color: e.target.value })}
                />
              </Field>
              <div className="linghuiDirector3DInspectorActions">
                {selectedActor.type !== 'formation' && selectedActor.type !== 'mannequin-lite' ? (
                  <Button size="small" icon={<SaveIcon size={14} />} onClick={handleSaveSelectedAsGlobalAsset}>
                    存到全局库
                  </Button>
                ) : null}
                <Button danger size="small" icon={<Trash2 size={14} />} onClick={() => handleDeleteActor(selectedActor.id)}>
                  删除
                </Button>
              </div>
            </div>
          ) : (
            <div className="linghuiDirector3DInspectorBody">
              <Field label="FOV">
                <Slider min={18} max={90} value={scene.camera.fov} onChange={(fov) => handleCameraField('fov', fov as number)} tooltip={{ formatter: (v) => `${v}°` }} />
              </Field>
              <Field label="比例">
                <div className="linghuiDirector3DRatioGrid">
                  {ASPECT_RATIOS.map(ratio => (
                    <button
                      key={ratio}
                      type="button"
                      className={`linghuiDirector3DRatioTile ${scene.camera.aspectRatio === ratio ? 'isActive' : ''}`}
                      onClick={() => handleCameraField('aspectRatio', ratio)}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="背景">
                <div className="linghuiDirector3DBackgroundModes">
                  {(['none', 'color', 'image-plane', 'panorama'] as LinghuiDirector3DBackgroundMode[]).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      className={`linghuiDirector3DBgMode ${scene.background.mode === mode ? 'isActive' : ''}`}
                      onClick={() => handleBackgroundModeChange(mode)}
                    >
                      {mode === 'none' ? '无' : mode === 'color' ? '纯色' : mode === 'image-plane' ? '图片板' : '全景'}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="linghuiDirector3DInspectorActions">
                <Button size="small" icon={<Plus size={14} />} onClick={handleAddActor}>添加假人</Button>
              </div>
            </div>
          )}
        </aside>
        ) : null}

        {/* 底部时间轴 HUD（C-6A），沉浸态隐藏 */}
        {!immersive ? (
          <Director3DTimelineHud
            timeline={timeline}
            currentTime={currentTime}
            playing={playing}
            selectedKeyframeId={selectedKeyframeId}
            exportState={timelineExport}
            onPlayToggle={handlePlayToggle}
            onSeek={handleSeek}
            onAddKeyframe={handleAddKeyframe}
            onRemoveKeyframe={handleRemoveKeyframe}
            onSelectKeyframe={setSelectedKeyframeId}
            onMoveKeyframe={handleMoveKeyframe}
            onDurationChange={handleDurationChange}
            onFpsChange={handleFpsChange}
            onEasingChange={handleEasingChange}
            onResetTimeline={handleResetTimeline}
            onExportVideo={() => { void handleExportTimelineVideo(); }}
            onCancelExport={handleCancelTimelineExport}
          />
        ) : null}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="linghuiDirector3DField">
    <div className="linghuiDirector3DFieldLabel">{label}</div>
    <div className="linghuiDirector3DFieldBody">{children}</div>
  </div>
);

interface Vec3InputProps {
  value: [number, number, number];
  onChange: (value: [number, number, number]) => void;
}

const Vec3Input: React.FC<Vec3InputProps> = ({ value, onChange }) => {
  const handle = (idx: number, next: number | null) => {
    const updated = [...value] as [number, number, number];
    updated[idx] = typeof next === 'number' && Number.isFinite(next) ? next : 0;
    onChange(updated);
  };
  return (
    <div className="linghuiDirector3DVec3">
      {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
        <div key={axis} className="linghuiDirector3DVec3Cell">
          <span className="linghuiDirector3DVec3Axis">{axis}</span>
          <InputNumber
            size="small"
            controls={false}
            value={Number(value[idx].toFixed(2))}
            onChange={(next) => handle(idx, next as number | null)}
          />
        </div>
      ))}
    </div>
  );
};

export default Director3DNodeEditor;
