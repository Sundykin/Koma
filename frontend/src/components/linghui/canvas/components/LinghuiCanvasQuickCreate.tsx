import React, { type CSSProperties } from 'react';
import type { LinghuiNodeCatalogItem } from '../../../../types/linghui';
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
 * - 否则（双击画布 / 空白右键"添加节点"） → 标题 "添加节点"，同样 6 项，全部可用。
 *
 * 与 LibTV 完全一致：不暴露"参考节点"，因为参考是通过"上传"动作创建的，不是这里。
 */
export const LinghuiCanvasQuickCreate: React.FC<LinghuiCanvasQuickCreateProps> = ({
  quickCreate,
  onAddNode,
}) => {
  if (!quickCreate) return null;

  const sourceDataType = quickCreate.sourceConnection?.sourceDataType ?? null;
  const isReferMode = Boolean(quickCreate.sourceConnection);

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
    </div>
  );
};
