import React, { useState } from 'react';
import { Input } from 'antd';
import type {
  LinghuiExecutionLogEntry,
  LinghuiGraphStats,
  LinghuiNodeRunState,
  LinghuiWorkspaceDocument,
} from '../../types/linghui';

interface LinghuiPropertiesPanelProps {
  workspace: LinghuiWorkspaceDocument | null;
  executionLogs: LinghuiExecutionLogEntry[];
  stats: LinghuiGraphStats;
  saving: boolean;
  running: boolean;
  lastSavedAt: number | null;
  runSummary: {
    running: number;
    succeeded: number;
    failed: number;
    stale: number;
  };
  onWorkspaceRename: (name: string) => void;
}

export const LinghuiPropertiesPanel: React.FC<LinghuiPropertiesPanelProps> = ({
  workspace,
  executionLogs,
  stats,
  saving,
  running,
  lastSavedAt,
  runSummary,
  onWorkspaceRename,
}) => {
  const recentLogs = executionLogs.slice(-8).reverse();
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false);
  const [logsCollapsed, setLogsCollapsed] = useState(false);

  return (
    <>
      <section className={`linghuiFloatingPanel linghuiWorkspacePanel ${workspaceCollapsed ? 'isCollapsed' : ''}`}>
        <div className="linghuiFloatingPanelHeader">
          <div>
            <div className="linghuiInspectorTitle">画布信息</div>
            <div className="linghuiSelectionSubtitle">工作区与执行状态</div>
          </div>
          <button
            type="button"
            className="linghuiFloatingToggle"
            onClick={() => setWorkspaceCollapsed(value => !value)}
          >
            {workspaceCollapsed ? '展开' : '收起'}
          </button>
        </div>

        {!workspaceCollapsed && (
          <div className="linghuiFloatingPanelBody">
            <label className="linghuiField">
              <span className="linghuiFieldLabel">名称</span>
              <Input
                size="small"
                value={workspace?.name ?? ''}
                onChange={event => onWorkspaceRename(event.target.value)}
              />
            </label>

            <div className="linghuiInfoGrid">
              <div>
                <div className="linghuiInfoLabel">节点</div>
                <div className="linghuiInfoValue">{workspace?.nodeCount ?? stats.nodeCount}</div>
              </div>
              <div>
                <div className="linghuiInfoLabel">工作流块</div>
                <div className="linghuiInfoValue">{workspace?.groupCount ?? stats.groupCount}</div>
              </div>
              <div>
                <div className="linghuiInfoLabel">连线</div>
                <div className="linghuiInfoValue">{workspace?.linkCount ?? stats.linkCount}</div>
              </div>
              <div>
                <div className="linghuiInfoLabel">最近保存</div>
                <div className="linghuiInfoValue">{lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : '尚未保存'}</div>
              </div>
            </div>

            <div className="linghuiInspectorDivider" />
            <div className="linghuiInfoGrid">
              <div>
                <div className="linghuiInfoLabel">执行状态</div>
                <div className="linghuiInfoValue">{running ? '执行中' : '待命'}</div>
              </div>
              <div>
                <div className="linghuiInfoLabel">同步状态</div>
                <div className="linghuiInfoValue">{saving ? '保存中' : '已同步'}</div>
              </div>
              <div>
                <div className="linghuiInfoLabel">运行中</div>
                <div className="linghuiInfoValue">{runSummary.running}</div>
              </div>
              <div>
                <div className="linghuiInfoLabel">已完成</div>
                <div className="linghuiInfoValue">{runSummary.succeeded}</div>
              </div>
              <div>
                <div className="linghuiInfoLabel">失败</div>
                <div className="linghuiInfoValue">{runSummary.failed}</div>
              </div>
              <div>
                <div className="linghuiInfoLabel">待重跑</div>
                <div className="linghuiInfoValue">{runSummary.stale}</div>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className={`linghuiFloatingPanel linghuiLogsPanel ${logsCollapsed ? 'isCollapsed' : ''}`}>
        <div className="linghuiFloatingPanelHeader">
          <div>
            <div className="linghuiInspectorTitle">执行日志</div>
            <div className="linghuiSelectionSubtitle">最近 8 条运行记录</div>
          </div>
          <button
            type="button"
            className="linghuiFloatingToggle"
            onClick={() => setLogsCollapsed(value => !value)}
          >
            {logsCollapsed ? '展开' : '收起'}
          </button>
        </div>

        {!logsCollapsed && (
          <div className="linghuiFloatingPanelBody">
            {recentLogs.length === 0 && (
              <div className="linghuiEmptyInspector">暂无执行记录。</div>
            )}
            {recentLogs.map(entry => (
              <div key={entry.id} className={`linghuiLogEntry linghuiLog-${entry.level}`}>
                <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
};

export default LinghuiPropertiesPanel;
