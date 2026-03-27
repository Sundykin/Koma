import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { LinghuiCanvasGroupData } from '../../../types/linghui';
import { useLinghuiNodeMutation, useLinghuiNodeInteractionApi } from './LinghuiNodeRunsContext';

function CanvasGroupNodeInner({ id, data, selected }: NodeProps) {
  const groupData = data as unknown as LinghuiCanvasGroupData;
  const { updateNodeData } = useLinghuiNodeMutation();
  const { openNodeContextMenu } = useLinghuiNodeInteractionApi();
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

  const commitLabel = useCallback(() => {
    const nextLabel = draftLabel.trim() || '分组';
    updateNodeData(id, prev => ({
      ...prev,
      label: nextLabel,
    }), { markStale: false });
    setEditing(false);
  }, [draftLabel, id, updateNodeData]);

  const beginEditing = useCallback((event?: React.SyntheticEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    setEditing(true);
  }, []);

  return (
    <div
      className={`linghuiCanvasGroup nopan ${selected ? 'isSelected' : ''}`}
      style={{ ['--linghui-group-color' as string]: groupData.color ?? '#2563eb' }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openNodeContextMenu(id, event.clientX, event.clientY);
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={140}
        color={groupData.color ?? '#2563eb'}
        lineClassName="linghuiCanvasGroupResizeLine"
        handleClassName="linghuiCanvasGroupResizeHandle"
      />

      <div
        className="linghuiCanvasGroupHeader linghuiCanvasGroupDragHandle"
        onDoubleClick={beginEditing}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draftLabel}
            className="linghuiCanvasGroupInput nodrag nopan"
            onChange={(event) => setDraftLabel(event.target.value)}
            onBlur={commitLabel}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
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
            onDoubleClick={beginEditing}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openNodeContextMenu(id, event.clientX, event.clientY);
            }}
          >
            {groupData.label ?? '分组'}
          </button>
        )}
      </div>
    </div>
  );
}

export const CanvasGroupNode = memo(CanvasGroupNodeInner);
