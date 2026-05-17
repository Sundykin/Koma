import React from 'react';
import type { LinghuiCanvasResultCopyKind, LinghuiCanvasResultCopyState } from '../state/linghuiCanvasResultActions';

interface LinghuiCanvasNodeContextMenuProps {
  isGroup: boolean;
  mediaState: {
    canOpenPanoramaPreview: boolean;
    canCreateSubject: boolean;
    canCopyPrimaryImage: boolean;
    canSeparateVideoAudio: boolean;
    canReturnToGenerator: boolean;
    canExpandImages: boolean;
    canDeleteOtherImages: boolean;
    canExpandVideos: boolean;
    canDeleteOtherVideos: boolean;
  };
  resultCopyState: LinghuiCanvasResultCopyState;
  hasClipboardData: boolean;
  onCreateAssetFromNode: () => void;
  onOpenPanoramaPreviewFromNode: () => void;
  onCreateSubjectFromNode: () => void;
  onFormatLayout: () => void;
  onExpandCurrentNodeImages: () => void;
  onDeleteOtherCurrentNodeImages: () => void;
  onExpandCurrentNodeVideos: () => void;
  onDeleteOtherCurrentNodeVideos: () => void;
  onCopyNodeSelection: () => void;
  onCopyPrimaryImageFromNode: () => void;
  onDuplicateNodeSelection: () => void;
  onPasteNearNode: () => void;
  onDeleteCurrentNode: () => void;
  onCopyCurrentNodeResult: (kind: LinghuiCanvasResultCopyKind) => void;
  onRunCurrentGroup: () => void;
  onExportCurrentSelection: () => void;
  onSaveCurrentGroupAsWorkflow: () => void;
  onUngroupCurrentGroup: () => void;
  onDeleteCurrentGroup: () => void;
}

export const LinghuiCanvasNodeContextMenu: React.FC<LinghuiCanvasNodeContextMenuProps> = ({
  isGroup,
  mediaState,
  resultCopyState,
  hasClipboardData,
  onCreateAssetFromNode,
  onOpenPanoramaPreviewFromNode,
  onCreateSubjectFromNode,
  onFormatLayout,
  onExpandCurrentNodeImages,
  onDeleteOtherCurrentNodeImages,
  onExpandCurrentNodeVideos,
  onDeleteOtherCurrentNodeVideos,
  onCopyNodeSelection,
  onCopyPrimaryImageFromNode,
  onDuplicateNodeSelection,
  onPasteNearNode,
  onDeleteCurrentNode,
  onCopyCurrentNodeResult,
  onRunCurrentGroup,
  onExportCurrentSelection,
  onSaveCurrentGroupAsWorkflow,
  onUngroupCurrentGroup,
  onDeleteCurrentGroup,
}) => {
  if (!isGroup) {
    return (
      <>
        <button type="button" className="linghuiContextMenuItem" onClick={onCreateAssetFromNode}>保存到我的素材</button>
        {mediaState.canOpenPanoramaPreview && (
          <button type="button" className="linghuiContextMenuItem" onClick={onOpenPanoramaPreviewFromNode} title="此模式适用于 720° 全景图像的实时预览">进入全景预览</button>
        )}
        {mediaState.canCreateSubject && (
          <button type="button" className="linghuiContextMenuItem" onClick={onCreateSubjectFromNode}>创建主体</button>
        )}
        <button type="button" className="linghuiContextMenuItem" onClick={onFormatLayout}>优化工作流布局</button>
        {mediaState.canExpandImages && (
          <button type="button" className="linghuiContextMenuItem" onClick={onExpandCurrentNodeImages}>展开所有图片</button>
        )}
        {mediaState.canDeleteOtherImages && (
          <button type="button" className="linghuiContextMenuItem" onClick={onDeleteOtherCurrentNodeImages}>删除其他图片</button>
        )}
        {mediaState.canExpandVideos && (
          <button type="button" className="linghuiContextMenuItem" onClick={onExpandCurrentNodeVideos}>展开所有视频</button>
        )}
        {mediaState.canDeleteOtherVideos && (
          <button type="button" className="linghuiContextMenuItem" onClick={onDeleteOtherCurrentNodeVideos}>删除其他视频</button>
        )}
        <div className="linghuiContextMenuDivider" />
        <button type="button" className="linghuiContextMenuItem" onClick={onCopyNodeSelection} title="仅复制当前节点">
          <span>复制节点</span>
          <span className="linghuiContextMenuShortcut">⌘C</span>
        </button>
        {mediaState.canCopyPrimaryImage && (
          <button type="button" className="linghuiContextMenuItem" onClick={onCopyPrimaryImageFromNode}>复制图片</button>
        )}
        <button type="button" className="linghuiContextMenuItem" onClick={onDuplicateNodeSelection} title="复制当前所有参数，方便你尝试不同提示词和参考内容；请注意仅支持复制上游连线，下游连线需根据新需求手动连接。">创建副本</button>
        <button type="button" className={`linghuiContextMenuItem ${hasClipboardData ? '' : 'isDisabled'}`} onClick={onPasteNearNode} disabled={!hasClipboardData}>
          <span>粘贴</span>
          <span className="linghuiContextMenuShortcut">⌘V</span>
        </button>
        <button type="button" className="linghuiContextMenuItem isDanger" onClick={onDeleteCurrentNode}>
          <span>删除</span>
          <span className="linghuiContextMenuShortcut">⌘⌫</span>
        </button>
        <div className="linghuiContextMenuDivider" />
        <button type="button" className={`linghuiContextMenuItem ${resultCopyState.canCopyMedia ? '' : 'isDisabled'}`} disabled={!resultCopyState.canCopyMedia} onClick={() => onCopyCurrentNodeResult('media')}>复制到剪贴板</button>
        {resultCopyState.canCopyTaskId && (
          <button type="button" className="linghuiContextMenuItem" onClick={() => onCopyCurrentNodeResult('taskId')}>复制 TaskId</button>
        )}
      </>
    );
  }

  return (
    <>
      <button type="button" className="linghuiContextMenuItem isPrimary" onClick={onRunCurrentGroup}>运行工作流块</button>
      <button type="button" className="linghuiContextMenuItem" onClick={onCopyNodeSelection}>复制</button>
      <button type="button" className="linghuiContextMenuItem" onClick={onDuplicateNodeSelection}>创建副本</button>
      <button type="button" className="linghuiContextMenuItem" onClick={onExportCurrentSelection}>导出工作流块结果</button>
      <button type="button" className="linghuiContextMenuItem" onClick={onSaveCurrentGroupAsWorkflow}>保存为工作流</button>
      <div className="linghuiContextMenuHint">双击工作流块标题可直接重命名</div>
      <button type="button" className="linghuiContextMenuItem" onClick={onUngroupCurrentGroup}>取消工作流块</button>
      <button type="button" className="linghuiContextMenuItem isDanger" onClick={onDeleteCurrentGroup}>删除工作流块</button>
    </>
  );
};
