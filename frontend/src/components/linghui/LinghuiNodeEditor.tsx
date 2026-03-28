import React, { useEffect, useMemo, useState } from 'react';
import {
  useEdges,
  useInternalNode,
  useNodes,
  useNodesData,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import type {
  LinghuiAudioNodeProperties,
  LinghuiCanvasSelection,
  LinghuiImageToolKey,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiNodeToolState,
  LinghuiReferenceNodeProperties,
  LinghuiVideoToolKey,
  LinghuiVideoNodeProperties,
} from '../../types/linghui';
import { ReferenceNodeEditor } from './ReferenceNodeEditor';
import { TextNodeEditor } from './TextNodeEditor';
import { ImageNodeEditor } from './ImageNodeEditor';
import { VideoNodeEditor } from './VideoNodeEditor';
import { AudioNodeEditor } from './AudioNodeEditor';
import {
  buildLinghuiPromptReferenceItems,
  getOrderedIncomingReferenceEdges,
} from './linghuiPromptReferences';

interface LinghuiNodeEditorProps {
  selection: LinghuiCanvasSelection;
  activeTool: LinghuiNodeToolState;
  onToolChange: (tool: LinghuiNodeToolState) => void;
  nodeRuns: Record<string, import('../../types/linghui').LinghuiNodeRunState>;
  onRunNode: (nodeId: string) => void;
  canvasRect: DOMRect | null;
  workspaceId: string | null;
}

export const LinghuiNodeEditor: React.FC<LinghuiNodeEditorProps> = ({
  selection,
  activeTool,
  onToolChange,
  nodeRuns,
  onRunNode,
  canvasRect,
  workspaceId,
}) => {
  const reactFlow = useReactFlow();
  const viewport = useViewport();
  const edges = useEdges();
  const nodes = useNodes();
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);

  const nodeId = selection?.kind === 'node' ? selection.nodeId : null;
  const nodeType = selection?.kind === 'node' ? selection.nodeType : null;
  const nodeEntry = useNodesData(nodeId ?? '');
  const internalNode = useInternalNode(nodeId ?? '');

  const showEditor = (
    nodeType === 'linghui/reference' ||
    nodeType === 'linghui/text' ||
    nodeType === 'linghui/image' ||
    nodeType === 'linghui/video' ||
    nodeType === 'linghui/audio'
  );

  const nodeData = useMemo(() => {
    return (nodeEntry?.data as unknown as LinghuiNodeData | undefined) ?? null;
  }, [nodeEntry]);

  const nodeDataMap = useMemo(() => {
    return new Map(
      nodes.map(node => [node.id, node.data as unknown as LinghuiNodeData]),
    );
  }, [nodes]);

  const referenceImages = useMemo(() => {
    if (!nodeId) return [];

    const refs: Array<{ source?: string; label?: string }> = [];
    const dedupe = new Set<string>();

    for (const edge of getOrderedIncomingReferenceEdges(
      nodeId,
      edges.map(edge => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    )) {
      if (edge.targetHandle !== 'input-0') continue;

      const result = nodeRuns[edge.source]?.result;
      const sourceNodeData = nodeDataMap.get(edge.source);
      const fallbackSource = sourceNodeData?.linghuiType === 'linghui/reference'
        ? String((sourceNodeData.properties as unknown as LinghuiReferenceNodeProperties)?.source ?? '').trim()
        : sourceNodeData?.linghuiType === 'linghui/image'
          ? String((sourceNodeData.properties as unknown as LinghuiImageNodeProperties)?.source ?? '').trim()
        : '';
      const source = result?.primary?.source || fallbackSource;

      if (!source || dedupe.has(source)) continue;

      dedupe.add(source);
      refs.push({
        source,
        label: result?.primary?.label || sourceNodeData?.label || `参考 ${refs.length + 1}`,
      });
    }

    return refs;
  }, [edges, nodeId, nodeDataMap, nodeRuns]);

  const referenceVideos = useMemo(() => {
    if (!nodeId) return [];

    const refs: Array<{ source?: string; posterSource?: string; label?: string }> = [];
    const dedupe = new Set<string>();

    for (const edge of getOrderedIncomingReferenceEdges(
      nodeId,
      edges.map(edge => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    )) {
      if (edge.targetHandle !== 'input-3') continue;

      const result = nodeRuns[edge.source]?.result;
      const sourceNodeData = nodeDataMap.get(edge.source);
      const props = sourceNodeData?.properties as unknown as LinghuiVideoNodeProperties | undefined;
      const source = String(result?.primary?.source ?? props?.source ?? '').trim();
      const posterSource = String(result?.primary?.posterSource ?? props?.posterSource ?? '').trim();
      const key = posterSource || source;

      if (!key || dedupe.has(key)) continue;

      dedupe.add(key);
      refs.push({
        source,
        posterSource,
        label: result?.primary?.label || sourceNodeData?.label || `视频 ${refs.length + 1}`,
      });
    }

    return refs;
  }, [edges, nodeId, nodeDataMap, nodeRuns]);

  const referenceAudios = useMemo(() => {
    if (!nodeId) return [];

    const refs: Array<{ source?: string; label?: string }> = [];
    const dedupe = new Set<string>();

    for (const edge of getOrderedIncomingReferenceEdges(
      nodeId,
      edges.map(edge => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    )) {
      if (edge.targetHandle !== 'input-2') continue;

      const result = nodeRuns[edge.source]?.result;
      const sourceNodeData = nodeDataMap.get(edge.source);
      const props = sourceNodeData?.properties as unknown as LinghuiAudioNodeProperties | undefined;
      const source = String(result?.primary?.source ?? props?.source ?? '').trim();
      if (!source || dedupe.has(source)) continue;

      dedupe.add(source);
      refs.push({
        source,
        label: result?.primary?.label || sourceNodeData?.label || `音频 ${refs.length + 1}`,
      });
    }

    return refs;
  }, [edges, nodeId, nodeDataMap, nodeRuns]);

  const promptReferences = useMemo(() => {
    if (!nodeId) return [];

    return buildLinghuiPromptReferenceItems({
      nodeId,
      nodes: nodes.map(node => ({
        id: node.id,
        data: node.data as unknown as LinghuiNodeData,
      })),
      edges: edges.map(edge => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
      getNodeResult(upstreamNodeId) {
        return nodeRuns[upstreamNodeId]?.result;
      },
    });
  }, [edges, nodeId, nodeRuns, nodes]);

  useEffect(() => {
    if (!nodeId || !showEditor || !canvasRect || !internalNode) {
      setPanelPos(null);
      return;
    }

    const nodePosition = (internalNode as any)?.internals?.positionAbsolute ?? internalNode.position;
    const nodeHeight = internalNode.measured?.height ?? internalNode.height ?? 100;
    const nodeWidth = internalNode.measured?.width ?? internalNode.width ?? 200;
    const screenPos = reactFlow.flowToScreenPosition({
      x: nodePosition.x,
      y: nodePosition.y,
    });

    const panelWidth = nodeType === 'linghui/reference' ? 420 : 560;
    const panelHeight = nodeType === 'linghui/reference'
      ? 360
      : nodeType === 'linghui/text'
        ? 460
        : nodeType === 'linghui/audio'
          ? 400
          : activeTool
            ? 560
          : 340;
    const centeredX = screenPos.x - canvasRect.left + nodeWidth / 2 - panelWidth / 2;
    const belowY = screenPos.y - canvasRect.top + nodeHeight + 12;
    const aboveY = screenPos.y - canvasRect.top - panelHeight - 12;
    const clampedX = Math.max(12, Math.min(centeredX, canvasRect.width - panelWidth - 12));
    const resolvedY = belowY + panelHeight <= canvasRect.height - 12
      ? belowY
      : Math.max(12, aboveY);

    setPanelPos({ x: clampedX, y: resolvedY });
  }, [activeTool, canvasRect, internalNode, nodeId, nodeType, reactFlow, showEditor, viewport]);

  if (!showEditor || !nodeId || !nodeData || !panelPos) return null;

  const panelWidth = nodeType === 'linghui/reference' ? 420 : 560;
  const activeImageTool = activeTool?.kind === 'image' && activeTool.nodeId === nodeId
    ? activeTool.tool
    : null;
  const activeVideoTool = activeTool?.kind === 'video' && activeTool.nodeId === nodeId
    ? activeTool.tool
    : null;

  return (
    <div
      className="linghuiNodeEditorContainer"
      style={{
        position: 'absolute',
        left: panelPos.x,
        top: panelPos.y,
        width: panelWidth,
        zIndex: 50,
      }}
    >
      {nodeType === 'linghui/reference' && (
        <ReferenceNodeEditor
          nodeId={nodeId}
          nodeData={nodeData}
          workspaceId={workspaceId}
          onRun={() => onRunNode(nodeId)}
        />
      )}
      {nodeType === 'linghui/text' && (
        <TextNodeEditor
          nodeId={nodeId}
          nodeData={nodeData}
          promptReferences={promptReferences}
          onRun={() => onRunNode(nodeId)}
        />
      )}
      {nodeType === 'linghui/image' && (
        <ImageNodeEditor
          nodeId={nodeId}
          nodeData={nodeData}
          referenceImages={referenceImages}
          promptReferences={promptReferences}
          workspaceId={workspaceId}
          activeTool={activeImageTool}
          onToolChange={(tool: LinghuiImageToolKey | null) => onToolChange(tool ? { kind: 'image', nodeId, tool } : null)}
          onRun={() => onRunNode(nodeId)}
        />
      )}
      {nodeType === 'linghui/video' && (
        <VideoNodeEditor
          nodeId={nodeId}
          nodeData={nodeData}
          referenceImages={referenceImages}
          referenceVideos={referenceVideos}
          referenceAudios={referenceAudios}
          promptReferences={promptReferences}
          workspaceId={workspaceId}
          activeTool={activeVideoTool}
          onToolChange={(tool: LinghuiVideoToolKey | null) => onToolChange(tool ? { kind: 'video', nodeId, tool } : null)}
          onRun={() => onRunNode(nodeId)}
        />
      )}
      {nodeType === 'linghui/audio' && (
        <AudioNodeEditor
          nodeId={nodeId}
          nodeData={nodeData}
          workspaceId={workspaceId}
          onRun={() => onRunNode(nodeId)}
        />
      )}
    </div>
  );
};
