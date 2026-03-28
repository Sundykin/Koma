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
          选区待分组 · {creatableIds.length} 项
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
            创建分组
          </button>
          <button
            type="button"
            className="linghuiPendingGroupAction"
            onClick={onDismiss}
          >
            暂不分组
          </button>
        </div>
      )}
    </>
  );
};
