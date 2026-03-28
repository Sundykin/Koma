import React from 'react';
import type {
  LinghuiExecutionLogEntry,
  LinghuiNodeCatalogItem,
  LinghuiNodeType,
} from '../../types/linghui';
import type { LinghuiCanvasMenuState } from './linghuiCanvasShared';

interface LinghuiCanvasContextMenuProps {
  contextMenu: LinghuiCanvasMenuState | null;
  contextMenuNodeIsGroup: boolean;
  contextMenuSelectionIds: string[];
  nodeCatalog: LinghuiNodeCatalogItem[];
  recentLogs: LinghuiExecutionLogEntry[];
  hasClipboardData: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onAddNode: (type: LinghuiNodeType) => void;
  onCopyNodeSelection: () => void;
  onDuplicateNodeSelection: () => void;
  onOpenDownstreamQuickCreate: () => void;
  onCreateAssetFromNode: () => void;
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
  onOpenDrawer: (drawer: 'add' | 'workflow' | 'asset' | 'history' | 'tutorial') => void;
}

export const LinghuiCanvasContextMenu: React.FC<LinghuiCanvasContextMenuProps> = ({
  contextMenu,
  contextMenuNodeIsGroup,
  contextMenuSelectionIds,
  nodeCatalog,
  recentLogs,
  hasClipboardData,
  canUndo,
  canRedo,
  onAddNode,
  onCopyNodeSelection,
  onDuplicateNodeSelection,
  onOpenDownstreamQuickCreate,
  onCreateAssetFromNode,
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
  onOpenDrawer,
}) => {
  if (!contextMenu) return null;

  return (
    <div
      className="linghuiContextMenu nopan nowheel"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {contextMenu.kind === 'node' && (
        <>
          <div className="linghuiContextMenuHeader">
            {contextMenuNodeIsGroup ? '工作流块操作' : '节点操作'}
          </div>
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
          {!contextMenuNodeIsGroup ? (
            <>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onOpenDownstreamQuickCreate}
              >
                继续创建下游
              </button>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onCreateAssetFromNode}
              >
                创建资产
              </button>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onRunCurrentNode}
              >
                运行当前节点
              </button>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onExportCurrentSelection}
              >
                导出当前结果
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onRunCurrentGroup}
              >
                运行工作流块
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
          <button
            type="button"
            className={`linghuiContextMenuItem ${hasClipboardData ? '' : 'isDisabled'}`}
            onClick={onPasteNearNode}
          >
            粘贴到附近
          </button>
          {!contextMenuNodeIsGroup && (
            <button
              type="button"
              className="linghuiContextMenuItem isDanger"
              onClick={onDeleteCurrentNode}
            >
              删除节点
            </button>
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
        <>
          <div className="linghuiContextMenuHeader">添加节点</div>
          {(['creation', 'storyboard'] as const).map(category => (
            <div key={category} className="linghuiContextMenuSection">
              <div className="linghuiContextMenuSectionTitle">
                {category === 'creation' ? '创作节点' : '分镜节点'}
              </div>
              {nodeCatalog.filter(item => item.category === category).map(item => (
                <button
                  key={item.type}
                  type="button"
                  className="linghuiContextMenuItem"
                  onClick={() => onAddNode(item.type)}
                >
                  <span className="linghuiContextMenuDot" style={{ background: item.accent }} />
                  {item.label}
                </button>
              ))}
            </div>
          ))}
          <div className="linghuiContextMenuDivider" />
          <div className="linghuiContextMenuHeader">运行与操作</div>
          <button
            type="button"
            className="linghuiContextMenuItem"
            onClick={onUploadImages}
          >
            上传图片到画布
          </button>
          <button
            type="button"
            className="linghuiContextMenuItem"
            onClick={onUploadVideos}
          >
            上传视频到画布
          </button>
          <button
            type="button"
            className="linghuiContextMenuItem"
            onClick={onUploadAudios}
          >
            上传音频到画布
          </button>
          <button
            type="button"
            className={`linghuiContextMenuItem ${hasClipboardData ? '' : 'isDisabled'}`}
            onClick={onPaste}
          >
            粘贴
          </button>
          <button
            type="button"
            className={`linghuiContextMenuItem ${canUndo ? '' : 'isDisabled'}`}
            onClick={onUndo}
          >
            撤销
          </button>
          <button
            type="button"
            className={`linghuiContextMenuItem ${canRedo ? '' : 'isDisabled'}`}
            onClick={onRedo}
          >
            重做
          </button>
          <button
            type="button"
            className="linghuiContextMenuItem"
            onClick={onRunAll}
          >
            运行全部
          </button>
          <button
            type="button"
            className={`linghuiContextMenuItem ${contextMenuSelectionIds.length ? '' : 'isDisabled'}`}
            onClick={onRunSelection}
          >
            运行选中
          </button>
          {contextMenu.kind === 'selection' && (
            <button
              type="button"
              className={`linghuiContextMenuItem ${contextMenuSelectionIds.length ? '' : 'isDisabled'}`}
              onClick={onExportSelection}
            >
              批量导出选中结果
            </button>
          )}
          {contextMenu.kind === 'selection' && (
            <>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onSaveSelectionAsWorkflow}
              >
                保存为工作流
              </button>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onCopySelection}
              >
                复制选中
              </button>
              <button
                type="button"
                className="linghuiContextMenuItem"
                onClick={onDuplicateSelection}
              >
                为选中创建副本
              </button>
            </>
          )}
          {contextMenuSelectionIds.length > 0 && (
            <button
              type="button"
              className="linghuiContextMenuItem isDanger"
              onClick={onDeleteSelection}
            >
              删除选中
            </button>
          )}
          <div className="linghuiContextMenuDivider" />
          <div className="linghuiContextMenuHeader">抽屉入口</div>
          <button
            type="button"
            className="linghuiContextMenuItem"
            onClick={() => onOpenDrawer('add')}
          >
            打开添加抽屉
          </button>
          <button
            type="button"
            className="linghuiContextMenuItem"
            onClick={() => onOpenDrawer('workflow')}
          >
            打开工作流抽屉
          </button>
          <button
            type="button"
            className="linghuiContextMenuItem"
            onClick={() => onOpenDrawer('asset')}
          >
            打开资产抽屉
          </button>
          <button
            type="button"
            className="linghuiContextMenuItem"
            onClick={() => onOpenDrawer('history')}
          >
            打开历史抽屉
          </button>
          <button
            type="button"
            className="linghuiContextMenuItem"
            onClick={() => onOpenDrawer('tutorial')}
          >
            打开教程抽屉
          </button>
          <div className="linghuiContextMenuDivider" />
          <div className="linghuiContextMenuHeader">最近日志</div>
          {recentLogs.length ? (
            <div className="linghuiContextMenuLogs">
              {recentLogs.map(entry => (
                <div key={entry.id} className={`linghuiContextMenuLogItem linghuiLog-${entry.level}`}>
                  <span className="linghuiContextMenuLogTime">
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </span>
                  <span className="linghuiContextMenuLogMessage">{entry.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="linghuiContextMenuEmpty">暂无执行日志</div>
          )}
        </>
      )}
    </div>
  );
};
