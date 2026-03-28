import React from 'react';
import { Tag } from 'antd';
import type { LinghuiGraphStats, LinghuiCanvasSelection } from '../../types/linghui';
import { LINGHUI_WORKFLOW_BLOCK_LABEL } from '../../constants/linghuiWorkflowBlock';

interface LinghuiStatusBarProps {
  workspaceCount: number;
  stats: LinghuiGraphStats;
  selection: LinghuiCanvasSelection;
  saving: boolean;
  running: boolean;
  runSummary: {
    running: number;
    succeeded: number;
    failed: number;
    stale: number;
  };
  lastSavedAt: number | null;
}

function getSelectionLabel(selection: LinghuiCanvasSelection): string {
  if (!selection) return '未选中';
  if (selection.kind === 'group') return `${LINGHUI_WORKFLOW_BLOCK_LABEL} · ${selection.label}`;
  return `节点 · ${selection.label}`;
}

export const LinghuiStatusBar: React.FC<LinghuiStatusBarProps> = ({
  workspaceCount,
  stats,
  selection,
  saving,
  running,
  runSummary,
  lastSavedAt,
}) => {
  return (
    <div className="linghuiStatusBar">
      <div className="linghuiStatusItems">
        <span>工作区 {workspaceCount}</span>
        <span>节点 {stats.nodeCount}</span>
        <span>{LINGHUI_WORKFLOW_BLOCK_LABEL} {stats.groupCount}</span>
        <span>连线 {stats.linkCount}</span>
        <span>{getSelectionLabel(selection)}</span>
        <span>运行中 {runSummary.running}</span>
        <span>成功 {runSummary.succeeded}</span>
        <span>失败 {runSummary.failed}</span>
        <span>待重跑 {runSummary.stale}</span>
      </div>

      <div className="linghuiStatusItems">
        <Tag color={running ? 'processing' : 'default'}>
          {running ? '执行中' : '待命'}
        </Tag>
        <Tag color={saving ? 'processing' : 'success'}>
          {saving ? '保存中' : '已同步'}
        </Tag>
        <span>{lastSavedAt ? `最近保存 ${new Date(lastSavedAt).toLocaleTimeString()}` : '尚未保存'}</span>
      </div>
    </div>
  );
};

export default LinghuiStatusBar;
