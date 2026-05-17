import React, { type CSSProperties, useMemo } from 'react';
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
  /** Kept for backward compat。新流程下两种场景统一使用 LINGHUI_REFER_NODE_PRESETS 卡片样式，不再消费 catalog。 */
  catalog: LinghuiNodeCatalogItem[];
  onAddNode: (item: LinghuiNodeCatalogItem) => void;
}

/**
 * LibTV "引用该节点生成" / "添加节点" 浮层 —— **两种场景统一一套卡片样式**：
 *
 * - 连线松开触发（quickCreate.sourceConnection 存在）：
 *   - 标题 "引用该节点生成"
 *   - 用 LINGHUI_REFER_NODE_PRESETS，过滤掉 `hideInReferMode: true`（空间类节点：全景 / 3D 导演）
 *   - 按 sourceDataType 兼容性切 disabled
 *   - 扁平展示，不分组
 *
 * - 双击画布 / 右键"添加节点"触发：
 *   - 标题 "添加节点"
 *   - 用同一份 LINGHUI_REFER_NODE_PRESETS（含全景 / 3D 导演）
 *   - **按 category 分组**：素材 / 生成 / 剧情 / 空间
 *   - 全部 enabled（无上游兼容性约束）
 *
 * 卡片视觉（图标 / 标题 / 描述 / Beta badge）两种场景完全一致。
 * 这个统一让用户在两条入口看到同样的卡片密度，且修复了 "全景节点 / 3D 导演工作台" 在 UI 上不可见的问题。
 */

const CATEGORY_LABELS: Record<LinghuiNodeCategory, string> = {
  asset: '素材',
  generation: '生成',
  storyboard: '剧情',
  spatial: '空间',
};

const CATEGORY_ORDER: LinghuiNodeCategory[] = ['asset', 'generation', 'storyboard', 'spatial'];

function groupPresetsByCategory(presets: LinghuiReferNodePreset[]) {
  return CATEGORY_ORDER
    .map(category => ({
      category,
      items: presets.filter(preset => preset.category === category),
    }))
    .filter(section => section.items.length > 0);
}

export const LinghuiCanvasQuickCreate: React.FC<LinghuiCanvasQuickCreateProps> = ({
  quickCreate,
  catalog: _catalog,  // 保留 prop 接口兼容性，但本组件不再消费（统一使用 LINGHUI_REFER_NODE_PRESETS）
  onAddNode,
}) => {
  void _catalog;
  const sourceDataType = quickCreate?.sourceConnection?.sourceDataType ?? null;
  const isReferMode = Boolean(quickCreate?.sourceConnection);

  // 连线模式排除 spatial 类节点（hideInReferMode），其余两种场景共享同一份 PRESETS。
  const visiblePresets = useMemo(() => (
    isReferMode
      ? LINGHUI_REFER_NODE_PRESETS.filter(preset => !preset.hideInReferMode)
      : LINGHUI_REFER_NODE_PRESETS
  ), [isReferMode]);

  const sections = useMemo(() => groupPresetsByCategory(visiblePresets), [visiblePresets]);

  if (!quickCreate) return null;

  const handleClick = (preset: LinghuiReferNodePreset) => {
    // 连线模式下按 sourceDataType 检查兼容；非连线模式按 available 检查。
    if (isReferMode && !isReferPresetCompatible(preset, sourceDataType)) return;
    if (!isReferMode && !preset.available) return;
    // 适配现有 onAddNode 入参：把 preset 折叠成 LinghuiNodeCatalogItem 形态。
    const item: LinghuiNodeCatalogItem = {
      id: `refer-${preset.key}`,
      type: preset.type,
      label: preset.label,
      description: preset.description,
      accent: 'var(--token-accent-base)',
      category: preset.category,
      nodeLabel: preset.nodeLabel,
      initialProperties: preset.initialProperties,
    };
    onAddNode(item);
  };

  const renderPresetButton = (preset: LinghuiReferNodePreset) => {
    const Icon = preset.icon;
    const enabled = isReferMode
      ? isReferPresetCompatible(preset, sourceDataType)
      : preset.available;
    return (
      <button
        key={preset.key}
        type="button"
        className={`linghuiQuickCreateItem ${enabled ? '' : 'isDisabled'}`}
        disabled={!enabled}
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
        // 连线模式扁平展示（与 LibTV 1:1 一致）
        <div className="linghuiQuickCreateList">
          {visiblePresets.map(renderPresetButton)}
        </div>
      ) : sections.length > 0 ? (
        // 添加节点模式：分组卡片（素材 / 生成 / 剧情 / 空间），卡片样式与连线模式完全一致
        sections.map(section => (
          <div key={section.category} className="linghuiQuickCreateSection">
            <div className="linghuiQuickCreateSectionTitle">{CATEGORY_LABELS[section.category]}</div>
            <div className="linghuiQuickCreateList">
              {section.items.map(renderPresetButton)}
            </div>
          </div>
        ))
      ) : (
        <div className="linghuiQuickCreateEmpty">当前没有可添加节点</div>
      )}
    </div>
  );
};
