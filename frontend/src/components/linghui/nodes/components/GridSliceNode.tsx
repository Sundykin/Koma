import React, { memo, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Trash2, ImageOff, Scissors } from 'lucide-react';
import type {
  LinghuiImageGridSliceNodeProperties,
  LinghuiNodeData,
} from '../../../../types/linghui';
import { useLinghuiNodeInteraction, useLinghuiNodeMutation, useLinghuiNodeEditorApi, useNodeRunState } from '../state/LinghuiNodeRunsContext';
import { useLinghuiConnectTarget } from '../state/useLinghuiConnectTarget';
import { LinghuiNodePorts } from './LinghuiNodeHandle';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { cssVars } from '../../../../theme/runtime';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';

/**
 * 宫格切分中间节点。
 *
 * 输入：上游单张图（source 字段）。点击"重新切分"会本地 canvas 把 source 切成 N 个槽位 dataUrl
 * 写入 slots[]。每个槽位独立：可点垃圾桶清空 / 可点 "派生节点" 把该槽位拷成独立 image 节点。
 *
 * 输出：slots 数组（dataType='images'），下游节点可接全部槽位。
 *
 * 当前版本：渲染 + 删除槽位 + "彻底切分（每非空槽位派生独立 image 节点）"；
 * 后续迭代补：拖入外部图片 / 拖拽排序 / "组合成新宫格图"。
 */
function GridSliceNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiImageGridSliceNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const { updateNodeData } = useLinghuiNodeMutation();
  const editorApi = useLinghuiNodeEditorApi();
  const isConnectTarget = useLinghuiConnectTarget(id);
  const status = runState?.status ?? 'idle';

  const gridType = props.gridType ?? '3x3';
  const dimension = ({ '2x2': 2, '3x3': 3, '4x4': 4, '5x5': 5 } as const)[gridType];
  const slotCount = dimension * dimension;
  // 槽位长度归一：少于 slotCount 时补空槽
  const slots = (() => {
    const next = (props.slots ?? []).slice(0, slotCount);
    while (next.length < slotCount) next.push({ id: `slot-${next.length}`, source: '', label: undefined });
    return next;
  })();
  const nonEmptySlotCount = slots.filter(s => String(s.source ?? '').trim().length > 0).length;

  const handleClearSlot = useCallback((slotIndex: number) => {
    updateNodeData(id, prev => {
      const props = prev.properties as unknown as LinghuiImageGridSliceNodeProperties;
      const next = (props.slots ?? []).slice();
      if (next[slotIndex]) {
        next[slotIndex] = { ...next[slotIndex], source: '' };
      }
      return { ...prev, properties: { ...prev.properties, slots: next } as unknown as Record<string, unknown> };
    });
  }, [id, updateNodeData]);

  const handleScatterAll = useCallback(() => {
    // 调 onApplyImageToolPreset 链路？这里我们用 onCreateDerivedImportImages（已存在的派生 import-image 链路）。
    if (typeof editorApi.onCreateDerivedImportImages !== 'function') {
      return;
    }
    const items = slots
      .filter(s => String(s.source ?? '').trim().length > 0)
      .map((s, index) => ({
        id: s.id,
        source: s.source,
        label: s.label || `切片 ${index + 1}`,
      }));
    if (items.length === 0) return;
    editorApi.onCreateDerivedImportImages(id, items);
  }, [editorApi, id, slots]);

  const nodeStyle = cssVars({
    '--linghui-node-width': '320px',
    '--linghui-thumb-height': '320px',
  });

  return (
    <div
      className={`linghuiCompactNode linghuiGridSliceNode nopan is-${status} ${selected ? 'isSelected' : ''} ${isConnectTarget ? 'isConnectTarget' : ''}`}
      style={nodeStyle}
      {...interactionHandlers}
    >
      <LinghuiNodePorts accent={nodeData.accent} inputs={nodeData.inputs} outputs={nodeData.outputs} />

      <div className="linghuiCompactInfo">
        <EditableCompactNodeLabel nodeId={id} label={nodeData.label} fallbackLabel="宫格切分" />
        <span className="linghuiCompactMeta">
          {gridType} · {nonEmptySlotCount}/{slotCount}
        </span>
      </div>

      <div
        className="linghuiGridSliceGrid"
        style={cssVars({ '--grid-cols': String(dimension), '--grid-rows': String(dimension) })}
      >
        {slots.map((slot, index) => {
          const previewSource = String(slot.source ?? '').trim();
          const hasContent = previewSource.length > 0;
          return (
            <div
              key={slot.id ?? `slot-${index}`}
              className={`linghuiGridSliceCell ${hasContent ? 'hasContent' : 'isEmpty'}`}
            >
              {hasContent ? (
                <>
                  <img src={toFileSystemDisplayUrl(previewSource) || previewSource} alt={`切片 ${index + 1}`} draggable={false} />
                  <button
                    type="button"
                    className="linghuiGridSliceCellClear nodrag"
                    title="清空此槽"
                    onClick={(event) => { event.stopPropagation(); handleClearSlot(index); }}
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              ) : (
                <span className="linghuiGridSliceCellEmpty"><ImageOff size={16} /></span>
              )}
            </div>
          );
        })}
      </div>

      <div className="linghuiGridSliceFooter">
        <button
          type="button"
          className="linghuiGridSliceFooterButton nodrag"
          onClick={(event) => { event.stopPropagation(); handleScatterAll(); }}
          disabled={nonEmptySlotCount === 0}
          title="为每个非空槽位派生独立的图片节点"
        >
          <Scissors size={12} />
          <span>彻底切分（{nonEmptySlotCount}）</span>
        </button>
      </div>
    </div>
  );
}

export const GridSliceNode = memo(GridSliceNodeInner);
