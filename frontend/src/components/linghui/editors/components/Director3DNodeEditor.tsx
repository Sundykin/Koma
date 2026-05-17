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
import { App, Button } from 'antd';
import { useNodes } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { Plus, RotateCw, Trash2 } from 'lucide-react';
import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DBackgroundMode,
  LinghuiDirector3DCreatureSpecies,
  LinghuiDirector3DKeyframe,
  LinghuiDirector3DNodeProperties,
  LinghuiDirector3DRenderMode,
  LinghuiDirector3DScene,
  LinghuiNodeData,
  LinghuiNodeRunState,
} from '../../../../types/linghui';
import {
  DIRECTOR3D_CAMERA_PRESETS,
  DIRECTOR3D_CAMERA_PRESET_CATEGORY_LABELS,
  DIRECTOR3D_CHARACTER_PRESETS,
  DIRECTOR3D_PROP_CATEGORY_LABELS,
  DIRECTOR3D_PROP_LIBRARY,
  DIRECTOR3D_SCENE_TEMPLATES,
  type Director3DBattalionOptions,
  type Director3DCameraPreset,
  type Director3DCharacterPreset,
  type Director3DPropCategory,
  type Director3DPropPreset,
  cloneCameraForKeyframe,
  snapshotActorAsKeyframeActor,
  compileDirector3DPromptFragment,
  createDefaultDirector3DScene,
  createDirector3DActor,
  createDirector3DBattalion,
  createDirector3DCharacter,
  createDirector3DCreature,
  createDirector3DRidingHorse,
  createDirector3DLiteSoldier,
  createDirector3DProp,
  groupDirector3DCameraPresets,
} from '../../director3d/director3dScene';
import { Director3DTimelineHud } from '../../director3d/Director3DTimelineHud';
import { useLinghuiGlobalAssets, type LinghuiGlobalAsset, type LinghuiGlobalAssetCategory, type LinghuiGlobalAssetPropType } from '../../../../store/linghuiGlobalAssets';
import { pickReferenceImagesAndPersist } from '../../director3d/director3dReferenceImageUpload';
import { Director3DViewport, type Director3DViewportHandle } from '../../director3d/Director3DViewport';
import { useLinghuiNodeEditorApi, useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { persistMediaAsset } from '../../../../services/mediaPersistenceService';
import { getLinghuiResultPrimaryMedia } from '../../../../types/linghui';
import {
  Director3DAssetLibraryPanel,
  type Director3DAssetTab,
} from './Director3DAssetLibraryPanel';
import { Director3DTopBar } from './Director3DTopBar';
import { Director3DRightRail } from './Director3DRightRail';
import { useDirector3DTimelineController } from '../hooks/useDirector3DTimelineController';

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

function normalizeAngleRadians(value: number): number {
  let next = value;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

const RENDER_MODE_LABELS: Record<LinghuiDirector3DRenderMode, string> = {
  preview: '彩色',
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
  const [activeAssetTab, setActiveAssetTab] = useState<Director3DAssetTab>('characters');
  // 左右 rail 用受控 open：hover 触发开，关闭只走 ① 点击工作台之外区域 ② Esc ③ 切到另一个 tab。
  // 之前 antd 默认 hover-leave 在用户 mouse 移到 body-mounted 子 popup（Select 下拉 / ColorPicker /
  // 派兵布阵 popover）上时会触发，从而提前关闭外层 rail；切受控避开这条路径。
  const [openLeftRailTab, setOpenLeftRailTab] = useState<Director3DAssetTab | null>(null);
  const [rightRailOpen, setRightRailOpen] = useState(false);
  // 默认彩色预览：保留物体颜色 + 含地面/天空 + 无描边 → 所见即所得
  const [renderModeForExport, setRenderModeForExport] = useState<LinghuiDirector3DRenderMode>('preview');
  const [previewMode, setPreviewMode] = useState<'preview' | 'lineart' | 'silhouette'>('preview');
  // HUD：左右 activity rail（纯图标）+ hover 出独立 popover；Cmd+F 沉浸（隐藏 rail）
  const [immersive, setImmersive] = useState(false);
  // 相机模式：
  //  - 'output'（默认）：拖动 → 写入 scene.camera = 关键帧 / 导出图视频用的相机
  //  - 'editor'：拖动只改 viewport 本地视角，不影响输出，方便从其他角度看场景
  const [cameraMode, setCameraMode] = useState<'output' | 'editor'>('output');
  const viewportRef = useRef<Director3DViewportHandle | null>(null);
  // panelRootRef：用于把 director3d 自己的快捷键 + 全键盘事件拦截绑在 panel 根上，
  // capture 阶段 stopPropagation，避免 ReactFlow / 外层画布快捷键在用户编辑时被触发。
  const panelRootRef = useRef<HTMLDivElement | null>(null);

  // 历史的 popoverEventBlockers 已彻底删除：
  //  - antd Slider / InputNumber / ColorPicker / Select 内部都靠 document 原生监听
  //    （mouseup / pointerup / pointermove）来释放拖拽 / 切换焦点 / commit 选择。
  //    任何形式的 stopPropagation（React 合成或 nativeEvent）都会在事件冒泡链上
  //    某一节点拦截，让 document 收不到信号 → 拖拽不释放、选项点不中、滑块跟手。
  //  - popover 稳定性由 controlled `open` state + 文档级外部点击检测实现，不再
  //    依赖内部事件阻断。
  //  - React Flow 的画布交互只在 `.react-flow` DOM 子树内监听，popover 走 body-portal
  //    本就不在 RF 命中范围，不会误触发 pan / zoom / 节点选择。
  // 所有 popover content / panel root / 全屏容器都让事件自然冒泡。

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

  const handleAddRidingHorse = useCallback(() => {
    const seq = scene.actors.filter(a => a.groupRole === 'rider').length + 1;
    const offsetX = (seq % 2 === 1 ? 1 : -1) * 1.1 * Math.ceil(seq / 2);
    const combo = createDirector3DRidingHorse({
      label: `人骑马 ${seq}`,
      position: [Number(offsetX.toFixed(2)), 0, 0],
    });
    const riderId = combo.find(actor => actor.groupRole === 'rider')?.id ?? combo[0]?.id ?? null;
    updateScene(prev => {
      return { ...prev, actors: [...prev.actors, ...combo] };
    });
    if (riderId) {
      setSelection({ kind: 'actor', actorId: riderId });
    }
    message.success('已添加人骑马组合，可拖动任一成员整体移动 / 旋转');
  }, [message, scene.actors, updateScene]);

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

  // 左右 rail popover 外部点击关闭：rail / rail popover / 任何 antd body-portal 子弹层
  // 都算「安全区」，点这些不关；点其他地方才关。Esc 也关。
  useEffect(() => {
    if (openLeftRailTab === null && !rightRailOpen) return undefined;
    const isInsideRailZone = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest('.linghuiDirector3DRail')
        || target.closest('.linghuiDirector3DRailPopover')
        || target.closest('.linghuiDirector3DBattalionPopover')
        || target.closest('.ant-popover')
        || target.closest('.ant-select-dropdown')
        || target.closest('.ant-picker-dropdown')
        || target.closest('.ant-color-picker-dropdown')
        || target.closest('.ant-dropdown')
        || target.closest('.ant-slider-tooltip'),
      );
    };
    const closeAll = () => {
      setOpenLeftRailTab(null);
      setRightRailOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (isInsideRailZone(e.target)) return;
      closeAll();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [openLeftRailTab, rightRailOpen]);

  const {
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
  } = useDirector3DTimelineController({
    message,
    nodeData,
    nodeId,
    renderModeForExport,
    scene,
    selectedActor,
    selectionKind: selection.kind,
    updateNodeData,
    updateScene,
    viewportRef,
  });

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
      const sourceActor = prev.actors.find(a => a.id === actorId);
      const groupId = sourceActor?.groupId;
      const shouldMoveGroup = Boolean(groupId && patch.position);
      const shouldRotateGroup = Boolean(groupId && typeof patch.rotationY === 'number');
      const deltaPosition = sourceActor && patch.position
        ? [
            patch.position[0] - sourceActor.position[0],
            patch.position[1] - sourceActor.position[1],
            patch.position[2] - sourceActor.position[2],
          ] as [number, number, number]
        : null;
      const deltaRotation = sourceActor && typeof patch.rotationY === 'number'
        ? normalizeAngleRadians(patch.rotationY - sourceActor.rotationY)
        : 0;
      const groupMembers = groupId ? prev.actors.filter(actor => actor.groupId === groupId) : [];
      const mountPivot = groupMembers.find(actor => actor.groupRole === 'mount')?.position;
      const averagePivot: [number, number, number] | null = groupMembers.length > 0
        ? [
            groupMembers.reduce((sum, actor) => sum + actor.position[0], 0) / groupMembers.length,
            groupMembers.reduce((sum, actor) => sum + actor.position[1], 0) / groupMembers.length,
            groupMembers.reduce((sum, actor) => sum + actor.position[2], 0) / groupMembers.length,
          ]
        : null;
      const pivot: [number, number, number] = mountPivot ?? averagePivot ?? sourceActor?.position ?? [0, 0, 0];
      const nextActors: LinghuiDirector3DActor[] = prev.actors.map((actor): LinghuiDirector3DActor => {
        if (actor.id === actorId && !shouldRotateGroup) return { ...actor, ...patch };
        if (!groupId || actor.groupId !== groupId) return actor;
        if (shouldMoveGroup && deltaPosition) {
          return {
            ...actor,
            position: [
              Number((actor.position[0] + deltaPosition[0]).toFixed(4)),
              Number((actor.position[1] + deltaPosition[1]).toFixed(4)),
              Number((actor.position[2] + deltaPosition[2]).toFixed(4)),
            ] as [number, number, number],
          };
        }
        if (shouldRotateGroup) {
          const dx = actor.position[0] - pivot[0];
          const dz = actor.position[2] - pivot[2];
          const cos = Math.cos(deltaRotation);
          const sin = Math.sin(deltaRotation);
          const isSource = actor.id === actorId;
          return {
            ...actor,
            ...(isSource ? patch : {}),
            position: [
              Number((pivot[0] + dx * cos - dz * sin).toFixed(4)),
              isSource && patch.position ? patch.position[1] : actor.position[1],
              Number((pivot[2] + dx * sin + dz * cos).toFixed(4)),
            ] as [number, number, number],
            rotationY: normalizeAngleRadians(actor.rotationY + deltaRotation),
          };
        }
        return actor;
      });
      const tl = prev.timeline;
      // 时间轴还没启用（无关键帧）→ 仅静态修改，不自动加帧
      if (!tl || tl.keyframes.length === 0) {
        return { ...prev, actors: nextActors };
      }
      const nextActor = nextActors.find(a => a.id === actorId);
      if (!nextActor) return { ...prev, actors: nextActors };
      const t = Math.max(0, Math.min(tl.duration, Number(currentTime.toFixed(3))));
      const changedActorIds = groupId && (shouldMoveGroup || shouldRotateGroup)
        ? nextActors.filter(actor => actor.groupId === groupId).map(actor => actor.id)
        : [actorId];
      let nextKeyframes = tl.keyframes;
      for (const changedActorId of changedActorIds) {
        const actorForSnapshot = nextActors.find(actor => actor.id === changedActorId);
        if (!actorForSnapshot) continue;
        const scope = `actor:${changedActorId}` as const;
        // 永远 ensure 自己 scope 的关键帧，不再去碰 scene 帧 —— 让图层真正独立
        const existing = nextKeyframes.find(k => k.scope === scope && Math.abs(k.time - t) < 0.02);
        const snapshot = snapshotActorAsKeyframeActor(actorForSnapshot);
        if (existing) {
          nextKeyframes = nextKeyframes.map(k => (k.id === existing.id ? { ...k, actors: [snapshot] } : k));
        } else {
          const newKf: LinghuiDirector3DKeyframe = {
            id: `kf_${Date.now().toString(36)}_${changedActorId}_${Math.random().toString(36).slice(2, 5)}`,
            time: t,
            scope,
            actors: [snapshot],
            camera: prev.camera,
          };
          nextKeyframes = [...nextKeyframes, newKf].sort((a, b) => a.time - b.time);
        }
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

  const handleActorRotate = useCallback((actorId: string, rotationY: number) => {
    handleActorChange(actorId, { rotationY });
  }, [handleActorChange]);

  const handleDeleteActor = useCallback((actorId: string) => {
    updateScene(prev => {
      const actor = prev.actors.find(a => a.id === actorId);
      if (!actor?.groupId) {
        return { ...prev, actors: prev.actors.filter(a => a.id !== actorId) };
      }
      return { ...prev, actors: prev.actors.filter(a => a.groupId !== actor.groupId) };
    });
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
      const cameraOrbit = orbit ? { ...orbit } : undefined;
      // 永远 ensure scope='camera' 关键帧，不再触碰 scene 帧 —— 让镜头轨独立
      const existing = tl.keyframes.find(k => k.scope === 'camera' && Math.abs(k.time - t) < 0.02);
      let nextKeyframes = tl.keyframes;
      if (existing) {
        nextKeyframes = nextKeyframes.map(k => (k.id === existing.id ? { ...k, camera: cameraClone, ...(cameraOrbit ? { cameraOrbit } : {}) } : k));
      } else {
        const newKf: LinghuiDirector3DKeyframe = {
          id: `kf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          time: t,
          scope: 'camera',
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

    // 关键：落盘成 koma-local URL，否则下游 @-ref 系统拒绝 data: URL，导致
    // 图片导出后无法被下游图片/视频节点引用（视频流之所以能用，是因为时间轴导出
    // 走 ffmpeg 已经写到文件了）。落盘失败兜底回 dataUrl，至少 UI 缩略图还能预览。
    let persistedSource = dataUrl;
    try {
      const stored = await persistMediaAsset({
        projectId: 'linghui',
        kind: 'image',
        source: dataUrl,
        mimeType: 'image/png',
        provider: 'director3d-local',
        metadata: { nodeId, slot: 'lineart', origin: 'director3d-capture', renderMode: renderModeForExport },
      });
      if (stored.localPath) {
        persistedSource = toFileSystemDisplayUrl(stored.localPath) ?? stored.localPath;
      }
    } catch (error) {
      // 落盘失败不阻塞导出 —— 缩略图仍可预览，下游 @-ref 拿不到时再让用户手动 Run 节点走执行落盘
      message.warning('线稿落盘失败，下游可能无法直接引用，请尝试运行节点');
      // eslint-disable-next-line no-console
      console.warn('[Director3D] 线稿落盘失败', error);
    }

    // 把 koma-local URL 写到节点 properties，方便下游图片节点直接拿来当参考。
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
          lineartDataUrl: persistedSource,
          directorPromptFragment: fragment,
          exportRenderMode: renderModeForExport,
        },
      };
    });
    message.success(`${modeLabel}已生成，可在下游图片节点引用`);
  }, [message, nodeId, renderModeForExport, updateNodeData]);

  // 监听场景关键变化（actors / camera / background），实时模式下据此触发防抖出图
  const sceneSignature = useMemo(() => JSON.stringify({
    actors: scene.actors.map(a => ({ id: a.id, pos: a.position, rot: a.rotationY, scale: a.scale, pose: a.posePreset, type: a.type, formation: a.formation })),
    camera: scene.camera,
    background: scene.background,
  }), [scene]);

  // preview binding 已移除：不再有"绑定下游节点 + 实时联动"流程

  const lineartPreview = (nodeData.properties as { lineartDataUrl?: string } | undefined)?.lineartDataUrl;

  // HUD 快捷键：Cmd/Ctrl+F 沉浸、1-9 切渲染模式
  // 一并接管 panel 内全部 keydown/keyup/keypress —— 工作台打开时画布的任何快捷键
  // （ReactFlow / 外层 hotkey）都不应触发，否则用户在场景里按 Backspace、空格、字母都会
  // 误删节点 / 切画布工具。capture 阶段 stopPropagation 切断事件流。
  const renderModeKeys = useMemo<LinghuiDirector3DRenderMode[]>(
    () => Object.keys(RENDER_MODE_LABELS) as LinghuiDirector3DRenderMode[],
    [],
  );
  useEffect(() => {
    const root = panelRootRef.current;
    if (!root) return undefined;

    const isTextInput = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // 文本输入态：放行键盘事件给输入框自身，但仍 stopPropagation 阻止冒泡到画布
      if (!isTextInput(event.target)) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          setImmersive(prev => !prev);
        } else if (/^[1-9]$/.test(event.key)) {
          const idx = Number(event.key) - 1;
          const mode = renderModeKeys[idx];
          if (mode) {
            event.preventDefault();
            setRenderModeForExport(mode);
            setPreviewMode(mode === 'silhouette' ? 'silhouette' : mode === 'lineart' ? 'lineart' : 'preview');
          }
        }
      }
      event.stopPropagation();
    };
    const blockBubble = (event: KeyboardEvent) => {
      event.stopPropagation();
    };

    // bubble 阶段（capture=false）：先让 target / 子组件（antd Select / InputNumber /
    // ColorPicker 内部 keydown handler）处理完事件，再 stopPropagation 阻止冒泡到
    // ReactFlow / 画布。capture 阶段无条件 stopPropagation 会让 antd 内部状态错乱，
    // 表现为下拉打开后选项点不中、Number 上下箭头键失灵。
    root.addEventListener('keydown', onKeyDown, false);
    root.addEventListener('keyup', blockBubble, false);
    root.addEventListener('keypress', blockBubble, false);
    return () => {
      root.removeEventListener('keydown', onKeyDown, false);
      root.removeEventListener('keyup', blockBubble, false);
      root.removeEventListener('keypress', blockBubble, false);
    };
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
    <div
      ref={panelRootRef}
      className={panelClassName}
      tabIndex={-1}
    >
      <div className="linghuiDirector3DLayout">
        {/* 顶部 HUD：状态条 */}
        <Director3DTopBar
          immersive={immersive}
          renderModeForExport={renderModeForExport}
          renderModeLabels={RENDER_MODE_LABELS}
          scene={scene}
          stats={stats}
          onToggleImmersive={() => setImmersive(prev => !prev)}
        />

        {/* 主体：左 rail | 视口 | 右 rail，flex 中间撑开 */}
        <div className="linghuiDirector3DBody">

        {/* 左侧 activity bar：纵向 5 个独立图标按钮，hover 各自弹出对应资产面板 */}
        <Director3DAssetLibraryPanel
          activeAssetTab={activeAssetTab}
          battalionConfig={battalionConfig}
          battalionOpen={battalionOpen}
          cameraPresetGroups={cameraPresetGroups}
          characterAssets={characterAssets.assets}
          lastCameraPresetIds={lastCameraPresetIds}
          openLeftRailTab={openLeftRailTab}
          propAssets={propAssets.assets}
          propCategoryOrder={propCategoryOrder}
          propsByCategory={propsByCategory}
          onAddActor={handleAddActor}
          onAddCharacter={handleAddCharacter}
          onAddCreature={handleAddCreature}
          onAddGlobalAsset={handleAddGlobalAsset}
          onAddLiteSoldier={handleAddLiteSoldier}
          onAddProp={handleAddProp}
          onAddRidingHorse={handleAddRidingHorse}
          onApplyCameraPreset={handleApplyCameraPreset}
          onApplyTemplate={handleApplyTemplate}
          onDeleteGlobalAsset={asset => { void handleDeleteGlobalAsset(asset); }}
          onDeployBattalion={handleDeployBattalion}
          onSetActiveAssetTab={setActiveAssetTab}
          onSetBattalionConfig={setBattalionConfig}
          onSetBattalionOpen={setBattalionOpen}
          onSetOpenLeftRailTab={setOpenLeftRailTab}
          onToggleAssetFavorite={asset => { void handleToggleAssetFavorite(asset); }}
        />

        {/* 中央：3D 视口 + 镜头条 */}
        <main className="linghuiDirector3DStage">
          <div className="linghuiDirector3DStageSurface">
            <Director3DViewport
              ref={viewportRef}
              scene={runtimeScene}
              selectedActorId={selection.kind === 'actor' ? selection.actorId : null}
              onActorClick={(id) => setSelection({ kind: 'actor', actorId: id })}
              onActorMove={handleActorMove}
              onActorRotate={handleActorRotate}
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
        </main>

        {/* 右侧 activity rail：属性 + 时间轴关键帧入口；属性 popover 内容根据选中状态切换 */}
        <Director3DRightRail
          cameraMode={cameraMode}
          lineartPreview={lineartPreview}
          pendingReferenceImages={pendingReferenceImages}
          renderModeForExport={renderModeForExport}
          renderModeLabels={RENDER_MODE_LABELS}
          rightRailOpen={rightRailOpen}
          saveAssetPopoverOpen={saveAssetPopoverOpen}
          scene={scene}
          selectedActor={selectedActor}
          selectionKind={selection.kind}
          viewportRef={viewportRef}
          onActorChange={handleActorChange}
          onAddActor={handleAddActor}
          onAddRidingHorse={handleAddRidingHorse}
          onBackgroundModeChange={handleBackgroundModeChange}
          onCameraField={handleCameraField}
          onDeleteActor={handleDeleteActor}
          onExportLineart={handleExportLineart}
          onPickReferenceImages={handlePickReferenceImages}
          onSaveSelectedAsGlobalAsset={handleSaveSelectedAsGlobalAsset}
          onSetCameraMode={setCameraMode}
          onSetPendingReferenceImages={setPendingReferenceImages}
          onSetPreviewMode={setPreviewMode}
          onSetRenderModeForExport={setRenderModeForExport}
          onSetRightRailOpen={setRightRailOpen}
          onSetSaveAssetPopoverOpen={setSaveAssetPopoverOpen}
          onUpdateScene={updateScene}
        />

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
              exportedVideoUrl={timelineVideoUrl}
              exportedVideoPosterUrl={timelineVideoPosterUrl}
              onPlayToggle={handlePlayToggle}
              onSeek={handleSeek}
              onAddKeyframe={handleAddKeyframe}
              onRemoveKeyframe={handleRemoveKeyframe}
              onSelectKeyframe={setSelectedKeyframeId}
              onMoveKeyframe={handleMoveKeyframe}
              onDurationChange={handleDurationChange}
              onFpsChange={handleFpsChange}
              onEasingChange={handleEasingChange}
              onExportResolutionChange={handleExportResolutionChange}
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


export default Director3DNodeEditor;
