import React from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  CircleAlert,
  CircleCheck,
  Download,
  FolderOpen,
  History,
  Info,
  Library,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  Upload,
  Workflow,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  LinghuiExecutionLogEntry,
  LinghuiWorkspaceMeta,
} from '../../../../types/linghui';
import { DEFAULT_LINGHUI_WORKSPACE_NAME } from '../../../../types/linghui';
import type { LinghuiLibraryDrawerKey } from '../../library/components/LinghuiLibraryDrawer';

export const EXECUTION_LOG_ICON_BY_LEVEL: Record<LinghuiExecutionLogEntry['level'], LucideIcon> = {
  error: CircleAlert,
  warn: TriangleAlert,
  info: Info,
  success: CircleCheck,
};

interface LinghuiCanvasFloatingRailProps {
  railShellRef: React.RefObject<HTMLDivElement | null>;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  activeDrawer: LinghuiLibraryDrawerKey | null;
  activeWorkspaceName?: string;
  activeWorkspaceId?: string;
  executionLogCollapsed: boolean;
  executionLogErrorCount: number;
  executionLogItems: LinghuiExecutionLogEntry[];
  executionLogLatest?: LinghuiExecutionLogEntry;
  executionLogPanelOpen: boolean;
  lastSavedAt: number | null;
  projectPanelOpen: boolean;
  saving: boolean;
  workspaceLogCount: number;
  workspaceList: LinghuiWorkspaceMeta[];
  workspaceNameDraft: string;
  onCloseActiveDrawer: () => void;
  onCommitWorkspaceRename: (nextName?: string) => void;
  onCreateWorkspace: () => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onExit?: () => void;
  onExportWorkspace: (workspaceId?: string) => void;
  onFocusLogNode: (nodeId: string) => void;
  onImportWorkspace: () => void;
  onManualSave: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSetExecutionLogCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  onSetExecutionLogPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSetProjectPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSetWorkspaceNameDraft: React.Dispatch<React.SetStateAction<string>>;
  onToggleDrawer: (drawer: LinghuiLibraryDrawerKey) => void;
}

export const LinghuiCanvasFloatingRail: React.FC<LinghuiCanvasFloatingRailProps> = ({
  railShellRef,
  renameInputRef,
  activeDrawer,
  activeWorkspaceName,
  activeWorkspaceId,
  executionLogCollapsed,
  executionLogErrorCount,
  executionLogItems,
  executionLogLatest,
  executionLogPanelOpen,
  lastSavedAt,
  projectPanelOpen,
  saving,
  workspaceLogCount,
  workspaceList,
  workspaceNameDraft,
  onCloseActiveDrawer,
  onCommitWorkspaceRename,
  onCreateWorkspace,
  onDeleteWorkspace,
  onExit,
  onExportWorkspace,
  onFocusLogNode,
  onImportWorkspace,
  onManualSave,
  onSelectWorkspace,
  onSetExecutionLogCollapsed,
  onSetExecutionLogPanelOpen,
  onSetProjectPanelOpen,
  onSetWorkspaceNameDraft,
  onToggleDrawer,
}) => (
  <div
    ref={railShellRef}
    className={`linghuiCanvasRailShell ${projectPanelOpen ? 'isProjectPanelOpen' : ''}`}
  >
    <div className="linghuiCanvasRailGroup">
      {onExit ? (
        <button
          type="button"
          className="linghuiCanvasRailButton"
          onClick={onExit}
          title="返回上一页"
          aria-label="返回上一页"
        >
          <span className="linghuiCanvasRailIcon"><ArrowLeft size={16} /></span>
          <span className="linghuiCanvasRailLabel">返回</span>
        </button>
      ) : null}
      <button
        type="button"
        className={`linghuiCanvasRailButton ${projectPanelOpen ? 'isActive' : ''}`}
        onClick={() => {
          onSetProjectPanelOpen(current => !current);
          onSetExecutionLogPanelOpen(false);
          onCloseActiveDrawer();
        }}
        title="打开项目列表"
        aria-label="打开项目列表"
      >
        <span className="linghuiCanvasRailIcon"><FolderOpen size={16} /></span>
        <span className="linghuiCanvasRailLabel">项目列表</span>
      </button>
      <button
        type="button"
        className={`linghuiCanvasRailButton ${saving ? 'isActive' : ''}`}
        onClick={() => {
          onManualSave();
        }}
        title="保存当前项目"
        aria-label="保存当前项目"
        disabled={saving}
      >
        <span className="linghuiCanvasRailIcon"><Save size={16} /></span>
        <span className="linghuiCanvasRailLabel">{saving ? '保存中' : '保存'}</span>
      </button>
      <button
        type="button"
        className="linghuiCanvasRailButton"
        onClick={() => {
          onCreateWorkspace();
        }}
        title="创建新的灵绘项目"
        aria-label="创建新的灵绘项目"
      >
        <span className="linghuiCanvasRailIcon"><Plus size={16} /></span>
        <span className="linghuiCanvasRailLabel">新建</span>
      </button>
      <button
        type="button"
        className={`linghuiCanvasRailButton ${activeDrawer === 'workflow' ? 'isActive' : ''}`}
        onClick={() => onToggleDrawer('workflow')}
        title="打开工作流面板"
        aria-label="打开工作流面板"
      >
        <span className="linghuiCanvasRailIcon"><Workflow size={16} /></span>
        <span className="linghuiCanvasRailLabel">工作流</span>
      </button>
      <button
        type="button"
        className={`linghuiCanvasRailButton ${activeDrawer === 'asset' ? 'isActive' : ''}`}
        onClick={() => onToggleDrawer('asset')}
        title="打开资产面板"
        aria-label="打开资产面板"
      >
        <span className="linghuiCanvasRailIcon"><Library size={16} /></span>
        <span className="linghuiCanvasRailLabel">资产</span>
      </button>
      <button
        type="button"
        className={`linghuiCanvasRailButton ${activeDrawer === 'history' ? 'isActive' : ''}`}
        onClick={() => onToggleDrawer('history')}
        title="打开历史面板"
        aria-label="打开历史面板"
      >
        <span className="linghuiCanvasRailIcon"><History size={16} /></span>
        <span className="linghuiCanvasRailLabel">历史</span>
      </button>
      <button
        type="button"
        className={`linghuiCanvasRailButton ${executionLogPanelOpen ? 'isActive' : ''} ${executionLogErrorCount > 0 ? 'hasAlert' : ''}`}
        onClick={() => {
          onSetExecutionLogPanelOpen(current => !current);
          onSetProjectPanelOpen(false);
          onCloseActiveDrawer();
        }}
        title="打开执行日志"
        aria-label="打开执行日志"
      >
        <span className="linghuiCanvasRailIcon"><ClipboardList size={16} /></span>
        <span className="linghuiCanvasRailLabel">执行日志</span>
        {executionLogErrorCount > 0 ? (
          <span className="linghuiCanvasRailCount">{executionLogErrorCount}</span>
        ) : null}
      </button>
    </div>

    {projectPanelOpen ? (
      <div className="linghuiCanvasProjectPanel nopan nowheel">
        <div className="linghuiCanvasProjectPanelHeader">
          <div className="linghuiCanvasProjectPanelTitleBlock">
            <div className="linghuiCanvasProjectPanelTitle">项目列表</div>
            <div className="linghuiCanvasProjectPanelMeta">
              {workspaceList.length} 个项目
              {lastSavedAt ? ` · 最近保存 ${new Date(lastSavedAt).toLocaleTimeString()}` : ''}
            </div>
          </div>
          <div className="linghuiCanvasProjectPanelActions">
            <button
              type="button"
              className="linghuiCanvasProjectActionButton isIconOnly"
              onClick={() => {
                onImportWorkspace();
              }}
              title="导入灵绘项目"
              aria-label="导入灵绘项目"
            >
              <Upload size={14} />
            </button>
          </div>
        </div>

        <div className="linghuiCanvasProjectField">
          <label className="linghuiCanvasProjectFieldLabel" htmlFor="linghui-project-name">
            当前项目名称
          </label>
          <div className="linghuiCanvasProjectFieldRow">
            <input
              id="linghui-project-name"
              ref={renameInputRef}
              className="linghuiCanvasProjectNameInput"
              value={workspaceNameDraft}
              placeholder={DEFAULT_LINGHUI_WORKSPACE_NAME}
              onChange={event => onSetWorkspaceNameDraft(event.target.value)}
              onBlur={() => onCommitWorkspaceRename()}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onCommitWorkspaceRename();
                  event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                  onSetWorkspaceNameDraft(activeWorkspaceName ?? DEFAULT_LINGHUI_WORKSPACE_NAME);
                  event.currentTarget.blur();
                }
              }}
            />
            <button
              type="button"
              className="linghuiCanvasProjectActionButton isPrimary isIconOnly"
              onClick={() => {
                onManualSave();
              }}
              disabled={saving}
              title={saving ? '保存中' : '保存当前项目'}
              aria-label={saving ? '保存中' : '保存当前项目'}
            >
              <Save size={14} />
            </button>
          </div>
        </div>

        <div className="linghuiCanvasProjectList">
          {workspaceList.map(workspace => (
            <div
              key={workspace.id}
              role="button"
              tabIndex={0}
              className={`linghuiCanvasProjectItem ${workspace.id === activeWorkspaceId ? 'isActive' : ''}`}
              onClick={() => {
                onSelectWorkspace(workspace.id);
              }}
              onKeyDown={event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onSelectWorkspace(workspace.id);
              }}
            >
              <span className="linghuiCanvasProjectItemContent">
                <span className="linghuiCanvasProjectItemName">{workspace.name}</span>
                <span className="linghuiCanvasProjectItemMeta">
                  更新于 {new Date(workspace.updatedAt).toLocaleString()}
                </span>
              </span>
              <span className="linghuiCanvasProjectItemActions">
                <span
                  role="button"
                  tabIndex={0}
                  className="linghuiCanvasProjectItemAction"
                  onClick={event => {
                    event.stopPropagation();
                    onExportWorkspace(workspace.id);
                  }}
                  onKeyDown={event => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    onExportWorkspace(workspace.id);
                  }}
                  title="导出项目"
                  aria-label={`导出 ${workspace.name}`}
                >
                  <Download size={13} />
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className="linghuiCanvasProjectItemAction isDanger"
                  onClick={event => {
                    event.stopPropagation();
                    onDeleteWorkspace(workspace.id);
                  }}
                  onKeyDown={event => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    onDeleteWorkspace(workspace.id);
                  }}
                  title="删除项目"
                  aria-label={`删除 ${workspace.name}`}
                >
                  <Trash2 size={13} />
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    ) : null}

    {executionLogPanelOpen ? (
      <section className={`linghuiCanvasExecutionLogPanel nopan nowheel ${executionLogCollapsed ? 'isCollapsed' : ''}`}>
        <div className="linghuiCanvasExecutionLogPanelHeader">
          <div className="linghuiCanvasExecutionLogPanelTitleBlock">
            <div className="linghuiCanvasExecutionLogPanelTitle">执行日志</div>
            <div className="linghuiCanvasExecutionLogPanelMeta">
              {workspaceLogCount} 条记录
              {executionLogLatest ? ` · 最近 ${new Date(executionLogLatest.createdAt).toLocaleTimeString()}` : ''}
            </div>
          </div>
          <div className="linghuiCanvasExecutionLogPanelActions">
            <button
              type="button"
              className="linghuiCanvasProjectActionButton isIconOnly"
              onClick={() => onSetExecutionLogCollapsed(value => !value)}
              title={executionLogCollapsed ? '展开执行日志' : '收起执行日志'}
              aria-label={executionLogCollapsed ? '展开执行日志' : '收起执行日志'}
            >
              {executionLogCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
            <button
              type="button"
              className="linghuiCanvasProjectActionButton isIconOnly"
              onClick={() => onSetExecutionLogPanelOpen(false)}
              title="关闭执行日志"
              aria-label="关闭执行日志"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {!executionLogCollapsed ? (
          <div className="linghuiCanvasExecutionLogPanelBody">
            {executionLogItems.length === 0 ? (
              <div className="linghuiCanvasExecutionLogEmpty">暂无执行记录。</div>
            ) : (
              <div className="linghuiCanvasExecutionLogList">
                {executionLogItems.map(entry => {
                  const LevelIcon = EXECUTION_LOG_ICON_BY_LEVEL[entry.level] ?? Info;
                  const isFocusable = Boolean(entry.nodeId);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`linghuiCanvasExecutionLogItem is-${entry.level} ${isFocusable ? 'isFocusable' : ''}`}
                      disabled={!isFocusable}
                      onClick={() => {
                        if (entry.nodeId) {
                          onFocusLogNode(entry.nodeId);
                        }
                      }}
                      title={isFocusable ? '定位相关节点' : entry.message}
                    >
                      <span className="linghuiCanvasExecutionLogIcon">
                        <LevelIcon size={14} />
                      </span>
                      <span className="linghuiCanvasExecutionLogContent">
                        <span className="linghuiCanvasExecutionLogMessage">{entry.message}</span>
                        <span className="linghuiCanvasExecutionLogTime">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </section>
    ) : null}
  </div>
);
