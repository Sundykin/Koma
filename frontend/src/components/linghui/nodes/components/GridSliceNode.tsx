import React, { memo, useCallback, useMemo, useState } from 'react';
import { createLogger } from '../../../../store/logger';

const logger = createLogger('GridSliceNode');
import { type NodeProps } from '@xyflow/react';
import { Grid3X3, ImageOff, LoaderCircle, Scissors, Trash2 } from 'lucide-react';
import type {
  LinghuiImageAssetItem,
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
 * 当前版本：渲染 + 删除槽位 + "彻底切分（每非空槽位派生独立 image 节点）" + "合成宫格图"。
 * 后续迭代补：拖入外部图片 / 拖拽排序。
 */
const GRID_SLICE_DIMENSIONS = {
  '2x2': 2,
  '3x3': 3,
  '4x4': 4,
  '5x5': 5,
} as const;

type GridSliceSlot = LinghuiImageGridSliceNodeProperties['slots'][number];

export function normalizeGridSliceSlots(
  slots: GridSliceSlot[] | undefined,
  slotCount: number,
): GridSliceSlot[] {
  const next = (slots ?? []).slice(0, slotCount);
  while (next.length < slotCount) next.push({ id: `slot-${next.length}`, source: '', label: undefined });
  return next;
}

export function buildGridSliceDerivedItems(slots: GridSliceSlot[]): LinghuiImageAssetItem[] {
  return slots
    .filter(slot => String(slot.source ?? '').trim().length > 0)
    .map((slot, index) => ({
      id: slot.id,
      source: slot.source,
      label: slot.label || `切片 ${index + 1}`,
    }));
}

export function swapGridSliceSlots(
  slots: GridSliceSlot[],
  fromIndex: number,
  toIndex: number,
): GridSliceSlot[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= slots.length || toIndex >= slots.length) {
    return slots;
  }
  const next = slots.slice();
  [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
  return next;
}

function readDroppedGridSliceImage(dataTransfer: DataTransfer): Promise<{ source: string; label?: string } | null> {
  const file = Array.from(dataTransfer.files ?? []).find(item => item.type.startsWith('image/'));
  if (file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        source: String(reader.result ?? ''),
        label: file.name,
      });
      reader.onerror = () => reject(new Error('读取拖入图片失败'));
      reader.readAsDataURL(file);
    });
  }

  const text = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain');
  const source = String(text ?? '').trim();
  return Promise.resolve(source ? { source } : null);
}

function loadGridSliceImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('读取切片图片失败'));
    image.src = toFileSystemDisplayUrl(source) || source;
  });
}

export async function composeGridSliceDataUrl(
  slots: GridSliceSlot[],
  dimension: number,
): Promise<string> {
  const loaded = await Promise.all(slots.map(async (slot) => {
    const source = String(slot.source ?? '').trim();
    if (!source) return null;
    return loadGridSliceImage(source);
  }));
  const firstImage = loaded.find((image): image is HTMLImageElement => Boolean(image));
  if (!firstImage) {
    throw new Error('没有可合成的切片');
  }

  const cellWidth = Math.max(1, firstImage.naturalWidth || firstImage.width || 512);
  const cellHeight = Math.max(1, firstImage.naturalHeight || firstImage.height || cellWidth);
  const canvas = document.createElement('canvas');
  canvas.width = cellWidth * dimension;
  canvas.height = cellHeight * dimension;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('当前环境无法创建宫格画布');
  }

  context.fillStyle = '#f3f4f6';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(15, 23, 42, 0.12)';
  context.lineWidth = Math.max(1, Math.round(Math.min(cellWidth, cellHeight) * 0.006));

  loaded.forEach((image, index) => {
    const col = index % dimension;
    const row = Math.floor(index / dimension);
    const x = col * cellWidth;
    const y = row * cellHeight;
    if (image) {
      context.drawImage(image, x, y, cellWidth, cellHeight);
    }
    context.strokeRect(x, y, cellWidth, cellHeight);
  });

  return canvas.toDataURL('image/png');
}

function GridSliceNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiImageGridSliceNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const { updateNodeData } = useLinghuiNodeMutation();
  const editorApi = useLinghuiNodeEditorApi();
  const isConnectTarget = useLinghuiConnectTarget(id);
  const status = runState?.status ?? 'idle';
  const [isComposing, setIsComposing] = useState(false);
  const [dragSlotIndex, setDragSlotIndex] = useState<number | null>(null);

  const gridType = props.gridType ?? '3x3';
  const dimension = GRID_SLICE_DIMENSIONS[gridType];
  const slotCount = dimension * dimension;
  const slots = useMemo(() => normalizeGridSliceSlots(props.slots, slotCount), [props.slots, slotCount]);
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
    if (typeof editorApi.onCreateDerivedImportImages !== 'function') {
      return;
    }
    const items = buildGridSliceDerivedItems(slots);
    if (items.length === 0) return;
    editorApi.onCreateDerivedImportImages(id, items);
  }, [editorApi, id, slots]);

  const handleDropOnSlot = useCallback(async (
    event: React.DragEvent<HTMLDivElement>,
    slotIndex: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedIndex = dragSlotIndex;
    setDragSlotIndex(null);

    if (typeof draggedIndex === 'number') {
      const nextSlots = swapGridSliceSlots(slots, draggedIndex, slotIndex);
      if (nextSlots === slots) return;
      updateNodeData(id, prev => ({
        ...prev,
        properties: {
          ...prev.properties,
          slots: nextSlots,
        } as unknown as Record<string, unknown>,
      }));
      return;
    }

    const dropped = await readDroppedGridSliceImage(event.dataTransfer);
    if (!dropped) return;
    updateNodeData(id, prev => {
      const props = prev.properties as unknown as LinghuiImageGridSliceNodeProperties;
      const next = normalizeGridSliceSlots(props.slots, slotCount);
      next[slotIndex] = {
        ...next[slotIndex],
        source: dropped.source,
        label: dropped.label || next[slotIndex]?.label,
      };
      return {
        ...prev,
        properties: {
          ...prev.properties,
          slots: next,
        } as unknown as Record<string, unknown>,
      };
    });
  }, [dragSlotIndex, id, slotCount, slots, updateNodeData]);

  const handleComposeGrid = useCallback(async () => {
    if (nonEmptySlotCount === 0 || isComposing) return;
    setIsComposing(true);
    try {
      const source = await composeGridSliceDataUrl(slots, dimension);
      editorApi.onCreateDerivedImportImages(id, [{
        id: `grid-${id}`,
        source,
        label: `${nodeData.label || '宫格切分'} 合成图`,
      }]);
    } catch (error) {
      logger.warn('compose grid failed', error);
    } finally {
      setIsComposing(false);
    }
  }, [dimension, editorApi, id, isComposing, nodeData.label, nonEmptySlotCount, slots]);

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
              className={`linghuiGridSliceCell ${hasContent ? 'hasContent' : 'isEmpty'} ${dragSlotIndex === index ? 'isDragging' : ''}`}
              draggable={hasContent}
              title={hasContent ? '拖拽调整槽位顺序' : '拖入图片填充此槽'}
              onDragStart={(event) => {
                event.stopPropagation();
                if (!hasContent) return;
                setDragSlotIndex(index);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/x-linghui-grid-slot', String(index));
              }}
              onDragEnd={() => setDragSlotIndex(null)}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = dragSlotIndex === null ? 'copy' : 'move';
              }}
              onDrop={(event) => { void handleDropOnSlot(event, index); }}
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
          onClick={(event) => { event.stopPropagation(); void handleComposeGrid(); }}
          disabled={nonEmptySlotCount === 0 || isComposing}
          title="把当前槽位重新合成为一张宫格图片节点"
        >
          {isComposing ? <LoaderCircle size={12} className="linghuiCompactInlineSpinner" /> : <Grid3X3 size={12} />}
          <span>合成宫格</span>
        </button>
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
