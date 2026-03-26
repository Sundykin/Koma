import React, { memo, useEffect, useRef, useState } from 'react';
import { NodeResizer, type NodeProps, useReactFlow } from '@xyflow/react';
import type { LinghuiCanvasGroupData } from '../../../types/linghui';

function CanvasGroupNodeInner({ id, data, selected }: NodeProps) {
  const groupData = data as unknown as LinghuiCanvasGroupData;
  const reactFlow = useReactFlow();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(groupData.label ?? '分组');

  useEffect(() => {
    setDraftLabel(groupData.label ?? '分组');
  }, [groupData.label]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commitLabel = () => {
    const nextLabel = draftLabel.trim() || '分组';
    reactFlow.updateNodeData(id, { label: nextLabel });
    setEditing(false);
  };

  return (
    <div
      className={`linghuiCanvasGroup ${selected ? 'isSelected' : ''}`}
      style={{ ['--linghui-group-color' as string]: groupData.color ?? '#2563eb' }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={140}
        color={groupData.color ?? '#2563eb'}
        lineClassName="linghuiCanvasGroupResizeLine"
        handleClassName="linghuiCanvasGroupResizeHandle"
      />

      <div className="linghuiCanvasGroupHeader linghuiCanvasGroupDragHandle">
        {editing ? (
          <input
            ref={inputRef}
            value={draftLabel}
            className="linghuiCanvasGroupInput nodrag nopan"
            onChange={(event) => setDraftLabel(event.target.value)}
            onBlur={commitLabel}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitLabel();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraftLabel(groupData.label ?? '分组');
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="linghuiCanvasGroupTitleButton nodrag nopan"
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setEditing(true);
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {groupData.label ?? '分组'}
          </button>
        )}
      </div>
    </div>
  );
}

export const CanvasGroupNode = memo(CanvasGroupNodeInner);
