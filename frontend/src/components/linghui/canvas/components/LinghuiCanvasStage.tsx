import React from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
} from '@xyflow/react';
import type { LinghuiCanvasMode, LinghuiNodeData } from '../../../../types/linghui';
import { useTheme } from '../../../../theme/runtime';
import { linghuiEdgeTypes } from './LinghuiEdge';
import { linghuiNodeTypes } from '../../nodes';

type ReactFlowComponentProps = React.ComponentProps<typeof ReactFlow>;
const DEFAULT_EDGE_OPTIONS = { type: 'linghui-edge' } as const;
const REACT_FLOW_PRO_OPTIONS = { hideAttribution: true } as const;
const LINGHUI_CONNECTION_RADIUS = 56;
const LINGHUI_CONNECTION_DRAG_THRESHOLD = 1;

interface LinghuiCanvasStageProps {
  nodes: ReactFlowComponentProps['nodes'];
  edges: ReactFlowComponentProps['edges'];
  canvasMode: LinghuiCanvasMode;
  onNodesChange: ReactFlowComponentProps['onNodesChange'];
  onEdgesChange: ReactFlowComponentProps['onEdgesChange'];
  onConnect: ReactFlowComponentProps['onConnect'];
  onConnectStart: ReactFlowComponentProps['onConnectStart'];
  onConnectEnd: ReactFlowComponentProps['onConnectEnd'];
  isValidConnection: ReactFlowComponentProps['isValidConnection'];
  onSelectionChange: ReactFlowComponentProps['onSelectionChange'];
  onSelectionDragStart: ReactFlowComponentProps['onSelectionDragStart'];
  onSelectionDragStop: ReactFlowComponentProps['onSelectionDragStop'];
  onSelectionContextMenu: ReactFlowComponentProps['onSelectionContextMenu'];
  onSelectionStart: ReactFlowComponentProps['onSelectionStart'];
  onSelectionEnd: ReactFlowComponentProps['onSelectionEnd'];
  onNodeClick: ReactFlowComponentProps['onNodeClick'];
  onNodeContextMenu: ReactFlowComponentProps['onNodeContextMenu'];
  onEdgeClick: ReactFlowComponentProps['onEdgeClick'];
  onEdgeContextMenu: ReactFlowComponentProps['onEdgeContextMenu'];
  onPaneClick: ReactFlowComponentProps['onPaneClick'];
  onPaneContextMenu: ReactFlowComponentProps['onPaneContextMenu'];
  onMoveEnd: ReactFlowComponentProps['onMoveEnd'];
}

export function LinghuiCanvasStage({
  nodes,
  edges,
  canvasMode,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onConnectStart,
  onConnectEnd,
  isValidConnection,
  onSelectionChange,
  onSelectionDragStart,
  onSelectionDragStop,
  onSelectionContextMenu,
  onSelectionStart,
  onSelectionEnd,
  onNodeClick,
  onNodeContextMenu,
  onEdgeClick,
  onEdgeContextMenu,
  onPaneClick,
  onPaneContextMenu,
  onMoveEnd,
}: LinghuiCanvasStageProps) {
  const useVisibleElementCulling = nodes.length + edges.length >= 120;
  const { theme } = useTheme();
  const isDarkTheme = theme.meta.mode === 'dark';
  const majorGridColor = isDarkTheme
    ? 'color-mix(in srgb, var(--token-text-tertiary) 48%, transparent)'
    : theme.tokens.text.tertiary;
  const minorGridColor = isDarkTheme
    ? 'color-mix(in srgb, var(--token-text-tertiary) 24%, transparent)'
    : theme.tokens.border.base;
  const minimapMaskColor = isDarkTheme
    ? 'color-mix(in srgb, var(--token-bg-app) 72%, transparent)'
    : 'color-mix(in srgb, var(--token-bg-app) 72%, transparent)';

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
      isValidConnection={isValidConnection}
      onSelectionChange={onSelectionChange}
      onSelectionDragStart={onSelectionDragStart}
      onSelectionDragStop={onSelectionDragStop}
      onSelectionContextMenu={onSelectionContextMenu}
      onSelectionStart={onSelectionStart}
      onSelectionEnd={onSelectionEnd}
      onNodeClick={onNodeClick}
      onNodeContextMenu={onNodeContextMenu}
      onEdgeClick={onEdgeClick}
      onEdgeContextMenu={onEdgeContextMenu}
      onPaneClick={onPaneClick}
      onPaneContextMenu={onPaneContextMenu}
      onMoveEnd={onMoveEnd}
      nodeTypes={linghuiNodeTypes}
      edgeTypes={linghuiEdgeTypes}
      defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
      minZoom={0.25}
      maxZoom={2.5}
      deleteKeyCode={null}
      nodesDraggable
      // ComfyUI 风格：滚轮始终只做缩放（不平移）。
      //  - hand 模式：左键拖动空白处即平移（用于查看放大后超出视口的内容）
      //  - mouse 模式：左键拖动框选；同时给中键/右键拖动作为兜底平移手段
      // Shift + 拖动 仍可触发框选（React Flow 默认 selectionKeyCode='Shift'），不破坏多选。
      selectionOnDrag={canvasMode === 'mouse'}
      panOnDrag={canvasMode === 'hand' ? true : [1, 2]}
      panOnScroll={false}
      zoomOnScroll
      zoomOnPinch
      zoomOnDoubleClick={false}
      panActivationKeyCode={null}
      zoomActivationKeyCode={null}
      nodeDragThreshold={8}
      connectionRadius={LINGHUI_CONNECTION_RADIUS}
      connectionDragThreshold={LINGHUI_CONNECTION_DRAG_THRESHOLD}
      onlyRenderVisibleElements={useVisibleElementCulling}
      proOptions={REACT_FLOW_PRO_OPTIONS}
      colorMode={theme.meta.mode}
      fitView
    >
      <Background
        id="linghui-grid-major"
        variant={BackgroundVariant.Dots}
        gap={96}
        size={3.8}
        color={majorGridColor}
      />
      <Background
        id="linghui-grid-minor"
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1.9}
        color={minorGridColor}
      />
      <MiniMap
        className="linghuiCanvasMiniMap"
        pannable
        zoomable
        maskColor={minimapMaskColor}
        nodeColor={node => {
          if (node.type === 'group') {
            return String((node.data as { color?: string } | undefined)?.color ?? 'var(--token-status-info)');
          }
          return String((node.data as unknown as LinghuiNodeData | undefined)?.accent ?? 'var(--token-accent-base)');
        }}
        nodeStrokeWidth={2}
      />
    </ReactFlow>
  );
}
