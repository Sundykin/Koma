import React from 'react';
import { Button, Select, Tag, Tooltip } from 'antd';
import { Download, FolderOpen, Focus, Play, Plus, Save, Shapes, Zap } from 'lucide-react';
import type { LinghuiWorkspaceMeta } from '../../types/linghui';

interface LinghuiToolbarProps {
  workspaces: LinghuiWorkspaceMeta[];
  activeWorkspaceId: string | null;
  saving: boolean;
  running: boolean;
  onCreateWorkspace: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSave: () => void;
  onExport: () => void;
  onRunAll: () => void;
  onRunSelection: () => void;
  onCreateGroup: () => void;
  onFocusContent: () => void;
}

export const LinghuiToolbar: React.FC<LinghuiToolbarProps> = ({
  workspaces,
  activeWorkspaceId,
  saving,
  running,
  onCreateWorkspace,
  onSelectWorkspace,
  onSave,
  onExport,
  onRunAll,
  onRunSelection,
  onCreateGroup,
  onFocusContent,
}) => {
  return (
    <div className="linghuiToolbar">
      <div className="linghuiToolbarLeft">
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
        <Button icon={<Save size={16} />} onClick={onSave}>
          保存
        </Button>
        <Button icon={<Download size={16} />} onClick={onExport}>
          导出
        </Button>
      </div>

      <div className="linghuiToolbarRight">
        <Button type="primary" icon={<Play size={16} />} loading={running} onClick={onRunAll}>
          运行全部
        </Button>
        <Button icon={<Zap size={16} />} disabled={running} onClick={onRunSelection}>
          运行选中
        </Button>
        <Button icon={<Shapes size={16} />} onClick={onCreateGroup}>
          创建分组
        </Button>
        <Button icon={<Focus size={16} />} onClick={onFocusContent}>
          适配内容
        </Button>
        <Tag color={saving ? 'processing' : 'success'}>
          {saving ? '保存中' : '自动保存已开启'}
        </Tag>
      </div>
    </div>
  );
};

export default LinghuiToolbar;
