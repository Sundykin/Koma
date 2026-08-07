import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeResizer, type NodeProps, useReactFlow, useStore } from '@xyflow/react';
import { Grid3X3, LayoutPanelTop, List, Workflow } from 'lucide-react';
import type { LinghuiCanvasGroupData } from '../../../../types/linghui';
import {
  buildLinghuiGroupCountLabel,
  isAutoLinghuiGroupCountLabel,
  resolveLinghuiWorkflowBlockLabel,
} from '../../../../constants/linghuiWorkflowBlock';
import {
  useGroupRunSummary,
  useLinghuiNodeMutation,
  useLinghuiNodeInteractionApi,
} from '../state/LinghuiNodeRunsContext';

const GROUP_COLORS = [
  null,
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#30D5C8',
  '#007AFF',
  '#5856D6',
  '#FF2D95',
  '#8E8E93',
];

type GroupLayoutMode = 'grid' | 'horizontal' | 'vertical';

function CanvasGroupNodeInner({ id, data, selected }: NodeProps) {
  const groupData = data as unknown as LinghuiCanvasGroupData;
  const { updateNodeData } = useLinghuiNodeMutation();
  const { openNodeContextMenu } = useLinghuiNodeInteractionApi();
  const reactFlow = useReactFlow();
  const runSummary = useGroupRunSummary(id);
  const childCount = useStore(state => state.nodes.filter(node => node.parentId === id && node.type !== 'group').length);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const resolvedLabel = resolveLinghuiWorkflowBlockLabel(groupData.label);
  const [draftLabel, setDraftLabel] = useState(resolvedLabel);

  useEffect(() => {
    if (!isAutoLinghuiGroupCountLabel(groupData.label)) return;
    const nextLabel = buildLinghuiGroupCountLabel(
      childCount,
      groupData.storyboardGroupType === 'image' || groupData.storyboardGroupType === 'video',
    );
    if (groupData.label === nextLabel) return;
    updateNodeData(id, prev => ({
      ...prev,
      label: nextLabel,
    }), { markStale: false });
  }, [childCount, groupData.label, groupData.storyboardGroupType, id, updateNodeData]);

  useEffect(() => {
    setDraftLabel(resolvedLabel);
  }, [resolvedLabel]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commitLabel = useCallback(() => {
    const nextLabel = resolveLinghuiWorkflowBlockLabel(draftLabel);
    updateNodeData(id, prev => ({
      ...prev,
      label: nextLabel,
    }), { markStale: false });
    setEditing(false);
  }, [draftLabel, id, updateNodeData]);

  const beginEditing = useCallback((event?: React.SyntheticEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    setEditing(true);
  }, []);

  const handleColorChange = useCallback((color: string | null) => {
    updateNodeData(id, prev => ({
      ...prev,
      color: color ?? 'var(--token-status-info)',
    }), { markStale: false });
    setColorOpen(false);
  }, [id, updateNodeData]);

  const handleLayoutChange = useCallback((mode: GroupLayoutMode) => {
    const allNodes = reactFlow.getNodes();
    const groupNode = allNodes.find(node => node.id === id);
    const children = allNodes
      .filter(node => node.parentId === id && node.type !== 'group')
      .sort((a, b) => Math.abs(a.position.y - b.position.y) > 8
        ? a.position.y - b.position.y
        : a.position.x - b.position.x);
    if (!groupNode || children.length === 0) {
      setLayoutOpen(false);
      return;
    }

    const padding = 36;
    const headerHeight = 52;
    const gap = 28;
    const childRects = children.map(child => ({
      id: child.id,
      width: child.measured?.width ?? child.width ?? 280,
      height: child.measured?.height ?? child.height ?? 180,
    }));
    const maxChildWidth = Math.max(...childRects.map(rect => rect.width));
    const maxChildHeight = Math.max(...childRects.map(rect => rect.height));
    const cols = mode === 'horizontal'
      ? childRects.length
      : mode === 'vertical'
        ? 1
        : Math.max(1, Math.ceil(Math.sqrt(childRects.length)));

    const positionMap = new Map<string, { x: number; y: number }>();
    childRects.forEach((rect, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      positionMap.set(rect.id, {
        x: padding + col * (maxChildWidth + gap),
        y: headerHeight + row * (maxChildHeight + gap),
      });
    });

    const rows = Math.max(1, Math.ceil(childRects.length / cols));
    const nextWidth = padding * 2 + cols * maxChildWidth + Math.max(0, cols - 1) * gap;
    const nextHeight = headerHeight + padding + rows * maxChildHeight + Math.max(0, rows - 1) * gap;

    reactFlow.setNodes(nodes => nodes.map(node => {
      if (node.id === id) {
        return {
          ...node,
          style: {
            ...node.style,
            width: Math.max(220, nextWidth),
            height: Math.max(140, nextHeight),
          },
        };
      }
      const nextPosition = positionMap.get(node.id);
      return nextPosition ? { ...node, position: nextPosition } : node;
    }));
    setLayoutOpen(false);
  }, [id, reactFlow]);

  const statusLabel = (() => {
    if (!runSummary || runSummary.total === 0) return '空工作流块';
    if (runSummary.failed > 0) return `失败 ${runSummary.failed}`;
    if (runSummary.running > 0) return `运行中 ${runSummary.running}/${runSummary.total}`;
    if (runSummary.succeeded === runSummary.total) return `完成 ${runSummary.succeeded}`;
    if (runSummary.succeeded > 0) return `部分完成 ${runSummary.succeeded}/${runSummary.total}`;
    return `${runSummary.total} 节点`;
  })();

  return (
    <div
      className={`linghuiCanvasGroup nopan ${selected ? 'isSelected' : ''} ${runSummary ? `is-${runSummary.status}` : ''}`}
      style={{ '--linghui-group-color': groupData.color ?? 'var(--token-status-info)' } as React.CSSProperties}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openNodeContextMenu(id, event.clientX, event.clientY);
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={140}
        color={groupData.color ?? 'var(--token-status-info)'}
        lineClassName="linghuiCanvasGroupResizeLine"
        handleClassName="linghuiCanvasGroupResizeHandle"
      />

      {selected ? (
        <div className="linghuiCanvasGroupToolbar nodrag nopan">
          <div className="linghuiCanvasGroupToolbarPopupHost">
            <button
              type="button"
              className="linghuiCanvasGroupToolbarButton"
              aria-label="分组颜色"
              title="分组颜色"
              onClick={(event) => {
                event.stopPropagation();
                setColorOpen(open => !open);
                setLayoutOpen(false);
              }}
            >
              <span
                className="linghuiCanvasGroupToolbarColor"
                style={{ background: groupData.color ?? 'var(--token-status-info)' }}
              />
            </button>
            {colorOpen ? (
              <div className="linghuiCanvasGroupToolbarPopover isColor">
                {GROUP_COLORS.map(color => (
                  <button
                    key={color ?? 'default'}
                    type="button"
                    className={`linghuiCanvasGroupColorSwatch ${color === groupData.color ? 'isActive' : ''}`}
                    aria-label={color ? `选择颜色 ${color}` : '恢复默认颜色'}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleColorChange(color);
                    }}
                  >
                    <span style={{ background: color ?? 'var(--token-status-info)' }} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="linghuiCanvasGroupToolbarPopupHost">
            <button
              type="button"
              className="linghuiCanvasGroupToolbarButton"
              aria-label="分组排列"
              title="分组排列"
              onClick={(event) => {
                event.stopPropagation();
                setLayoutOpen(open => !open);
                setColorOpen(false);
              }}
            >
              <LayoutPanelTop size={15} />
            </button>
            {layoutOpen ? (
              <div className="linghuiCanvasGroupToolbarPopover isLayout">
                <button type="button" onClick={(event) => { event.stopPropagation(); handleLayoutChange('grid'); }}>
                  <Grid3X3 size={14} />
                  宫格排列
                </button>
                <button type="button" onClick={(event) => { event.stopPropagation(); handleLayoutChange('horizontal'); }}>
                  <Workflow size={14} />
                  水平排列
                </button>
                <button type="button" onClick={(event) => { event.stopPropagation(); handleLayoutChange('vertical'); }}>
                  <List size={14} />
                  垂直排列
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className="linghuiCanvasGroupHeader linghuiCanvasGroupDragHandle"
        onDoubleClick={beginEditing}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draftLabel}
            className="linghuiCanvasGroupInput nodrag nopan"
            onChange={(event) => setDraftLabel(event.target.value)}
            onBlur={commitLabel}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitLabel();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraftLabel(resolvedLabel);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="linghuiCanvasGroupTitleButton nodrag nopan"
            onDoubleClick={beginEditing}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openNodeContextMenu(id, event.clientX, event.clientY);
            }}
          >
            {resolvedLabel}
          </button>
        )}

        <span className={`linghuiCanvasGroupStatus is-${runSummary?.status ?? 'idle'}`}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

export const CanvasGroupNode = memo(CanvasGroupNodeInner);
