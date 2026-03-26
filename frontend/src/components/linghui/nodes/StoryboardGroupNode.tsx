import React, { memo, useEffect } from 'react';
import { Handle, Position, useEdges, type NodeProps } from '@xyflow/react';
import type { LinghuiNodeData, LinghuiRunStatus } from '../../../types/linghui';
import { useLinghuiNodeInteraction, useLinghuiNodeMutation, useNodeRunState } from './LinghuiNodeRunsContext';
import { NodeTextInput, NodeTextarea } from './NodePropertyEditor';
import { NodeResultPreview } from './NodeResultPreview';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: '#64748b',
  running: '#3b82f6',
  succeeded: '#22c55e',
  failed: '#ef4444',
  stale: '#f97316',
};

function getStatusMeta(status?: LinghuiRunStatus, progress?: number) {
  switch (status) {
    case 'running':
      return { label: progress != null ? `执行中 ${Math.round(progress)}%` : '执行中', className: 'is-running' };
    case 'succeeded':
      return { label: '已完成', className: 'is-success' };
    case 'failed':
      return { label: '失败', className: 'is-error' };
    case 'stale':
      return { label: '待重跑', className: 'is-warning' };
    default:
      return { label: '未运行', className: 'is-idle' };
  }
}

function StoryboardGroupNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const { updateNodeData } = useLinghuiNodeMutation();
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const edges = useEdges();
  const runState = useNodeRunState(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const statusMeta = getStatusMeta(status, runState?.progress);
  const borderColor = status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'rgba(63, 63, 70, 0.9)');

  // Dynamic inputs: ensure there's always one trailing unconnected shot input
  useEffect(() => {
    const connectedInputHandles = new Set(
      edges.filter(e => e.target === id).map(e => e.targetHandle),
    );

    const currentInputs = nodeData.inputs;
    const hasEmptyInput = currentInputs.some(
      (input, index) => input.dataType === 'shot' && !connectedInputHandles.has(`input-${index}`),
    );

    if (!hasEmptyInput) {
      const nextInputs = [
        ...currentInputs,
        { name: `分镜 ${currentInputs.length + 1}`, dataType: 'shot' as const },
      ];
      updateNodeData(id, prev => ({ ...prev, inputs: nextInputs }), { markStale: false });
    }
  }, [edges, id, nodeData.inputs, updateNodeData]);

  return (
    <div
      className={`linghuiRFNode nopan ${selected ? 'isSelected' : ''}`}
      style={{
        background: nodeData.background,
        borderColor,
        boxShadow: status === 'running'
          ? `0 0 16px ${statusColor}40`
          : selected
            ? `0 0 12px ${nodeData.accent}30`
            : undefined,
      }}
      {...interactionHandlers}
    >
      <div className="linghuiRFNodeHeader">
        <span className="linghuiRFNodeAccent" style={{ background: nodeData.accent }} />
        <span className="linghuiRFNodeTitle">{nodeData.label}</span>
        <span className={`linghuiNodeStatusBadge ${statusMeta.className}`}>
          {statusMeta.label}
        </span>
      </div>

      {status === 'running' && (
        <div className="linghuiRunProgress">
          <div
            className="linghuiRunProgressBar"
            style={{ width: `${Math.round(runState?.progress ?? 0)}%` }}
          />
        </div>
      )}

      {/* Dynamic input handles for shots */}
      {nodeData.inputs.map((slot, index) => (
        <Handle
          key={`input-${index}`}
          type="target"
          position={Position.Left}
          id={`input-${index}`}
          style={{
            top: `${52 + index * 28}px`,
            background: nodeData.accent,
            width: 10,
            height: 10,
            border: '2px solid #0f1720',
          }}
          title={slot.name}
        />
      ))}

      {/* Output handle */}
      {nodeData.outputs.map((slot, index) => (
        <Handle
          key={`output-${index}`}
          type="source"
          position={Position.Right}
          id={`output-${index}`}
          style={{
            top: '52px',
            background: nodeData.accent,
            width: 10,
            height: 10,
            border: '2px solid #0f1720',
          }}
          title={slot.name}
        />
      ))}

      <div className="linghuiRFNodeBody">
        {/* Slot labels */}
        <div className="linghuiRFSlotLabels">
          {nodeData.inputs.map((slot, index) => (
            <div key={index} className="linghuiRFSlotLabel linghuiRFSlotLabelLeft">
              {slot.name}
            </div>
          ))}
        </div>

        {selected && (
          <>
            <NodeTextInput
              nodeId={id}
              property="title"
              label="分镜组名称"
              placeholder="给这一组镜头命名"
              value={String(nodeData.properties.title ?? '')}
            />
            <NodeTextarea
              nodeId={id}
              property="notes"
              label="备注"
              placeholder="写下镜头组说明或导演提示"
              height={96}
              value={String(nodeData.properties.notes ?? '')}
            />
          </>
        )}
        <NodeResultPreview nodeId={id} expanded={!!selected} />
      </div>
    </div>
  );
}

export const StoryboardGroupNode = memo(StoryboardGroupNodeInner);
