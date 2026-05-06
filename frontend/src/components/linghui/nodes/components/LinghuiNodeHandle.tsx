import React from 'react';
import { Handle, Position, type HandleProps } from '@xyflow/react';
import type { LinghuiSlotDataType } from '../../../../types/linghui';
import { cssVars } from '../../../../theme/runtime';

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

export default LinghuiNodeHandle;
