import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLinghuiNodeMutation } from '../state/LinghuiNodeRunsContext';

interface EditableCompactNodeLabelProps {
  nodeId: string;
  label: string;
  fallbackLabel?: string;
  variant?: 'compact' | 'editor';
  title?: string;
}

export const EditableCompactNodeLabel: React.FC<EditableCompactNodeLabelProps> = ({
  nodeId,
  label,
  fallbackLabel = '未命名节点',
  variant = 'compact',
  title = '双击重命名',
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label || fallbackLabel);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const labelClassName = variant === 'editor' ? 'linghuiNodeEditorTitleEditable' : 'linghuiCompactLabel';
  const inputClassName = variant === 'editor'
    ? 'linghuiNodeEditorTitleInput nodrag nopan'
    : 'linghuiCompactLabelInput nodrag nopan';

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
        className={inputClassName}
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
        onMouseDown={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={labelClassName}
      title={title}
      onMouseDown={event => event.stopPropagation()}
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
