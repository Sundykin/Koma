import React from 'react';
import { Button, Input, Select, Tag, Tooltip } from 'antd';
import { ArrowLeft, BookOpen, Boxes, Download, FolderOpen, History, Library, Plus, Save } from 'lucide-react';
import type {
  LinghuiExecutionQueueState,
  LinghuiGraphStats,
  LinghuiWorkspaceMeta,
} from '../../types/linghui';
import { LINGHUI_WORKFLOW_BLOCK_LABEL } from '../../constants/linghuiWorkflowBlock';

interface LinghuiToolbarProps {
  workspaces: LinghuiWorkspaceMeta[];
  activeWorkspaceId: string | null;
  workspaceName: string;
  stats: LinghuiGraphStats;
  lastSavedAt: number | null;
  saving: boolean;
  running: boolean;
  executionQueue?: LinghuiExecutionQueueState | null;
  runSummary: {
    running: number;
    succeeded: number;
    failed: number;
    stale: number;
    queued: number;
    queueStatus: LinghuiExecutionQueueState['status'];
  };
  onExit?: () => void;
  onCreateWorkspace: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onWorkspaceRename: (name: string) => void;
  onSave: () => void;
  onExport: () => void;
  onRetryFailed?: () => void;
  onCancelRun?: () => void;
  activeDrawer: 'add' | 'workflow' | 'asset' | 'history' | 'tutorial' | null;
  onToggleDrawer: (drawer: 'add' | 'workflow' | 'asset' | 'history' | 'tutorial') => void;
}

export const LinghuiToolbar: React.FC<LinghuiToolbarProps> = ({
  workspaces,
  activeWorkspaceId,
  workspaceName,
  stats,
  lastSavedAt,
  saving,
  running,
  executionQueue,
  runSummary,
  onExit,
  onCreateWorkspace,
  onSelectWorkspace,
  onWorkspaceRename,
  onSave,
  onExport,
  onRetryFailed,
  onCancelRun,
  activeDrawer,
  onToggleDrawer,
}) => {
  const isCanceling = runSummary.queueStatus === 'canceling';
  const showQueueProgress = executionQueue != null && (executionQueue.status === 'running' || executionQueue.status === 'canceling');

  return (
    <div className="linghuiToolbar">
      <div className="linghuiToolbarLeft">
        {onExit && (
          <Button icon={<ArrowLeft size={16} />} onClick={onExit}>
            返回
          </Button>
        )}
        <Button type="primary" icon={<Plus size={16} />} onClick={onCreateWorkspace}>
          新建
        </Button>
        <Tooltip title="打开已有灵绘工作区">
          <Select
            className="linghuiWorkspaceSelect"
            placeholder="打开工作区"
            suffixIcon={<FolderOpen size={14} />}
            value={activeWorkspaceId ?? undefined}
            onChange={onSelectWorkspace}
            options={workspaces.map(workspace => ({
              value: workspace.id,
              label: workspace.name,
            }))}
          />
        </Tooltip>
        <Input
          className="linghuiToolbarNameInput"
          value={workspaceName}
          onChange={event => onWorkspaceRename(event.target.value)}
          placeholder="工作区名称"
        />
        <Button icon={<Save size={16} />} onClick={onSave}>
          保存
        </Button>
        <Button icon={<Download size={16} />} onClick={onExport}>
          导出
        </Button>
        <div className="linghuiToolbarDrawerGroup">
          <Button
            size="small"
            type={activeDrawer === 'add' ? 'primary' : 'default'}
            onClick={() => onToggleDrawer('add')}
          >
            添加
          </Button>
          <Button
            size="small"
            icon={<Boxes size={14} />}
            type={activeDrawer === 'workflow' ? 'primary' : 'default'}
            onClick={() => onToggleDrawer('workflow')}
          >
            工作流
          </Button>
          <Button
            size="small"
            icon={<Library size={14} />}
            type={activeDrawer === 'asset' ? 'primary' : 'default'}
            onClick={() => onToggleDrawer('asset')}
          >
            资产
          </Button>
          <Button
            size="small"
            icon={<History size={14} />}
            type={activeDrawer === 'history' ? 'primary' : 'default'}
            onClick={() => onToggleDrawer('history')}
          >
            历史
          </Button>
          <Button
            size="small"
            icon={<BookOpen size={14} />}
            type={activeDrawer === 'tutorial' ? 'primary' : 'default'}
            onClick={() => onToggleDrawer('tutorial')}
          >
            教程
          </Button>
        </div>
      </div>

      <div className="linghuiToolbarRight">
        <span className="linghuiToolbarMeta">
          节点 {stats.nodeCount} · 连线 {stats.linkCount} · {LINGHUI_WORKFLOW_BLOCK_LABEL} {stats.groupCount} · 排队 {runSummary.queued} · 运行中 {runSummary.running} · 失败 {runSummary.failed}
        </span>
        <Tag color={isCanceling ? 'warning' : running ? 'processing' : 'default'}>
          {isCanceling ? '取消中' : running ? '执行中' : '待命'}
        </Tag>
        {runSummary.failed > 0 && !running && onRetryFailed && (
          <Button size="small" danger onClick={onRetryFailed}>
            重试失败
          </Button>
        )}
        {running && onCancelRun && (
          <Button size="small" danger ghost disabled={isCanceling} onClick={onCancelRun}>
            {isCanceling ? '取消中' : '取消执行'}
          </Button>
        )}
        <Tag color={saving ? 'processing' : 'success'}>
          {saving ? '保存中' : '自动保存'}
        </Tag>
        <span className="linghuiToolbarMeta">
          {showQueueProgress
            ? `本轮队列 ${executionQueue.completedNodeIds.length}/${executionQueue.total}`
            : lastSavedAt
              ? `最近保存 ${new Date(lastSavedAt).toLocaleTimeString()}`
              : '尚未保存'}
        </span>
      </div>
    </div>
  );
};

export default LinghuiToolbar;
