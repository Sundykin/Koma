/**
 * Director3D 节点卡片（画布上紧凑展示）。
 *
 * 不在卡片里跑 3D（开销大），只显示：
 *   - 标签
 *   - 角色数量、相机 FOV、背景模式 等摘要
 *   - 最近导出的 lineart 缩略（如果有）
 *
 * 完整的 3D 视口在节点编辑器里挂（Director3DNodeEditor）。
 */
import React, { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Camera, Image as ImageIcon, Users } from 'lucide-react';
import type {
  LinghuiDirector3DNodeProperties,
  LinghuiNodeData,
  LinghuiRunStatus,
} from '../../../../types/linghui';
import {
  useLinghuiNodeEditorVisibility,
  useLinghuiNodeInteraction,
  useNodeRunState,
} from '../state/LinghuiNodeRunsContext';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { LinghuiNodePorts } from './LinghuiNodeHandle';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import { resolveDefaultCompactNodeStyle } from '../state/linghuiNodeCardSizing';
import { cssVars } from '../../../../theme/runtime';
import { LinghuiNodeRunError } from './LinghuiNodeRunError';
import { createDefaultDirector3DScene } from '../../director3d/director3dScene';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: 'var(--token-text-muted)',
  running: 'var(--token-status-info)',
  succeeded: 'var(--token-status-success)',
  failed: 'var(--token-status-error)',
  stale: 'var(--token-status-warning)',
};

function Director3DNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as Partial<LinghuiDirector3DNodeProperties> & { lineartDataUrl?: string };
  const scene = props.scene ?? createDefaultDirector3DScene();
  const lineartDataUrl = props.lineartDataUrl;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/director3d');

  const nodeStyle = cssVars({
    ...resolveDefaultCompactNodeStyle({ thumbHeight: 168, minHeight: 286 }),
    '--linghui-node-border': status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'var(--token-border-base)'),
    '--linghui-accent': nodeData.accent,
    '--linghui-progress': `${runState?.progress ?? 0}%`,
  });

  return (
    <div
      className={`linghuiCompactNode nopan ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''}`}
      data-view-mode={viewMode}
      style={nodeStyle}
      {...interactionHandlers}
    >
      <LinghuiNodePorts accent={nodeData.accent} inputs={nodeData.inputs} outputs={nodeData.outputs} />

      <div className="linghuiCompactThumb linghuiDirector3DCompactThumb">
        {lineartDataUrl ? (
          <img src={lineartDataUrl} alt="lineart" draggable={false} />
        ) : (
          <div className="linghuiDirector3DCompactPlaceholder">
            <Camera size={28} />
            <span>3D 导演工作台</span>
          </div>
        )}
      </div>

      <div className="linghuiCompactInfo">
        <EditableCompactNodeLabel nodeId={id} label={nodeData.label} fallbackLabel="3D 导演" />
        <div className="linghuiDirector3DCompactStats">
          <span><Users size={11} /> {scene.actors.length} 人</span>
          <span><Camera size={11} /> {Math.round(scene.camera.fov)}° · {scene.camera.aspectRatio}</span>
          <span><ImageIcon size={11} /> {scene.background.mode === 'panorama' ? '全景' : scene.background.mode === 'image-plane' ? '图片' : scene.background.mode === 'color' ? '纯色' : '空'}</span>
        </div>
        <LinghuiNodeRunError runState={runState} />
        {status === 'running' && (
          <div className="linghuiCompactProgress">
            <div className="linghuiCompactProgressBar" />
          </div>
        )}
      </div>

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/director3d" /> : null}
    </div>
  );
}

export const Director3DNode = memo(Director3DNodeInner);
