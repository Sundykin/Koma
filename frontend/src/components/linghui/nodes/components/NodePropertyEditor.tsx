import React, { useCallback } from 'react';
import { useLinghuiNodeMutation } from '../state/LinghuiNodeRunsContext';

interface NodeTextareaProps {
  nodeId: string;
  property: string;
  label: string;
  placeholder: string;
  height?: number;
  value: string;
}

export const NodeTextarea: React.FC<NodeTextareaProps> = ({
  nodeId,
  property,
  label,
  placeholder,
  height = 120,
  value,
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(nodeId, prev => ({
        ...prev,
        properties: { ...prev.properties, [property]: event.target.value },
      }));
    },
    [nodeId, property, updateNodeData],
  );

  return (
    <div className="linghuiNodeWidget linghuiNodeEditorWidget">
      <div className="linghuiNodeWidgetLabel">{label}</div>
      <textarea
        className="linghuiNodeTextarea"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        style={{ '--linghui-textarea-min-height': `${height}px` } as React.CSSProperties}
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      />
    </div>
  );
};

interface NodeTextInputProps {
  nodeId: string;
  property: string;
  label: string;
  placeholder: string;
  value: string;
}

export const NodeTextInput: React.FC<NodeTextInputProps> = ({
  nodeId,
  property,
  label,
  placeholder,
  value,
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(nodeId, prev => ({
        ...prev,
        properties: { ...prev.properties, [property]: event.target.value },
      }));
    },
    [nodeId, property, updateNodeData],
  );

  return (
    <div className="linghuiNodeWidget linghuiNodeEditorWidget">
      <div className="linghuiNodeWidgetLabel">{label}</div>
      <input
        className="linghuiNodeInput"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      />
    </div>
  );
};
