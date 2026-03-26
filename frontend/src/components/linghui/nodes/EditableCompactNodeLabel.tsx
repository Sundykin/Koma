import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLinghuiNodeMutation } from './LinghuiNodeRunsContext';

interface EditableCompactNodeLabelProps {
  nodeId: string;
  label: string;
  fallbackLabel?: string;
}

export const EditableCompactNodeLabel: React.FC<EditableCompactNodeLabelProps> = ({
  nodeId,
  label,
  fallbackLabel = '未命名节点',
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label || fallbackLabel);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftLabel(label || fallbackLabel);
    }
  }, [fallbackLabel, isEditing, label]);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const commitRename = useCallback(() => {
    const nextLabel = draftLabel.trim() || label.trim() || fallbackLabel;
    setIsEditing(false);

    if (nextLabel === label) {
      setDraftLabel(nextLabel);
      return;
    }

    updateNodeData(nodeId, prev => ({
      ...prev,
      label: nextLabel,
    }), { markStale: false });
    setDraftLabel(nextLabel);
  }, [draftLabel, fallbackLabel, label, nodeId, updateNodeData]);

  const cancelRename = useCallback(() => {
    setDraftLabel(label || fallbackLabel);
    setIsEditing(false);
  }, [fallbackLabel, label]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="linghuiCompactLabelInput nodrag nopan"
        value={draftLabel}
        onChange={event => setDraftLabel(event.target.value)}
        onBlur={commitRename}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitRename();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelRename();
          }
        }}
        onPointerDown={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()}
      />
    );
  }

  return (
    <span
      className="linghuiCompactLabel"
      title="双击重命名"
      onDoubleClick={event => {
        event.preventDefault();
        event.stopPropagation();
        setIsEditing(true);
      }}
    >
      {label || fallbackLabel}
    </span>
  );
};
