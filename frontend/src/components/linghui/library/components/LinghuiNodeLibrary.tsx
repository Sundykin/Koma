import React, { useMemo, useState } from 'react';
import { Input } from 'antd';
import { Search } from 'lucide-react';
import { LINGHUI_NODE_CATALOG } from '../state/linghuiNodeDefs';
import type { LinghuiNodeCategory, LinghuiNodeType } from '../../../../types/linghui';

interface LinghuiNodeLibraryProps {
  onAddNode: (type: LinghuiNodeType) => void;
}

const CATEGORY_TITLES: Record<LinghuiNodeCategory, string> = {
  creation: '创作节点',
  storyboard: '分镜节点',
};

export const LinghuiNodeLibrary: React.FC<LinghuiNodeLibraryProps> = ({
  onAddNode,
}) => {
  const [keyword, setKeyword] = useState('');

  const filteredCatalog = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return LINGHUI_NODE_CATALOG;

    return LINGHUI_NODE_CATALOG.filter(item =>
      item.label.toLowerCase().includes(normalized) ||
      item.description.toLowerCase().includes(normalized),
    );
  }, [keyword]);

  const groups = useMemo(() => {
    return (['creation', 'storyboard'] as LinghuiNodeCategory[]).map(category => ({
      category,
      items: filteredCatalog.filter(item => item.category === category),
    }));
  }, [filteredCatalog]);

  return (
    <aside className="linghuiSidebar">
      <div className="linghuiSidebarHeader">
        <div className="linghuiSidebarTitle">节点库</div>
        <div className="linghuiSidebarSubtitle">拖到画布或点击快速添加</div>
      </div>

      <Input
        value={keyword}
        onChange={event => setKeyword(event.target.value)}
        prefix={<Search size={14} />}
        placeholder="搜索节点"
        className="linghuiSearchInput"
      />

      <div className="linghuiNodeGroups">
        {groups.map(group => (
          <section key={group.category} className="linghuiNodeGroup">
            <div className="linghuiNodeGroupTitle">{CATEGORY_TITLES[group.category]}</div>
            <div className="linghuiNodeList">
              {group.items.map(item => (
                <button
                  key={item.type}
                  className="linghuiNodeCard"
                  draggable
                  onDragStart={event => {
                    event.dataTransfer.setData('application/x-linghui-node-type', item.type);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => onAddNode(item.type)}
                >
                  <span
                    className="linghuiNodeAccent"
                    style={{ '--linghui-accent': item.accent } as React.CSSProperties}
                  />
                  <span className="linghuiNodeContent">
                    <span className="linghuiNodeName">{item.label}</span>
                    <span className="linghuiNodeDescription">{item.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
};

export default LinghuiNodeLibrary;
