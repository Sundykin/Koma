import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DBackgroundMode,
  LinghuiDirector3DCreatureSpecies,
  LinghuiDirector3DRenderMode,
  LinghuiDirector3DScene,
  LinghuiNodeData,
  LinghuiNodeRunState,
} from '../../../../types/linghui';
import {
  DIRECTOR3D_SCENE_TEMPLATES,
  type Director3DBattalionOptions,
  type Director3DCameraPreset,
  type Director3DCharacterPreset,
  type Director3DPropPreset,
  groupDirector3DCameraPresets,
} from '../../director3d/director3dScene';
import { Director3DTimelineHud } from '../../director3d/Director3DTimelineHud';
import { Director3DViewport, type Director3DViewportHandle } from '../../director3d/Director3DViewport';
import { useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import {
  Director3DAssetLibraryPanel,
  type Director3DAssetTab,
} from './Director3DAssetLibraryPanel';
import { Director3DTopBar } from './Director3DTopBar';
import { Director3DRightRail } from './Director3DRightRail';
import { useDirector3DTimelineController } from '../hooks/useDirector3DTimelineController';
import {
  DIRECTOR3D_RENDER_MODE_LABELS,
  resolveDirector3DScene,
  type Director3DSelection,
} from './Director3DNodeEditorState';
import { useDirector3DRailDismiss } from '../hooks/useDirector3DRailDismiss';
import { useDirector3DKeyboardShortcuts } from '../hooks/useDirector3DKeyboardShortcuts';
import { resolveDirector3DEditorStats } from '../state/director3dEditorStats';
import { useDirector3DGlobalAssets } from '../hooks/useDirector3DGlobalAssets';
import {
  addDirector3DActorToScene,
  addDirector3DBattalionToScene,
  addDirector3DCharacterToScene,
  addDirector3DCreatureToScene,
  addDirector3DLiteSoldierToScene,
  addDirector3DPropToScene,
  applyDirector3DActorChange,
  applyDirector3DCameraChange,
  createDirector3DRidingHorseInsertion,
} from '../state/director3dSceneMutations';
import { useDirector3DLineartExport } from '../hooks/useDirector3DLineartExport';
import {
  DIRECTOR3D_PROP_CATEGORY_ORDER,
  groupDirector3DPropsByCategory,
} from '../state/director3dAssetLibraryGroups';

interface Director3DNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  onRun?: () => void;
}

export const Director3DNodeEditor: React.FC<Director3DNodeEditorProps> = ({ nodeId, nodeData }) => {
  const { message } = App.useApp();
  const { updateNodeData } = useLinghuiNodeMutation();

  const scene = useMemo(() => resolveDirector3DScene(nodeData.properties), [nodeData.properties]);
  const [selection, setSelection] = useState<Director3DSelection>({ kind: null });
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
      properties: { ...prev.properties, scene: updater(resolveDirector3DScene(prev.properties)) },
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
    updateScene(prev => addDirector3DBattalionToScene(prev, battalionConfig));
    message.success(`已部署方阵 ${battalionConfig.rows}×${battalionConfig.cols}（${total} 人，整体可拖拽）`);
    setBattalionOpen(false);
  }, [battalionConfig, message, updateScene]);

  // 单兵群演占位：点一次加一个独立可拖拽的 mannequin-lite
  const handleAddLiteSoldier = useCallback(() => {
    updateScene(addDirector3DLiteSoldierToScene);
  }, [updateScene]);

  const handleAddCharacter = useCallback((preset: Director3DCharacterPreset) => {
    updateScene(prev => addDirector3DCharacterToScene(prev, preset));
  }, [updateScene]);

  const handleAddCreature = useCallback((species: LinghuiDirector3DCreatureSpecies) => {
    updateScene(prev => addDirector3DCreatureToScene(prev, species));
  }, [updateScene]);

  const handleAddRidingHorse = useCallback(() => {
    const insertion = createDirector3DRidingHorseInsertion(scene);
    updateScene(() => insertion.scene);
    if (insertion.riderId) setSelection({ kind: 'actor', actorId: insertion.riderId });
    message.success('已添加人骑马组合，可拖动任一成员整体移动 / 旋转');
  }, [message, scene, updateScene]);

  const {
    characterAssets,
    propAssets,
    pendingReferenceImages,
    saveAssetPopoverOpen,
    setPendingReferenceImages,
    setSaveAssetPopoverOpen,
    handleAddGlobalAsset,
    handleDeleteGlobalAsset,
    handlePickReferenceImages,
    handleSaveSelectedAsGlobalAsset,
    handleToggleAssetFavorite,
  } = useDirector3DGlobalAssets({
    selectedActor,
    selectionKind: selection.kind,
    updateScene,
  });

  const propsByCategory = useMemo(() => groupDirector3DPropsByCategory(), []);

  const handleAddActor = useCallback(() => {
    updateScene(addDirector3DActorToScene);
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

  // 左右 rail popover 外部点击关闭：rail / rail popover / 任何 antd body-portal 子弹层都算「安全区」。
  useDirector3DRailDismiss({
    openLeftRailTab,
    rightRailOpen,
    onSetOpenLeftRailTab: setOpenLeftRailTab,
    onSetRightRailOpen: setRightRailOpen,
  });

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
    updateScene(prev => addDirector3DPropToScene(prev, preset));
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
      return applyDirector3DActorChange({
        scene: prev,
        actorId,
        patch,
        currentTime,
      });
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
      return applyDirector3DCameraChange({
        scene: prev,
        camera,
        orbit,
        currentTime,
      });
    });
  }, [currentTime, updateScene]);

  const handleBackgroundModeChange = useCallback((mode: LinghuiDirector3DBackgroundMode) => {
    updateScene(prev => ({ ...prev, background: { ...prev.background, mode } }));
  }, [updateScene]);

  const handleExportLineart = useDirector3DLineartExport({
    message,
    nodeId,
    renderModeForExport,
    updateNodeData,
    viewportRef,
  });

  // preview binding 已移除：不再有"绑定下游节点 + 实时联动"流程

  const lineartPreview = (nodeData.properties as { lineartDataUrl?: string } | undefined)?.lineartDataUrl;

  // HUD 快捷键：Cmd/Ctrl+F 沉浸、1-9 切渲染模式
  // 一并接管 panel 内全部 keydown/keyup/keypress —— 工作台打开时画布的任何快捷键
  // （ReactFlow / 外层 hotkey）都不应触发，否则用户在场景里按 Backspace、空格、字母都会
  // 误删节点 / 切画布工具。capture 阶段 stopPropagation 切断事件流。
  useDirector3DKeyboardShortcuts({
    panelRootRef,
    renderModeLabels: DIRECTOR3D_RENDER_MODE_LABELS,
    onSetImmersive: setImmersive,
    onSetPreviewMode: setPreviewMode,
    onSetRenderModeForExport: setRenderModeForExport,
  });

  const stats = useMemo(() => {
    return resolveDirector3DEditorStats(scene.actors);
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
          renderModeLabels={DIRECTOR3D_RENDER_MODE_LABELS}
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
          characterAssets={characterAssets}
          lastCameraPresetIds={lastCameraPresetIds}
          openLeftRailTab={openLeftRailTab}
          propAssets={propAssets}
          propCategoryOrder={DIRECTOR3D_PROP_CATEGORY_ORDER}
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
          renderModeLabels={DIRECTOR3D_RENDER_MODE_LABELS}
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
