import React, { useLayoutEffect, useRef, useState } from 'react';
import type { LinghuiNodeCatalogItem } from '../../../../types/linghui';
import type { LinghuiCanvasMenuState } from '../state/linghuiCanvasShared';
import type {
  LinghuiCanvasResultCopyKind,
  LinghuiCanvasResultCopyState,
} from '../state/linghuiCanvasResultActions';

const CONTEXT_MENU_VIEWPORT_GUTTER = 12;

interface ContextMenuOffsets {
  x: number;
  y: number;
}

function clampContextMenuPosition(
  rect: DOMRect,
  parentRect: DOMRect,
  preferred: ContextMenuOffsets,
): ContextMenuOffsets {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const absoluteLeft = parentRect.left + preferred.x;
  const absoluteTop = parentRect.top + preferred.y;

  const minLeft = CONTEXT_MENU_VIEWPORT_GUTTER;
  const maxLeft = viewportWidth - rect.width - CONTEXT_MENU_VIEWPORT_GUTTER;
  const minTop = CONTEXT_MENU_VIEWPORT_GUTTER;
  const maxTop = viewportHeight - rect.height - CONTEXT_MENU_VIEWPORT_GUTTER;

  const clampedAbsLeft = maxLeft >= minLeft
    ? Math.min(Math.max(absoluteLeft, minLeft), maxLeft)
    : minLeft;
  const clampedAbsTop = maxTop >= minTop
    ? Math.min(Math.max(absoluteTop, minTop), maxTop)
    : minTop;

  return {
    x: clampedAbsLeft - parentRect.left,
    y: clampedAbsTop - parentRect.top,
  };
}

interface LinghuiCanvasContextMenuProps {
  contextMenu: LinghuiCanvasMenuState | null;
  contextMenuNodeIsGroup: boolean;
  contextMenuResultCopyState: LinghuiCanvasResultCopyState;
  contextMenuMediaActionState: {
    imageCount: number;
    videoCount: number;
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
  contextMenuSelectionIds: string[];
  nodeCatalog: LinghuiNodeCatalogItem[];
  hasClipboardData: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onAddNode: (item: LinghuiNodeCatalogItem) => void;
  /**
   * LibTV "添加节点" 实现：右键菜单点击后，关闭菜单 + 在该位置打开"添加节点"弹层（quickCreate）。
   * LibTV 打包产物里 onAddNode 内部派发 .react-flow__pane 的 dblclick 事件 = 打开 quickCreate。
   * 灵绘双击画布已经触发 openQuickCreateAt，所以这里也走同一条路径。
   */
  onOpenAddNodePanel: () => void;
  onCopyNodeSelection: () => void;
  onDuplicateNodeSelection: () => void;
  onOpenDownstreamQuickCreate: () => void;
  onCreateAssetFromNode: () => void;
  onOpenPanoramaPreviewFromNode: () => void;
  onCreateSubjectFromNode: () => void;
  onCopyPrimaryImageFromNode: () => void;
  onSeparateVideoAudioFromNode: () => void;
  onReturnToGenerator: () => void;
  onCopyCurrentNodeResult: (kind: LinghuiCanvasResultCopyKind) => void;
  onExpandCurrentNodeImages: () => void;
  onDeleteOtherCurrentNodeImages: () => void;
  onExpandCurrentNodeVideos: () => void;
  onDeleteOtherCurrentNodeVideos: () => void;
  onRunCurrentNode: () => void;
  onRunCurrentGroup: () => void;
  onExportCurrentSelection: () => void;
  onSaveCurrentGroupAsWorkflow: () => void;
  onUngroupCurrentGroup: () => void;
  onDeleteCurrentGroup: () => void;
  onPasteNearNode: () => void;
  onDeleteCurrentNode: () => void;
  onDeleteCurrentEdge: () => void;
  onUploadImages: () => void;
  onUploadVideos: () => void;
  onUploadAudios: () => void;
  onFormatLayout: () => void;
  onOpenShortcutPanel: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRunAll: () => void;
  onRunSelection: () => void;
  onExportSelection: () => void;
  onSaveSelectionAsWorkflow: () => void;
  onCopySelection: () => void;
  onDuplicateSelection: () => void;
  onDeleteSelection: () => void;
}

export const LinghuiCanvasContextMenu: React.FC<LinghuiCanvasContextMenuProps> = ({
  contextMenu,
  contextMenuNodeIsGroup,
  contextMenuResultCopyState,
  contextMenuMediaActionState,
  contextMenuSelectionIds,
  nodeCatalog,
  hasClipboardData,
  canUndo,
  canRedo,
  onAddNode,
  onOpenAddNodePanel,
  onCopyNodeSelection,
  onDuplicateNodeSelection,
  onOpenDownstreamQuickCreate,
  onCreateAssetFromNode,
  onOpenPanoramaPreviewFromNode,
  onCreateSubjectFromNode,
  onCopyPrimaryImageFromNode,
  onSeparateVideoAudioFromNode,
  onReturnToGenerator,
  onCopyCurrentNodeResult,
  onExpandCurrentNodeImages,
  onDeleteOtherCurrentNodeImages,
  onExpandCurrentNodeVideos,
  onDeleteOtherCurrentNodeVideos,
  onRunCurrentNode,
  onRunCurrentGroup,
  onExportCurrentSelection,
  onSaveCurrentGroupAsWorkflow,
  onUngroupCurrentGroup,
  onDeleteCurrentGroup,
  onPasteNearNode,
  onDeleteCurrentNode,
  onDeleteCurrentEdge,
  onUploadImages,
  onUploadVideos,
  onUploadAudios,
  onFormatLayout,
  onOpenShortcutPanel,
  onPaste,
  onUndo,
  onRedo,
  onRunAll,
  onRunSelection,
  onExportSelection,
  onSaveSelectionAsWorkflow,
  onCopySelection,
  onDuplicateSelection,
  onDeleteSelection,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [adjusted, setAdjusted] = useState<ContextMenuOffsets | null>(null);
  const menuKey = contextMenu ? `${contextMenu.kind}:${contextMenu.x}:${contextMenu.y}` : '';

  useLayoutEffect(() => {
    if (!contextMenu) {
      setAdjusted(null);
      return;
    }
    const element = menuRef.current;
    if (!element) return;
    const parent = element.offsetParent as HTMLElement | null;
    if (!parent) return;
    const rect = element.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const next = clampContextMenuPosition(rect, parentRect, {
      x: contextMenu.x,
      y: contextMenu.y,
    });
    const preferredMatch = Math.abs(next.x - contextMenu.x) < 1 && Math.abs(next.y - contextMenu.y) < 1;
    if (preferredMatch) {
      setAdjusted(prev => (prev ? null : prev));
      return;
    }
    setAdjusted(prev => {
      if (prev && Math.abs(prev.x - next.x) < 1 && Math.abs(prev.y - next.y) < 1) {
        return prev;
      }
      return next;
    });
  }, [contextMenu, menuKey]);

  if (!contextMenu) return null;

  const overlayLeft = adjusted ? adjusted.x : contextMenu.x;
  const overlayTop = adjusted ? adjusted.y : contextMenu.y;

  return (
    <div
      ref={menuRef}
      className="linghuiContextMenu nopan nowheel"
      style={{
        '--linghui-overlay-left': `${overlayLeft}px`,
        '--linghui-overlay-top': `${overlayTop}px`,
      } as React.CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {contextMenu.kind === 'node' && (
        <>
          {!contextMenuNodeIsGroup ? (
            // ============================================================
            // LibTV 节点右键菜单 1:1 复刻（来源：libtv 打包 chunk 0gg5ir~xd-ho3.js）
            // 顺序：
            //   保存到我的素材
            //   进入全景预览 (条件)
            //   创建主体
            //   优化工作流布局 (条件)
            //   展开所有图片 (条件)
            //   删除其他图片 (条件)
            //   展开所有视频 (条件)
            //   删除其他视频 (条件)
            //   ─
            //   复制节点 (⌘C, tooltip: 仅复制当前节点)
            //   复制图片 (条件)
            //   创建副本 (tooltip: 复制当前所有参数...)
            //   粘贴 (⌘V)
            //   删除 (⌘⌫)
            //   ─
            //   复制到剪贴板
            //   复制 TaskId (条件)
            // 灵绘历史菜单中的"运行/继续创建下游/返回生成节点/更多操作/导出当前结果/复制结果文本/复制媒体地址"
            // 故意不在 LibTV 右键菜单里——这些能力转到节点工具条 / 节点悬浮按钮。
            // ============================================================
            <>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onCreateAssetFromNode}
              >
                保存到我的素材
              </button>
              {contextMenuMediaActionState.canOpenPanoramaPreview && (
                <button
                  type="button"
                  className="linghuiContextMenuItem"
                  onClick={onOpenPanoramaPreviewFromNode}
                  title="此模式适用于 720° 全景图像的实时预览"
                >
                  进入全景预览
                </button>
              )}
              {contextMenuMediaActionState.canCreateSubject && (
                <button
                  type="button"
                  className="linghuiContextMenuItem"
                  onClick={onCreateSubjectFromNode}
                >
                  创建主体
                </button>
              )}
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onFormatLayout}
              >
                优化工作流布局
              </button>
              {contextMenuMediaActionState.canExpandImages && (
                <button
                  type="button"
                  className="linghuiContextMenuItem"
                  onClick={onExpandCurrentNodeImages}
                >
                  展开所有图片
                </button>
              )}
              {contextMenuMediaActionState.canDeleteOtherImages && (
                <button
                  type="button"
                  className="linghuiContextMenuItem"
                  onClick={onDeleteOtherCurrentNodeImages}
                >
                  删除其他图片
                </button>
              )}
              {contextMenuMediaActionState.canExpandVideos && (
                <button
                  type="button"
                  className="linghuiContextMenuItem"
                  onClick={onExpandCurrentNodeVideos}
                >
                  展开所有视频
                </button>
              )}
              {contextMenuMediaActionState.canDeleteOtherVideos && (
                <button
                  type="button"
                  className="linghuiContextMenuItem"
                  onClick={onDeleteOtherCurrentNodeVideos}
                >
                  删除其他视频
                </button>
              )}
              <div className="linghuiContextMenuDivider" />
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onCopyNodeSelection}
                title="仅复制当前节点"
              >
                <span>复制节点</span>
                <span className="linghuiContextMenuShortcut">⌘C</span>
              </button>
              {contextMenuMediaActionState.canCopyPrimaryImage && (
                <button
                  type="button"
                  className="linghuiContextMenuItem"
                  onClick={onCopyPrimaryImageFromNode}
                >
                  复制图片
                </button>
              )}
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onDuplicateNodeSelection}
                title="复制当前所有参数，方便你尝试不同提示词和参考内容；请注意仅支持复制上游连线，下游连线需根据新需求手动连接。"
              >
                创建副本
              </button>
              <button
                type="button"
                className={`linghuiContextMenuItem ${hasClipboardData ? '' : 'isDisabled'}`}
                onClick={onPasteNearNode}
                disabled={!hasClipboardData}
              >
                <span>粘贴</span>
                <span className="linghuiContextMenuShortcut">⌘V</span>
              </button>
              <button
                type="button"
                className="linghuiContextMenuItem isDanger"
                onClick={onDeleteCurrentNode}
              >
                <span>删除</span>
                <span className="linghuiContextMenuShortcut">⌘⌫</span>
              </button>
              <div className="linghuiContextMenuDivider" />
              <button
                type="button"
                className={`linghuiContextMenuItem ${contextMenuResultCopyState.canCopyMedia ? '' : 'isDisabled'}`}
                disabled={!contextMenuResultCopyState.canCopyMedia}
                onClick={() => onCopyCurrentNodeResult('media')}
              >
                复制到剪贴板
              </button>
              {contextMenuResultCopyState.canCopyTaskId && (
                <button
                  type="button"
                  className="linghuiContextMenuItem"
                  onClick={() => onCopyCurrentNodeResult('taskId')}
                >
                  复制 TaskId
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="linghuiContextMenuItem isPrimary"
                onClick={onRunCurrentGroup}
              >
                运行工作流块
              </button>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onCopyNodeSelection}
              >
                复制
              </button>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onDuplicateNodeSelection}
              >
                创建副本
              </button>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onExportCurrentSelection}
              >
                导出工作流块结果
              </button>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onSaveCurrentGroupAsWorkflow}
              >
                保存为工作流
              </button>
              <div className="linghuiContextMenuHint">双击工作流块标题可直接重命名</div>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onUngroupCurrentGroup}
              >
                取消工作流块
              </button>
              <button
                type="button"
                className="linghuiContextMenuItem isDanger"
                onClick={onDeleteCurrentGroup}
              >
                删除工作流块
              </button>
            </>
          )}
        </>
      )}

      {contextMenu.kind === 'edge' && (
        <>
          <div className="linghuiContextMenuHeader">连线操作</div>
          <div className="linghuiContextMenuHint">右键选中的连线可直接删除，方便清理错误连接。</div>
          <button
            type="button"
            className="linghuiContextMenuItem isDanger"
            onClick={onDeleteCurrentEdge}
          >
            删除连线
          </button>
        </>
      )}

      {contextMenu.kind !== 'node' && contextMenu.kind !== 'edge' && (
        // ============================================================
        // LibTV 空白画布右键菜单 1:1 复刻（来源：libtv 打包 chunk 0gg5ir~xd-ho3.js）
        // 顺序（共 7 项）：
        //   上传
        //   保存到我的素材 (disabled)
        //   添加节点
        //   ─
        //   撤销 (⌘Z)
        //   重做 (⇧⌘Z)
        //   ─
        //   粘贴 (⌘V)
        // 灵绘历史菜单的"运行全部/运行选中/4 大节点分类目录平铺/单独的上传视频/上传音频/快捷键/批量导出/保存为工作流/复制选中/为选中创建副本/删除选中"
        // 在 LibTV 空白菜单里都不存在；这些功能都搬到画布 HUD 顶部工具栏或快捷键。
        // selection 场景下 LibTV 仍使用相同的简版菜单，复杂选区操作走快捷键 (⌘Backspace 删除选中 / ⌘C 复制 / ⌘D 副本)。
        // ============================================================
        <>
          <button
            type="button"
            className="linghuiContextMenuItem"
            onClick={onUploadImages}
          >
            上传
          </button>
          <button
            type="button"
            className="linghuiContextMenuItem isDisabled"
            disabled
            onClick={onUploadImages}
          >
            保存到我的素材
          </button>
          <button
            type="button"
            className="linghuiContextMenuItem"
            onClick={onOpenAddNodePanel}
          >
            添加节点
          </button>
          <div className="linghuiContextMenuDivider" />
          <button
            type="button"
            className={`linghuiContextMenuItem ${canUndo ? '' : 'isDisabled'}`}
            disabled={!canUndo}
            onClick={onUndo}
          >
            <span>撤销</span>
            <span className="linghuiContextMenuShortcut">⌘Z</span>
          </button>
          <button
            type="button"
            className={`linghuiContextMenuItem ${canRedo ? '' : 'isDisabled'}`}
            disabled={!canRedo}
            onClick={onRedo}
          >
            <span>重做</span>
            <span className="linghuiContextMenuShortcut">⇧⌘Z</span>
          </button>
          <div className="linghuiContextMenuDivider" />
          <button
            type="button"
            className={`linghuiContextMenuItem ${hasClipboardData ? '' : 'isDisabled'}`}
            disabled={!hasClipboardData}
            onClick={onPaste}
          >
            <span>粘贴</span>
            <span className="linghuiContextMenuShortcut">⌘V</span>
          </button>
        </>
      )}
    </div>
  );
};
