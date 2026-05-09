import React from 'react';
import { Handle, Position, type HandleProps } from '@xyflow/react';
import type { LinghuiSlotDataType, LinghuiSlotDef } from '../../../../types/linghui';
import { cssVars } from '../../../../theme/runtime';

export const LINGHUI_UNIFIED_INPUT_HANDLE_ID = 'input-0';
export const LINGHUI_UNIFIED_OUTPUT_HANDLE_ID = 'output-0';

interface LinghuiNodeHandleProps {
  type: HandleProps['type'];
  id: string;
  position: Position;
  dataType?: LinghuiSlotDataType;
  accent: string;
  top?: string;
  title?: string;
}

export function resolveLinghuiHandleColor(dataType: LinghuiSlotDataType | undefined, accent: string): string {
  switch (dataType) {
    case 'text':
      return 'var(--token-status-warning)';
    case 'video':
      return 'var(--token-status-info)';
    case 'audio':
      return 'var(--token-status-warning)';
    default:
      return accent;
  }
}

export const LinghuiNodeHandle: React.FC<LinghuiNodeHandleProps> = ({
  type,
  id,
  position,
  dataType,
  accent,
  top,
  title,
}) => {
  const style = cssVars({
    '--linghui-handle-bg': resolveLinghuiHandleColor(dataType, accent),
    '--linghui-handle-top': top ?? '50%',
  });

  return (
    <Handle
      type={type}
      position={position}
      id={id}
      className="linghuiNodeMagnetHandle"
      style={style}
      title={title}
      isConnectable
    />
  );
};

function summarizeSlots(slots: LinghuiSlotDef[], fallback: string): string {
  const labels = slots.map(slot => slot.name).filter(Boolean);
  return labels.length > 0 ? labels.join(' / ') : fallback;
}

export const LinghuiNodePorts: React.FC<{
  accent: string;
  inputs: LinghuiSlotDef[];
  outputs: LinghuiSlotDef[];
}> = ({ accent, inputs, outputs }) => (
  <>
    {inputs.length > 0 ? (
      <LinghuiNodeHandle
        type="target"
        position={Position.Left}
        id={LINGHUI_UNIFIED_INPUT_HANDLE_ID}
        accent={accent}
        title={`输入：接收所有上游结果，节点会自动过滤 ${summarizeSlots(inputs, '需要的数据')}`}
      />
    ) : null}
    {outputs.length > 0 ? (
      <LinghuiNodeHandle
        type="source"
        position={Position.Right}
        id={LINGHUI_UNIFIED_OUTPUT_HANDLE_ID}
        accent={accent}
        title={`输出：${summarizeSlots(outputs, '节点结果')}`}
      />
    ) : null}
  </>
);

export default LinghuiNodeHandle;
