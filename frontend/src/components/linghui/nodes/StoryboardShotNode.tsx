import React, { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { LinghuiNodeData } from '../../../types/linghui';
import { LinghuiNodeShell } from './LinghuiNodeShell';
import { NodeTextarea } from './NodePropertyEditor';
import { NodeResultPreview } from './NodeResultPreview';

function StoryboardShotNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;

  return (
    <LinghuiNodeShell nodeId={id} data={nodeData} selected={!!selected}>
      {selected && (
        <NodeTextarea
          nodeId={id}
          property="description"
          label="分镜描述"
          placeholder="直接描述画面、动作与节奏"
          height={132}
          value={String(nodeData.properties.description ?? '')}
        />
      )}
      <NodeResultPreview nodeId={id} expanded={!!selected} />
    </LinghuiNodeShell>
  );
}

export const StoryboardShotNode = memo(StoryboardShotNodeInner);
