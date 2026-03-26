import React from 'react';
import { Button, Input, Select, Tag, Tooltip } from 'antd';
import { ArrowLeft, Download, FolderOpen, Plus, Save } from 'lucide-react';
import type { LinghuiGraphStats, LinghuiWorkspaceMeta } from '../../types/linghui';

interface LinghuiToolbarProps {
  workspaces: LinghuiWorkspaceMeta[];
  activeWorkspaceId: string | null;
  workspaceName: string;
  stats: LinghuiGraphStats;
  lastSavedAt: number | null;
  saving: boolean;
  running: boolean;
  runSummary: {
    running: number;
    succeeded: number;
    failed: number;
    stale: number;
  };
  onExit?: () => void;
  onCreateWorkspace: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onWorkspaceRename: (name: string) => void;
  onSave: () => void;
  onExport: () => void;
}

export const LinghuiToolbar: React.FC<LinghuiToolbarProps> = ({
  workspaces,
  activeWorkspaceId,
  workspaceName,
  stats,
  lastSavedAt,
  saving,
  running,
  runSummary,
  onExit,
  onCreateWorkspace,
  onSelectWorkspace,
  onWorkspaceRename,
  onSave,
  onExport,
}) => {
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
      </div>

      <div className="linghuiToolbarRight">
        <span className="linghuiToolbarMeta">
          节点 {stats.nodeCount} · 连线 {stats.linkCount} · 分组 {stats.groupCount} · 运行中 {runSummary.running} · 失败 {runSummary.failed}
        </span>
        <Tag color={running ? 'processing' : 'default'}>
          {running ? '执行中' : '待命'}
        </Tag>
        <Tag color={saving ? 'processing' : 'success'}>
          {saving ? '保存中' : '自动保存'}
        </Tag>
        <span className="linghuiToolbarMeta">
          {lastSavedAt ? `最近保存 ${new Date(lastSavedAt).toLocaleTimeString()}` : '尚未保存'}
        </span>
      </div>
    </div>
  );
};

export default LinghuiToolbar;
