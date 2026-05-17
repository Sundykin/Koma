import React from 'react';
import { Popover } from 'antd';
import { Box, Camera, Eye, Grid2x2, Image as ImageIcon, Layers, Link2, Square, Users, Wand2 } from 'lucide-react';
import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DBackgroundMode,
  LinghuiDirector3DRenderMode,
  LinghuiDirector3DScene,
} from '../../../../types/linghui';
import type { Director3DViewportHandle } from '../../director3d/Director3DViewport';
import { Director3DInspectorPanel } from './Director3DInspectorPanel';

type SelectionKind = 'actor' | null;

interface Director3DRightRailProps {
  cameraMode: 'output' | 'editor';
  lineartPreview?: string | null;
  pendingReferenceImages: string[];
  renderModeForExport: LinghuiDirector3DRenderMode;
  renderModeLabels: Record<LinghuiDirector3DRenderMode, string>;
  rightRailOpen: boolean;
  saveAssetPopoverOpen: boolean;
  scene: LinghuiDirector3DScene;
  selectedActor: LinghuiDirector3DActor | null;
  selectionKind: SelectionKind;
  viewportRef: React.RefObject<Director3DViewportHandle | null>;
  onActorChange: (actorId: string, patch: Partial<LinghuiDirector3DActor>) => void;
  onAddActor: () => void;
  onAddRidingHorse: () => void;
  onBackgroundModeChange: (mode: LinghuiDirector3DBackgroundMode) => void;
  onCameraField: <K extends keyof LinghuiDirector3DScene['camera']>(
    key: K,
    value: LinghuiDirector3DScene['camera'][K],
  ) => void;
  onDeleteActor: (actorId: string) => void;
  onExportLineart: () => void;
  onPickReferenceImages: () => void;
  onSaveSelectedAsGlobalAsset: () => void;
  onSetCameraMode: React.Dispatch<React.SetStateAction<'output' | 'editor'>>;
  onSetPendingReferenceImages: React.Dispatch<React.SetStateAction<string[]>>;
  onSetPreviewMode: React.Dispatch<React.SetStateAction<'preview' | 'lineart' | 'silhouette'>>;
  onSetRenderModeForExport: React.Dispatch<React.SetStateAction<LinghuiDirector3DRenderMode>>;
  onSetRightRailOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSetSaveAssetPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onUpdateScene: (updater: (prev: LinghuiDirector3DScene) => LinghuiDirector3DScene) => void;
}

const RENDER_MODE_BUTTONS = [
  { mode: 'preview' as const, Icon: ImageIcon, short: '彩色' },
  { mode: 'lineart' as const, Icon: Square, short: '线稿' },
  { mode: 'silhouette' as const, Icon: Box, short: '剪影' },
  { mode: 'depth' as const, Icon: Layers, short: '深度' },
  { mode: 'composition' as const, Icon: Grid2x2, short: '构图' },
];

export const Director3DRightRail: React.FC<Director3DRightRailProps> = ({
  cameraMode,
  lineartPreview,
  pendingReferenceImages,
  renderModeForExport,
  renderModeLabels,
  rightRailOpen,
  saveAssetPopoverOpen,
  scene,
  selectedActor,
  selectionKind,
  viewportRef,
  onActorChange,
  onAddActor,
  onAddRidingHorse,
  onBackgroundModeChange,
  onCameraField,
  onDeleteActor,
  onExportLineart,
  onPickReferenceImages,
  onSaveSelectedAsGlobalAsset,
  onSetCameraMode,
  onSetPendingReferenceImages,
  onSetPreviewMode,
  onSetRenderModeForExport,
  onSetRightRailOpen,
  onSetSaveAssetPopoverOpen,
  onUpdateScene,
}) => (
  <aside className="linghuiDirector3DRail isRight">
    <div className="linghuiDirector3DRailGroup isCamera" title="视角">
      <button
        type="button"
        className={`linghuiDirector3DRailButton ${cameraMode === 'output' ? 'isActive' : ''}`}
        onClick={() => onSetCameraMode('output')}
        title="输出视角：拖动 / 缩放写入输出相机"
      >
        <Camera size={16} />
        <span>输出</span>
      </button>
      <button
        type="button"
        className={`linghuiDirector3DRailButton ${cameraMode === 'editor' ? 'isActive' : ''}`}
        onClick={() => onSetCameraMode('editor')}
        title="编辑视角：仅查看，不改输出"
      >
        <Eye size={16} />
        <span>编辑</span>
      </button>
      {cameraMode === 'editor' ? (
        <button
          type="button"
          className="linghuiDirector3DRailButton"
          onClick={() => {
            const current = viewportRef.current?.getCurrentCamera();
            if (!current) return;
            onUpdateScene(prev => ({ ...prev, camera: { ...current } }));
            onSetCameraMode('output');
          }}
          title="把当前编辑视角固化为输出相机"
        >
          <Link2 size={16} />
          <span>固化</span>
        </button>
      ) : null}
    </div>

    <div className="linghuiDirector3DRailGroup isRender" title="渲染风格">
      {RENDER_MODE_BUTTONS.map(({ mode, Icon, short }) => (
        <button
          key={mode}
          type="button"
          className={`linghuiDirector3DRailButton ${renderModeForExport === mode ? 'isActive' : ''}`}
          onClick={() => {
            onSetRenderModeForExport(mode);
            onSetPreviewMode(mode === 'silhouette' ? 'silhouette' : mode === 'lineart' ? 'lineart' : 'preview');
          }}
          title={`导出 ${renderModeLabels[mode]} 风格`}
        >
          <Icon size={16} />
          <span>{short}</span>
        </button>
      ))}
    </div>

    <div className="linghuiDirector3DRailGroup isExport" title="导出">
      <button
        type="button"
        className="linghuiDirector3DRailButton isAccent"
        onClick={onExportLineart}
        title={`导出 ${renderModeLabels[renderModeForExport]}`}
      >
        <Wand2 size={16} />
        <span>导出</span>
      </button>
      {lineartPreview ? (
        <img
          className="linghuiDirector3DRailThumb"
          src={lineartPreview}
          alt="lineart preview"
          title="最近导出"
        />
      ) : null}
    </div>

    <Popover
      open={rightRailOpen}
      trigger="hover"
      placement="left"
      align={{ overflow: { adjustY: true, adjustX: true } }}
      mouseEnterDelay={0.1}
      mouseLeaveDelay={0.2}
      overlayClassName="linghuiDirector3DRailPopover"
      getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
      onOpenChange={(open) => {
        if (open) onSetRightRailOpen(true);
      }}
      content={(
        <Director3DInspectorPanel
          pendingReferenceImages={pendingReferenceImages}
          saveAssetPopoverOpen={saveAssetPopoverOpen}
          scene={scene}
          selectedActor={selectedActor}
          selectionKind={selectionKind}
          onActorChange={onActorChange}
          onAddActor={onAddActor}
          onAddRidingHorse={onAddRidingHorse}
          onBackgroundModeChange={onBackgroundModeChange}
          onCameraField={onCameraField}
          onDeleteActor={onDeleteActor}
          onPickReferenceImages={onPickReferenceImages}
          onSaveSelectedAsGlobalAsset={onSaveSelectedAsGlobalAsset}
          onSetPendingReferenceImages={onSetPendingReferenceImages}
          onSetSaveAssetPopoverOpen={onSetSaveAssetPopoverOpen}
        />
      )}
    >
      <div className="linghuiDirector3DRailGroup isInspector" title="属性">
        <button
          type="button"
          className={`linghuiDirector3DRailButton ${selectionKind === 'actor' ? 'isActive' : ''}`}
          title="属性"
        >
          <Users size={18} />
          <span>属性</span>
        </button>
      </div>
    </Popover>
  </aside>
);
