import React from 'react';
import type { LinghuiNodeCatalogItem, LinghuiNodeType } from '../../types/linghui';
import type { QuickCreateState } from './linghuiCanvasShared';

interface LinghuiCanvasQuickCreateProps {
  quickCreate: QuickCreateState | null;
  catalog: LinghuiNodeCatalogItem[];
  onAddNode: (type: LinghuiNodeType) => void;
}

export const LinghuiCanvasQuickCreate: React.FC<LinghuiCanvasQuickCreateProps> = ({
  quickCreate,
  catalog,
  onAddNode,
}) => {
  if (!quickCreate) return null;

  return (
    <div
      className="linghuiQuickCreate nopan nowheel"
      style={{ left: quickCreate.x, top: quickCreate.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="linghuiQuickCreateHeader">快速创建</div>
      <div className="linghuiQuickCreateHint">
        {quickCreate.sourceConnection
          ? '选择一个兼容的下游节点，创建后会自动完成连线'
          : '双击空白后直接落点建节点'}
      </div>
      {(['creation', 'storyboard'] as const).map(category => (
        (() => {
          const categoryItems = catalog.filter(item => item.category === category);
          if (!categoryItems.length) return null;

          return (
            <div key={category} className="linghuiQuickCreateSection">
              <div className="linghuiQuickCreateSectionTitle">
                {category === 'creation' ? '创作节点' : '分镜节点'}
              </div>
              {categoryItems.map(item => (
                <button
                  key={item.type}
                  type="button"
                  className="linghuiQuickCreateItem"
                  onClick={() => onAddNode(item.type)}
                >
                  <span className="linghuiContextMenuDot" style={{ background: item.accent }} />
                  <span className="linghuiQuickCreateItemBody">
                    <span className="linghuiQuickCreateItemLabel">{item.label}</span>
                    <span className="linghuiQuickCreateItemDesc">{item.description}</span>
                  </span>
                </button>
              ))}
            </div>
          );
        })()
      ))}
      {catalog.length === 0 && (
        <div className="linghuiQuickCreateEmpty">
          当前没有兼容这个输出类型的下游节点
        </div>
      )}
    </div>
  );
};
