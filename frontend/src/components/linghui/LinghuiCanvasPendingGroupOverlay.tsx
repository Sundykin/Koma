import React from 'react';

interface LinghuiCanvasPendingGroupOverlayProps {
  frameStyle: React.CSSProperties | null;
  actionsStyle: React.CSSProperties | null;
  creatableIds: string[];
  onCreateGroup: (selectionIds: string[]) => void;
  onDismiss: () => void;
}

export const LinghuiCanvasPendingGroupOverlay: React.FC<LinghuiCanvasPendingGroupOverlayProps> = ({
  frameStyle,
  actionsStyle,
  creatableIds,
  onCreateGroup,
  onDismiss,
}) => {
  if (!frameStyle) return null;

  return (
    <>
      <div
        className="linghuiPendingGroupFrame"
        style={frameStyle}
      >
        <span className="linghuiPendingGroupBadge">
          选区待创建工作流块 · {creatableIds.length} 项
        </span>
      </div>
      {actionsStyle && creatableIds.length > 0 && (
        <div
          className="linghuiPendingGroupActions nopan nowheel"
          style={actionsStyle}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="linghuiPendingGroupAction isPrimary"
            onClick={() => onCreateGroup(creatableIds)}
          >
            创建工作流块
          </button>
          <button
            type="button"
            className="linghuiPendingGroupAction"
            onClick={onDismiss}
          >
            暂不创建
          </button>
        </div>
      )}
    </>
  );
};
