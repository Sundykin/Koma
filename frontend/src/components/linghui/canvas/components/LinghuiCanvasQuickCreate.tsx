import React, { type CSSProperties } from 'react';
import type { LinghuiNodeCatalogItem } from '../../../../types/linghui';
import type { LinghuiNodeCategory } from '../../../../types/linghui';
import type { QuickCreateState } from '../state/linghuiCanvasShared';
import {
  LINGHUI_REFER_NODE_PRESETS,
  isReferPresetCompatible,
  type LinghuiReferNodePreset,
} from '../state/linghuiReferNodePresets';

interface LinghuiCanvasQuickCreateProps {
  quickCreate: QuickCreateState | null;
  /** Kept for backward compat (空白画布双击场景仍可能传入 catalog)；连线场景下不使用。 */
  catalog: LinghuiNodeCatalogItem[];
  onAddNode: (item: LinghuiNodeCatalogItem) => void;
}

/**
 * LibTV "引用该节点生成" / "添加节点" 浮层 1:1 复刻。
 *
 * 行为：
 * - 当 `quickCreate.sourceConnection` 存在（从节点拖出连线松开触发） → 标题 "引用该节点生成"，
 *   平铺 6 项（文本 / 图片 / 视频 / 视频合成 Beta / 音频 / 脚本 Beta），按上游 sourceDataType
 *   判断 disabled 状态；点击任一可用项 = 派生对应节点 + 自动连线。
 * - 否则（双击画布 / 空白右键"添加节点"） → 标题 "添加节点"，使用完整创建 catalog。
 *
 * 之前空白添加也固定使用 6 项引用菜单，导致全景节点 / 3D 导演工作台虽然在 catalog 中，
 * 但 UI 上完全不可见。
 */

const CATEGORY_LABELS: Record<LinghuiNodeCategory, string> = {
  asset: '素材',
  generation: '生成',
  storyboard: '剧情',
  spatial: '空间',
};

const CATEGORY_ORDER: LinghuiNodeCategory[] = ['asset', 'generation', 'storyboard', 'spatial'];

function groupCatalogByCategory(catalog: LinghuiNodeCatalogItem[]) {
  return CATEGORY_ORDER
    .map(category => ({
      category,
      items: catalog.filter(item => item.category === category),
    }))
    .filter(section => section.items.length > 0);
}

export const LinghuiCanvasQuickCreate: React.FC<LinghuiCanvasQuickCreateProps> = ({
  quickCreate,
  catalog,
  onAddNode,
}) => {
  if (!quickCreate) return null;

  const sourceDataType = quickCreate.sourceConnection?.sourceDataType ?? null;
  const isReferMode = Boolean(quickCreate.sourceConnection);
  const catalogSections = groupCatalogByCategory(catalog);

  const handleClick = (preset: LinghuiReferNodePreset) => {
    if (!isReferPresetCompatible(preset, sourceDataType)) {
      return;
    }
    // 适配现有 onAddNode 入参：把 preset 折叠成 LinghuiNodeCatalogItem 形态。
    const item: LinghuiNodeCatalogItem = {
      id: `refer-${preset.key}`,
      type: preset.type,
      label: preset.label,
      description: preset.description,
      accent: 'var(--token-accent-base)',
      category: 'generation',
      nodeLabel: preset.nodeLabel,
      initialProperties: preset.initialProperties,
    };
    onAddNode(item);
  };

  return (
    <div
      className="linghuiQuickCreate nopan nowheel"
      style={{
        '--linghui-overlay-left': `${quickCreate.x}px`,
        '--linghui-overlay-top': `${quickCreate.y}px`,
      } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="linghuiQuickCreateHeader">
        {isReferMode ? '引用该节点生成' : '添加节点'}
      </div>
      {isReferMode ? (
        <div className="linghuiQuickCreateList">
          {LINGHUI_REFER_NODE_PRESETS.map(preset => {
            const compatible = isReferPresetCompatible(preset, sourceDataType);
            const Icon = preset.icon;
            return (
              <button
                key={preset.key}
                type="button"
                className={`linghuiQuickCreateItem ${compatible ? '' : 'isDisabled'}`}
                disabled={!compatible}
                onClick={() => handleClick(preset)}
              >
                <span className="linghuiQuickCreateItemIcon">
                  <Icon size={20} strokeWidth={1.6} />
                </span>
                <span className="linghuiQuickCreateItemBody">
                  <span className="linghuiQuickCreateItemTopline">
                    <span className="linghuiQuickCreateItemLabel">{preset.label}</span>
                    {preset.badge ? (
                      <span className="linghuiQuickCreateBadge">{preset.badge}</span>
                    ) : null}
                  </span>
                  <span className="linghuiQuickCreateItemDesc">{preset.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : catalogSections.length > 0 ? (
        catalogSections.map(section => (
          <div key={section.category} className="linghuiQuickCreateSection">
            <div className="linghuiQuickCreateSectionTitle">{CATEGORY_LABELS[section.category]}</div>
            <div className="linghuiQuickCreateList">
              {section.items.map(item => (
                <button
                  key={item.id ?? item.type}
                  type="button"
                  className="linghuiQuickCreateItem"
                  onClick={() => onAddNode(item)}
                >
                  <span
                    className="linghuiQuickCreateItemIcon"
                    style={{ '--linghui-accent': item.accent } as CSSProperties}
                  >
                    <span className="linghuiQuickCreateItemDot" aria-hidden="true" />
                  </span>
                  <span className="linghuiQuickCreateItemBody">
                    <span className="linghuiQuickCreateItemTopline">
                      <span className="linghuiQuickCreateItemLabel">{item.label}</span>
                      {item.recommendation ? (
                        <span className="linghuiQuickCreateBadge">{item.recommendation}</span>
                      ) : null}
                    </span>
                    <span className="linghuiQuickCreateItemDesc">{item.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="linghuiQuickCreateEmpty">当前没有可添加节点</div>
      )}
    </div>
  );
};
