import React from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
} from '@xyflow/react';
import type { LinghuiCanvasMode, LinghuiNodeData } from '../../types/linghui';
import { linghuiEdgeTypes } from './LinghuiEdge';
import { linghuiNodeTypes } from './nodes';

type ReactFlowComponentProps = React.ComponentProps<typeof ReactFlow>;

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
  onPaneClick,
  onPaneContextMenu,
  onMoveEnd,
}: LinghuiCanvasStageProps) {
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
      onPaneClick={onPaneClick}
      onPaneContextMenu={onPaneContextMenu}
      onMoveEnd={onMoveEnd}
      nodeTypes={linghuiNodeTypes}
      edgeTypes={linghuiEdgeTypes}
      defaultEdgeOptions={{ type: 'linghui-edge' }}
      minZoom={0.25}
      maxZoom={2.5}
      deleteKeyCode={null}
      nodesDraggable
      selectionOnDrag={canvasMode === 'mouse'}
      panOnDrag={canvasMode === 'hand'}
      panOnScroll={canvasMode === 'mouse'}
      zoomOnScroll={canvasMode === 'hand'}
      zoomOnPinch
      zoomOnDoubleClick={false}
      panOnScrollSpeed={0.8}
      panActivationKeyCode={null}
      zoomActivationKeyCode={null}
      nodeDragThreshold={8}
      proOptions={{ hideAttribution: true }}
      colorMode="dark"
      fitView
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="rgba(255,255,255,0.05)"
      />
      <MiniMap
        className="linghuiCanvasMiniMap"
        pannable
        zoomable
        maskColor="rgba(6, 10, 14, 0.72)"
        nodeColor={node => {
          if (node.type === 'group') {
            return String((node.data as { color?: string } | undefined)?.color ?? '#2563eb');
          }
          return String((node.data as unknown as LinghuiNodeData | undefined)?.accent ?? '#4ade80');
        }}
        nodeStrokeWidth={2}
      />
    </ReactFlow>
  );
}
