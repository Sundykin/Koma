import React from 'react';

interface LinghuiCanvasPaneContextMenuProps {
  hasClipboardData: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUploadImages: () => void;
  onUploadVideos: () => void;
  onUploadAudios: () => void;
  onOpenAddNodePanel: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPaste: () => void;
}

export const LinghuiCanvasPaneContextMenu: React.FC<LinghuiCanvasPaneContextMenuProps> = ({
  hasClipboardData,
  canUndo,
  canRedo,
  onUploadImages,
  onUploadVideos,
  onUploadAudios: _onUploadAudios,
  onOpenAddNodePanel,
  onUndo,
  onRedo,
  onPaste,
}) => (
  <>
    <button type="button" className="linghuiContextMenuItem" onClick={onUploadImages}>上传图片</button>
    <button type="button" className="linghuiContextMenuItem" onClick={onUploadVideos}>上传视频</button>
    <button type="button" className="linghuiContextMenuItem isDisabled" disabled onClick={onUploadImages}>保存到我的素材</button>
    <button type="button" className="linghuiContextMenuItem" onClick={onOpenAddNodePanel}>添加节点</button>
    <div className="linghuiContextMenuDivider" />
    <button type="button" className={`linghuiContextMenuItem ${canUndo ? '' : 'isDisabled'}`} disabled={!canUndo} onClick={onUndo}>
      <span>撤销</span>
      <span className="linghuiContextMenuShortcut">⌘Z</span>
    </button>
    <button type="button" className={`linghuiContextMenuItem ${canRedo ? '' : 'isDisabled'}`} disabled={!canRedo} onClick={onRedo}>
      <span>重做</span>
      <span className="linghuiContextMenuShortcut">⇧⌘Z</span>
    </button>
    <div className="linghuiContextMenuDivider" />
    <button type="button" className={`linghuiContextMenuItem ${hasClipboardData ? '' : 'isDisabled'}`} disabled={!hasClipboardData} onClick={onPaste}>
      <span>粘贴</span>
      <span className="linghuiContextMenuShortcut">⌘V</span>
    </button>
  </>
);
