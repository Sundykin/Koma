import React from 'react';

/**
 * LibTV 节点未生成态通用空白卡片 1:1 复刻（来源 chunk `15gvxu-nayl4w.js` 的 EmptyState 组件）。
 *
 * 真实 JSX 结构（反编译还原）：
 *   <div className="flex h-full flex-col items-center justify-center px-6">
 *     <div className="mb-4">{icon}</div>                                            // 90px 灰色
 *     <div className="w-full">
 *       <div className="text-fg-muted mb-2 text-sm">尝试：</div>
 *       <div className="flex flex-col items-start gap-1">
 *         {actions.map(a => (
 *           <button className="group/btn text-fg-default hover:bg-canvas-controls-hover
 *                              flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-left text-sm">
 *             {a.icon}<span>{a.label}</span>
 *           </button>
 *         ))}
 *       </div>
 *     </div>
 *   </div>
 *
 * LibTV 复用：图片节点 actions = 图生图 / 图片高清；视频节点 actions = 首尾帧生成视频 / 首帧生成视频。
 */
export interface LinghuiNodeEmptyStateAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface LinghuiNodeEmptyStateProps {
  /** 中心大灰色 placeholder icon（90px 风格） */
  icon: React.ReactNode;
  /** "尝试：" 后面的建议按钮列表；空数组时不渲染建议区 */
  actions: LinghuiNodeEmptyStateAction[];
}

export const LinghuiNodeEmptyState: React.FC<LinghuiNodeEmptyStateProps> = ({ icon, actions }) => {
  return (
    <div className="linghuiNodeEmptyState">
      <div className="linghuiNodeEmptyStateIcon">
        {icon}
      </div>
      {actions.length > 0 && (
        <div className="linghuiNodeEmptyStateActions">
          <div className="linghuiNodeEmptyStateActionsLabel">尝试：</div>
          <div className="linghuiNodeEmptyStateActionsList">
            {actions.map(action => (
              <button
                key={action.key}
                type="button"
                className="linghuiNodeEmptyStateActionItem"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  action.onClick();
                }}
              >
                <span className="linghuiNodeEmptyStateActionIcon">{action.icon}</span>
                <span className="linghuiNodeEmptyStateActionLabel">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
