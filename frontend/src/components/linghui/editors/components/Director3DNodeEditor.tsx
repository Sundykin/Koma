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
  LinghuiDirector3DCreatureAction,
  LinghuiDirector3DCreatureSpecies,
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
  cloneCameraForKeyframe,
  snapshotActorAsKeyframeActor,
  compileDirector3DPromptFragment,
  createDefaultDirector3DScene,
  createDefaultDirector3DTimeline,
  createDirector3DActor,
  createDirector3DBattalion,
  createDirector3DCharacter,
  createDirector3DCreature,
  createDirector3DLiteSoldier,
  CREATURE_SPECIES_LIBRARY,
  createDirector3DProp,
  groupDirector3DCameraPresets,
  interpolateSceneAt,
} from '../../director3d/director3dScene';
import { Director3DTimelineHud, type Director3DTimelineExportState, type Director3DTimelineLayer } from '../../director3d/Director3DTimelineHud';
import { exportDirector3DTimelineVideo } from '../../director3d/director3dTimelineExport';
import {
  DIRECTOR3D_JOINT_META,
  DIRECTOR3D_RIG_PRESET_OPTIONS,
  patchRigJoint,
  resolveActorRig,
} from '../../director3d/director3dRig';
import { useLinghuiGlobalAssets, type LinghuiGlobalAsset, type LinghuiGlobalAssetCategory, type LinghuiGlobalAssetPropType } from '../../../../store/linghuiGlobalAssets';
import { pickReferenceImagesAndPersist } from '../../director3d/director3dReferenceImageUpload';
import { Save as SaveIcon, Bookmark, BookmarkCheck, Upload } from 'lucide-react';
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
  if (!raw || typeof raw !== 'object') return createDefaultDirector3DScene();
  const scene = raw as LinghuiDirector3DScene;
  // 旧数据迁移：所有缺 scope 的关键帧统一标 'scene'，移除运行时兜底分支
  if (scene.timeline && Array.isArray(scene.timeline.keyframes)) {
    const needsMigration = scene.timeline.keyframes.some(k => !k.scope);
    if (needsMigration) {
      return {
        ...scene,
        timeline: {
          ...scene.timeline,
          keyframes: scene.timeline.keyframes.map(k => (k.scope ? k : { ...k, scope: 'scene' as const })),
        },
      };
    }
  }
  return scene;
}

export const Director3DNodeEditor: React.FC<Director3DNodeEditorProps> = ({ nodeId, nodeData }) => {
  const { message } = App.useApp();
  const { updateNodeData } = useLinghuiNodeMutation();
  const editorApi = useLinghuiNodeEditorApi();
  // preview binding 已移除 — editorApi 仍提供 nodeRuns / onRunNode 等共享 API

  const scene = useMemo(() => getScene(nodeData.properties), [nodeData.properties]);
  const [selection, setSelection] = useState<Selection>({ kind: null });
  const [activeAssetTab, setActiveAssetTab] = useState<'props' | 'characters' | 'creatures' | 'cameras' | 'templates'>('characters');
  const [renderModeForExport, setRenderModeForExport] = useState<LinghuiDirector3DRenderMode>('lineart');
  const [previewMode, setPreviewMode] = useState<'preview' | 'lineart' | 'silhouette'>('preview');
  // HUD：左右 activity rail（纯图标）+ hover 出独立 popover；Cmd+F 沉浸（隐藏 rail）
  const [immersive, setImmersive] = useState(false);
  // 相机模式：
  //  - 'output'（默认）：拖动 → 写入 scene.camera = 关键帧 / 导出图视频用的相机
  //  - 'editor'：拖动只改 viewport 本地视角，不影响输出，方便从其他角度看场景
  const [cameraMode, setCameraMode] = useState<'output' | 'editor'>('output');
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

  const handleAddCreature = useCallback((species: LinghuiDirector3DCreatureSpecies) => {
    updateScene(prev => {
      const seq = prev.actors.filter(a => a.type === 'creature').length + 1;
      const offsetX = (seq % 2 === 1 ? 1 : -1) * 1.2 * Math.ceil(seq / 2);
      const creature = createDirector3DCreature(species, {
        id: `creature_${species}_${Date.now().toString(36)}`,
        position: [Number(offsetX.toFixed(2)), 0, 0],
      });
      return { ...prev, actors: [...prev.actors, creature] };
    });
  }, [updateScene]);

  // 全局资产库（C-5B）：跨 workspace 用户自定义角色 / 道具
  const characterAssets = useLinghuiGlobalAssets({ kind: 'character' });
  const propAssets = useLinghuiGlobalAssets({ kind: 'prop' });

  // 保存到全局库时的"参考图待入库"暂存：先 dialog 选图 → 落盘 → 暂存 URL，下次"保存"时一起入库
  const [pendingReferenceImages, setPendingReferenceImages] = useState<string[]>([]);
  const [saveAssetPopoverOpen, setSaveAssetPopoverOpen] = useState(false);

  const handlePickReferenceImages = useCallback(async () => {
    if (!selectedActor) return;
    try {
      const urls = await pickReferenceImagesAndPersist({
        assetIdHint: selectedActor.id,
        maxCount: 3 - pendingReferenceImages.length,
      });
      if (urls.length > 0) {
        setPendingReferenceImages(prev => [...prev, ...urls].slice(0, 3));
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '上传参考图失败');
    }
  }, [message, pendingReferenceImages.length, selectedActor]);

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
      // 已有参考图（actor.referenceImages）+ 本次新上传（pendingReferenceImages）合并去重
      const mergedReferences = Array.from(new Set([
        ...(selectedActor.referenceImages ?? []),
        ...pendingReferenceImages,
      ])).slice(0, 3);

      const saved = isProp
        ? await propAssets.save({
            kind: 'prop',
            label: selectedActor.label,
            color: selectedActor.color,
            scale: selectedActor.scale,
            propType: selectedActor.type as LinghuiGlobalAssetPropType,
            category: 'gear',
            referenceImages: mergedReferences.length > 0 ? mergedReferences : undefined,
          })
        : await characterAssets.save({
            kind: 'character',
            label: selectedActor.label,
            color: selectedActor.color,
            scale: selectedActor.scale,
            posePreset: selectedActor.posePreset,
            referenceImages: mergedReferences.length > 0 ? mergedReferences : undefined,
          });
      message.success(`已保存到全局库：${saved.label}（${mergedReferences.length} 张参考图）`);
      setPendingReferenceImages([]);
      setSaveAssetPopoverOpen(false);
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '保存到全局库失败');
    }
  }, [characterAssets, message, pendingReferenceImages, propAssets, selectedActor, selection.kind]);

  const handleAddGlobalAsset = useCallback((asset: LinghuiGlobalAsset) => {
    // 加入场景时 snapshot 参考图 + 源资产 id 到 actor，供 executor 输出时聚合到 result.items
    const referenceImagesSnapshot = Array.isArray(asset.referenceImages) && asset.referenceImages.length > 0
      ? [...asset.referenceImages]
      : undefined;
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
          referenceImages: referenceImagesSnapshot,
          sourceGlobalAssetId: asset.id,
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
          referenceImages: referenceImagesSnapshot,
          sourceGlobalAssetId: asset.id,
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

  /**
   * 当前激活图层：
   *  - 选中 actor → 该 actor 的图层（编辑物体轨）
   *  - 否则 → 镜头图层
   * 时间线 UI / 加帧 / 删帧都按此图层走，避免不同物体的关键帧互相覆盖。
   */
  const activeTimelineLayer = useMemo<Director3DTimelineLayer>(() => {
    if (selection.kind === 'actor' && selectedActor) {
      return { kind: 'actor', actorId: selectedActor.id, label: selectedActor.label || '物体' };
    }
    return { kind: 'camera', label: '镜头' };
  }, [selectedActor, selection.kind]);

  const handleAddKeyframe = useCallback(() => {
    updateScene(prev => {
      const baseTimeline = prev.timeline ?? createDefaultDirector3DTimeline();
      const captureTime = Math.max(0, Math.min(baseTimeline.duration, Number(currentTime.toFixed(3))));
      const newKfId = `kf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

      if (activeTimelineLayer.kind === 'camera') {
        // 镜头图层：写 scope='camera' 关键帧。同 scope + 同时间已存在 → 覆盖
        const existing = baseTimeline.keyframes.find(k => {
          const scope = k.scope ?? 'scene';
          return (scope === 'camera' || scope === 'scene') && Math.abs(k.time - captureTime) < 0.02;
        });
        const cameraSnapshot = cloneCameraForKeyframe(prev.camera);
        // viewport 当前 yaw 不取模 → cameraOrbit 记录累计弧度，环绕镜头可跨 360°
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

      // actor 图层：写 scope='actor:{id}' 关键帧。同 scope + 同时间已存在 → 覆盖
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
  }, [activeTimelineLayer, currentTime, updateScene]);

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
    updateScene(prev => {
      const nextActors = prev.actors.map(a => (a.id === actorId ? { ...a, ...patch } : a));
      const tl = prev.timeline;
      // 时间轴还没启用（无关键帧）→ 仅静态修改，不自动加帧
      if (!tl || tl.keyframes.length === 0) {
        return { ...prev, actors: nextActors };
      }
      // 时间轴已有内容 → 当前时间点该 actor 没有自己的关键帧时，自动补一帧
      const nextActor = nextActors.find(a => a.id === actorId);
      if (!nextActor) return { ...prev, actors: nextActors };
      const t = Math.max(0, Math.min(tl.duration, Number(currentTime.toFixed(3))));
      const scope = `actor:${actorId}` as const;
      const existing = tl.keyframes.find(k => (k.scope ?? 'scene') === scope && Math.abs(k.time - t) < 0.02);
      const snapshot = snapshotActorAsKeyframeActor(nextActor);
      // scope='scene' 老关键帧若同时间点存在，也覆盖其 actor 字段（保持一帧 = 一时刻的语义）
      const sceneAtT = tl.keyframes.find(k => (k.scope ?? 'scene') === 'scene' && Math.abs(k.time - t) < 0.02);
      let nextKeyframes = tl.keyframes;
      if (sceneAtT) {
        nextKeyframes = nextKeyframes.map(k => (k.id === sceneAtT.id
          ? { ...k, actors: k.actors.map(a => (a.id === actorId ? snapshot : a)).concat(k.actors.find(a => a.id === actorId) ? [] : [snapshot]) }
          : k));
      } else if (existing) {
        nextKeyframes = nextKeyframes.map(k => (k.id === existing.id ? { ...k, actors: [snapshot] } : k));
      } else {
        const newKf = {
          id: `kf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          time: t,
          scope,
          actors: [snapshot],
          camera: prev.camera,
        };
        nextKeyframes = [...nextKeyframes, newKf].sort((a, b) => a.time - b.time);
      }
      return {
        ...prev,
        actors: nextActors,
        timeline: { ...tl, keyframes: nextKeyframes },
      };
    });
  }, [currentTime, updateScene]);

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

  const handleCameraChange = useCallback((
    camera: LinghuiDirector3DScene['camera'],
    orbit?: { yaw: number; pitch: number; distance: number },
  ) => {
    updateScene(prev => {
      const tl = prev.timeline;
      if (!tl || tl.keyframes.length === 0) {
        return { ...prev, camera };
      }
      const t = Math.max(0, Math.min(tl.duration, Number(currentTime.toFixed(3))));
      const cameraClone = cloneCameraForKeyframe(camera);
      const sceneAtT = tl.keyframes.find(k => (k.scope ?? 'scene') === 'scene' && Math.abs(k.time - t) < 0.02);
      const camAtT = tl.keyframes.find(k => (k.scope ?? 'scene') === 'camera' && Math.abs(k.time - t) < 0.02);
      // orbit 是累计弧度的快照（不取模），让"转 720°"能在两关键帧之间真的转两圈
      const cameraOrbit = orbit ? { ...orbit } : undefined;
      let nextKeyframes = tl.keyframes;
      if (sceneAtT) {
        nextKeyframes = nextKeyframes.map(k => (k.id === sceneAtT.id ? { ...k, camera: cameraClone, ...(cameraOrbit ? { cameraOrbit } : {}) } : k));
      } else if (camAtT) {
        nextKeyframes = nextKeyframes.map(k => (k.id === camAtT.id ? { ...k, camera: cameraClone, ...(cameraOrbit ? { cameraOrbit } : {}) } : k));
      } else {
        const newKf = {
          id: `kf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          time: t,
          scope: 'camera' as const,
          actors: [],
          camera: cameraClone,
          ...(cameraOrbit ? { cameraOrbit } : {}),
        };
        nextKeyframes = [...nextKeyframes, newKf].sort((a, b) => a.time - b.time);
      }
      return { ...prev, camera, timeline: { ...tl, keyframes: nextKeyframes } };
    });
  }, [currentTime, updateScene]);

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

  // preview binding 已移除：不再有"绑定下游节点 + 实时联动"流程

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
  }, [renderModeKeys]);

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
          <span className="linghuiDirector3DTopBarChip" title="Cmd/Ctrl+F 沉浸 · 1-4 切换渲染模式">
            ⌘F / 1-4
          </span>
          <Tooltip title={immersive ? '退出沉浸 (Cmd/Ctrl+F)' : '沉浸模式 (Cmd/Ctrl+F)'} placement="bottom">
            <button
              type="button"
              className="linghuiDirector3DTopBarBtn"
              onClick={() => setImmersive(prev => !prev)}
            >
              {immersive ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </Tooltip>
        </div>

        {/* 主体：左 rail | 视口 | 右 rail，flex 中间撑开 */}
        <div className="linghuiDirector3DBody">

        {/* 左侧 activity bar：纵向 5 个独立图标按钮，hover 各自弹出对应资产面板 */}
        <aside className="linghuiDirector3DRail">
          {([
            { id: 'characters' as const, label: '人物', Icon: Users, title: '加角色 / 派兵布阵 / 全局角色库' },
            { id: 'creatures' as const, label: '生物', Icon: Zap, title: '现实动物 + 玄幻生物' },
            { id: 'props' as const, label: '道具', Icon: Box, title: '场景道具 + 全局道具库' },
            { id: 'cameras' as const, label: '视角', Icon: Camera, title: '电影镜头预设' },
            { id: 'templates' as const, label: '模板', Icon: LayoutTemplate, title: '快速套用整套场景' },
          ]).map(tab => (
            <Popover
              key={tab.id}
              trigger="hover"
              placement="right"
              align={{ overflow: { adjustY: true, adjustX: true } }}
              mouseEnterDelay={0.1}
              mouseLeaveDelay={0.2}
              overlayClassName="linghuiDirector3DRailPopover"
              getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
              onOpenChange={(open) => { if (open) setActiveAssetTab(tab.id); }}
              content={(
                <div className="linghuiDirector3DRailPopoverInner" onMouseDown={event => event.stopPropagation()}>
                  <div className="linghuiDirector3DRailPopoverTitle">{tab.label}</div>
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
            {activeAssetTab === 'creatures' && (
              <>
                <div className="linghuiDirector3DCameraGroupHeading">现实动物</div>
                {CREATURE_SPECIES_LIBRARY.filter(spec => (
                  spec.kind === 'lion' || spec.kind === 'wolf' || spec.kind === 'tiger'
                  || spec.kind === 'bear' || spec.kind === 'horse' || spec.kind === 'eagle'
                )).map(spec => (
                  <button
                    key={spec.kind}
                    type="button"
                    className="linghuiDirector3DAssetTile"
                    onClick={() => handleAddCreature(spec.kind)}
                    title={spec.promptHint}
                  >
                    <Users size={20} />
                    <span>{spec.label}</span>
                  </button>
                ))}
                <div className="linghuiDirector3DCameraGroupHeading">玄幻生物</div>
                {CREATURE_SPECIES_LIBRARY.filter(spec => (
                  spec.kind === 'dragon' || spec.kind === 'phoenix' || spec.kind === 'qilin'
                  || spec.kind === 'fox' || spec.kind === 'deer' || spec.kind === 'crane'
                )).map(spec => (
                  <button
                    key={spec.kind}
                    type="button"
                    className="linghuiDirector3DAssetTile"
                    onClick={() => handleAddCreature(spec.kind)}
                    title={spec.promptHint}
                  >
                    <Zap size={20} />
                    <span>{spec.label}</span>
                  </button>
                ))}
              </>
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
                </div>
              )}
            >
              <button
                type="button"
                className={`linghuiDirector3DRailButton ${activeAssetTab === tab.id ? 'isActive' : ''}`}
                onMouseEnter={() => setActiveAssetTab(tab.id)}
                title={tab.title}
              >
                <tab.Icon size={18} />
                <span>{tab.label}</span>
              </button>
            </Popover>
          ))}
        </aside>

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
              cameraMode={cameraMode}
            />
            {cameraMode === 'editor' ? (
              <div className="linghuiDirector3DCameraModeBanner" title="编辑视角拖动不影响输出">
                编辑视角 · 拖动不会影响输出
              </div>
            ) : null}
          </div>

          <div className="linghuiDirector3DCameraBar">
            <div className="linghuiDirector3DCameraChip">
              <Camera size={14} />
              <span>{Math.round(scene.camera.fov)}° FOV · {scene.camera.aspectRatio}</span>
            </div>
            <div className="linghuiDirector3DCameraModeGroup">
              <button
                type="button"
                className={`linghuiDirector3DCameraModeBtn ${cameraMode === 'output' ? 'isActive' : ''}`}
                onClick={() => setCameraMode('output')}
                title="拖动 / 缩放将直接写入输出相机（关键帧 / 图片视频用这个）"
              >
                输出视角
              </button>
              <button
                type="button"
                className={`linghuiDirector3DCameraModeBtn ${cameraMode === 'editor' ? 'isActive' : ''}`}
                onClick={() => setCameraMode('editor')}
                title="拖动 / 缩放只用于查看，不会改变输出相机"
              >
                编辑视角
              </button>
              {cameraMode === 'editor' ? (
                <button
                  type="button"
                  className="linghuiDirector3DCameraModeBtn"
                  onClick={() => {
                    const current = viewportRef.current?.getCurrentCamera();
                    if (!current) return;
                    // 把编辑视角参数写入 scene.camera = 输出相机
                    updateScene(prev => ({ ...prev, camera: { ...current } }));
                    setCameraMode('output');
                  }}
                  title="把当前编辑视角固化为输出相机"
                >
                  应用为输出
                </button>
              ) : null}
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

        {/* 右侧 activity rail：属性 + 时间轴关键帧入口；属性 popover 内容根据选中状态切换 */}
        <aside className="linghuiDirector3DRail isRight">
          <Popover
            trigger="hover"
            placement="left"
            align={{ overflow: { adjustY: true, adjustX: true } }}
            mouseEnterDelay={0.1}
            mouseLeaveDelay={0.2}
            overlayClassName="linghuiDirector3DRailPopover"
            getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
            content={(
              <div className="linghuiDirector3DRailPopoverInner" onMouseDown={event => event.stopPropagation()}>
                <div className="linghuiDirector3DRailPopoverTitle">
                  {selection.kind === 'actor' && selectedActor ? (selectedActor.label || '属性') : '属性'}
                </div>
                {selection.kind !== 'actor' || !selectedActor ? (
                  <div className="linghuiDirector3DInspectorEmpty">点击视口里的物体查看其属性</div>
                ) : null}

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
                <>
                  <Field label="预置动作">
                    <div className="linghuiDirector3DPoseGrid">
                      {DIRECTOR3D_RIG_PRESET_OPTIONS.map(option => {
                        // 选中态：基础 6 个对照 posePreset；扩展的看 actor.rig 是否就是该预置的 rig
                        const isBuiltinMatch = Boolean(option.posePreset && selectedActor.posePreset === option.posePreset && !selectedActor.rig);
                        const isRigMatch = Boolean(selectedActor.rig && JSON.stringify(selectedActor.rig) === JSON.stringify(option.rig));
                        const active = isBuiltinMatch || isRigMatch;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            className={`linghuiDirector3DPoseTile ${active ? 'isActive' : ''}`}
                            onClick={() => handleActorChange(selectedActor.id, {
                              // 预置：基础 6 个直接更新 posePreset 字符串；扩展的把 rig 写到 actor.rig（保持 posePreset=idle 兜底）
                              ...(option.posePreset
                                ? { posePreset: option.posePreset, rig: option.rig }
                                : { posePreset: 'idle' as LinghuiDirector3DActorPose, rig: option.rig }),
                            })}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <Field label="骨骼微调">
                    <div className="linghuiDirector3DRigGrid">
                      {DIRECTOR3D_JOINT_META.map(joint => {
                        const currentRig = resolveActorRig(selectedActor.rig, selectedActor.posePreset);
                        return (
                          <div key={joint.key} className="linghuiDirector3DRigJoint">
                            <div className="linghuiDirector3DRigJointHeader">{joint.label}</div>
                            {joint.axes.map(({ axis, name, hint }) => {
                              const radValue = currentRig[joint.key][axis];
                              const degValue = Math.round((radValue * 180) / Math.PI);
                              return (
                                <div key={`${joint.key}-${axis}`} className="linghuiDirector3DRigSliderRow">
                                  <span className="linghuiDirector3DRigSliderLabel" title={hint}>{name}</span>
                                  <Slider
                                    min={-180}
                                    max={180}
                                    step={1}
                                    value={degValue}
                                    onChange={(deg) => {
                                      const nextRad = ((deg as number) * Math.PI) / 180;
                                      const nextRig = patchRigJoint(currentRig, joint.key, axis, nextRad);
                                      handleActorChange(selectedActor.id, { rig: nextRig });
                                    }}
                                    style={{ flex: 1 }}
                                  />
                                  <span className="linghuiDirector3DRigSliderValue">{degValue}°</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                      <Button
                        size="small"
                        block
                        onClick={() => handleActorChange(selectedActor.id, { rig: undefined })}
                        disabled={!selectedActor.rig}
                      >
                        重置到预置动作
                      </Button>
                    </div>
                  </Field>
                </>
              ) : null}
              {selectedActor.type === 'creature' ? (
                <>
                  <Field label="物种">
                    <div className="linghuiDirector3DPoseGrid">
                      {CREATURE_SPECIES_LIBRARY.map(spec => (
                        <button
                          key={spec.kind}
                          type="button"
                          className={`linghuiDirector3DPoseTile ${selectedActor.species === spec.kind ? 'isActive' : ''}`}
                          onClick={() => handleActorChange(selectedActor.id, {
                            species: spec.kind,
                            color: spec.color,
                          })}
                          title={spec.promptHint}
                        >
                          {spec.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="动作">
                    <div className="linghuiDirector3DPoseGrid">
                      {(['idle', 'walk', 'run', 'pounce', 'fly', 'roar'] as LinghuiDirector3DCreatureAction[]).map(action => {
                        const labels: Record<LinghuiDirector3DCreatureAction, string> = {
                          idle: '站立', walk: '行走', run: '奔跑', pounce: '扑击', fly: '飞行', roar: '咆哮',
                        };
                        const active = (selectedActor.creatureAction ?? 'idle') === action;
                        return (
                          <button
                            key={action}
                            type="button"
                            className={`linghuiDirector3DPoseTile ${active ? 'isActive' : ''}`}
                            onClick={() => handleActorChange(selectedActor.id, {
                              creatureAction: action,
                              // 切动作时同步清掉手调骨架，让 mesh 回到该动作预置
                              creatureRig: undefined,
                            })}
                          >
                            {labels[action]}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </>
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
                  <Popover
                    open={saveAssetPopoverOpen}
                    onOpenChange={(next) => {
                      setSaveAssetPopoverOpen(next);
                      if (!next) setPendingReferenceImages([]);
                    }}
                    trigger="click"
                    placement="leftTop"
                    overlayClassName="linghuiDirector3DBattalionPopover"
                    getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
                    content={(
                      <div className="linghuiDirector3DBattalionPanel" onClick={event => event.stopPropagation()}>
                        <div className="linghuiDirector3DBattalionTitle">保存到全局库</div>
                        <div className="linghuiDirector3DBattalionHint">
                          可选附带 1-3 张参考图，下游图片节点会拿到当作真实视觉指引。
                        </div>
                        {(selectedActor.referenceImages?.length || pendingReferenceImages.length) > 0 ? (
                          <div className="linghuiDirector3DAngleStrip" style={{ marginTop: 4 }}>
                            {selectedActor.referenceImages?.map((url) => (
                              <img key={`existing-${url}`} src={url} alt="已绑定" title="已在 actor 上的参考图" />
                            ))}
                            {pendingReferenceImages.map((url) => (
                              <img key={`pending-${url}`} src={url} alt="待入库" title="本次上传，待保存入库" />
                            ))}
                          </div>
                        ) : null}
                        <div className="linghuiDirector3DBattalionActions">
                          <Button
                            size="small"
                            icon={<Upload size={14} />}
                            onClick={handlePickReferenceImages}
                            disabled={pendingReferenceImages.length + (selectedActor.referenceImages?.length ?? 0) >= 3}
                          >
                            添加参考图
                          </Button>
                          <Button size="small" type="primary" icon={<SaveIcon size={14} />} onClick={handleSaveSelectedAsGlobalAsset}>
                            保存
                          </Button>
                        </div>
                      </div>
                    )}
                  >
                    <Button size="small" icon={<SaveIcon size={14} />}>
                      存到全局库
                    </Button>
                  </Popover>
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
              </div>
            )}
          >
            <button
              type="button"
              className={`linghuiDirector3DRailButton ${selection.kind === 'actor' ? 'isActive' : ''}`}
              title="属性"
            >
              <Users size={18} />
              <span>属性</span>
            </button>
          </Popover>
        </aside>

        </div>{/* /body */}

        {/* 底部 footer：时间轴 HUD（沉浸态隐藏） */}
        {!immersive ? (
          <div className="linghuiDirector3DFooter">
            <Director3DTimelineHud
              timeline={timeline}
              currentTime={currentTime}
              playing={playing}
              selectedKeyframeId={selectedKeyframeId}
              exportState={timelineExport}
              activeLayer={activeTimelineLayer}
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
          </div>
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
