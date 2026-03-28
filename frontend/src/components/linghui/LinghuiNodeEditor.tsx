import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useEdges,
  useInternalNode,
  useNodes,
  useNodesData,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import { Expand, FoldHorizontal, PanelsTopLeft } from 'lucide-react';
import type {
  LinghuiAudioNodeProperties,
  LinghuiCanvasSelection,
  LinghuiImageToolKey,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiNodeToolState,
  LinghuiNodeViewMode,
  LinghuiVideoNodeProperties,
  LinghuiVideoToolKey,
  LinghuiStoryboardFrame,
} from '../../types/linghui';
import { TextNodeEditor } from './TextNodeEditor';
import { ImageNodeEditor } from './ImageNodeEditor';
import { VideoNodeEditor } from './VideoNodeEditor';
import { AudioNodeEditor } from './AudioNodeEditor';
import { ScriptNodeEditor } from './ScriptNodeEditor';
import {
  buildLinghuiPromptReferenceItems,
  getOrderedIncomingReferenceEdges,
} from './linghuiPromptReferences';
import {
  getPreferredLinghuiEditorMode,
  resolveLinghuiNodeViewMode,
} from './linghuiNodeViewMode';
import { useLinghuiNodeMutation } from './nodes/LinghuiNodeRunsContext';

interface LinghuiNodeEditorProps {
  selection: LinghuiCanvasSelection;
  activeTool: LinghuiNodeToolState;
  onToolChange: (tool: LinghuiNodeToolState) => void;
  nodeRuns: Record<string, import('../../types/linghui').LinghuiNodeRunState>;
  onRunNode: (nodeId: string) => void;
  onDeriveScriptShots: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onGenerateScriptImages: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onGenerateScriptVideos: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  canvasRect: DOMRect | null;
  workspaceId: string | null;
  onAssetLibraryMutate?: () => void;
  onCloseEditor: () => void;
}

export const LinghuiNodeEditor: React.FC<LinghuiNodeEditorProps> = ({
  selection,
  activeTool,
  onToolChange,
  nodeRuns,
  onRunNode,
  onDeriveScriptShots,
  onGenerateScriptImages,
  onGenerateScriptVideos,
  canvasRect,
  workspaceId,
  onAssetLibraryMutate,
  onCloseEditor,
}) => {
  const reactFlow = useReactFlow();
  const viewport = useViewport();
  const edges = useEdges();
  const nodes = useNodes();
  const { updateNodeData } = useLinghuiNodeMutation();
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [panelMode, setPanelMode] = useState<'light' | 'immersive'>('light');

  const nodeId = selection?.kind === 'node' ? selection.nodeId : null;
  const nodeType = selection?.kind === 'node' ? selection.nodeType : null;
  const nodeEntry = useNodesData(nodeId ?? '');
  const internalNode = useInternalNode(nodeId ?? '');

  const showEditor = (
    nodeType === 'linghui/text' ||
    nodeType === 'linghui/image' ||
    nodeType === 'linghui/video' ||
    nodeType === 'linghui/audio' ||
    nodeType === 'linghui/script'
  );

  const nodeData = useMemo(() => {
    return (nodeEntry?.data as unknown as LinghuiNodeData | undefined) ?? null;
  }, [nodeEntry]);
  const nodeViewMode = resolveLinghuiNodeViewMode(nodeData?.viewMode);

  const nodeDataMap = useMemo(() => {
    return new Map(
      nodes.map(node => [node.id, node.data as unknown as LinghuiNodeData]),
    );
  }, [nodes]);

  useEffect(() => {
    setPanelMode(getPreferredLinghuiEditorMode(nodeData));
  }, [nodeId, nodeData]);

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
      const fallbackSource = sourceNodeData?.linghuiType === 'linghui/image'
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

    const panelWidth = nodeType === 'linghui/script' ? 720 : 560;
    const panelHeight = nodeType === 'linghui/text'
      ? 460
      : nodeType === 'linghui/script'
        ? 640
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

  const panelWidth = nodeType === 'linghui/script' ? 720 : 560;
  const immersiveWidth = nodeType === 'linghui/script'
    ? 1240
    : nodeType === 'linghui/text'
      ? 960
      : nodeType === 'linghui/audio'
        ? 920
        : 1100;
  const activeImageTool = activeTool?.kind === 'image' && activeTool.nodeId === nodeId
    ? activeTool.tool
    : null;
  const activeVideoTool = activeTool?.kind === 'video' && activeTool.nodeId === nodeId
    ? activeTool.tool
    : null;
  const activeViewMode: LinghuiNodeViewMode = panelMode === 'immersive'
    ? 'immersive'
    : nodeViewMode === 'collapsed'
      ? 'collapsed'
      : 'light';

  const updateViewMode = useCallback((viewMode: LinghuiNodeViewMode) => {
    if (!nodeId) {
      return;
    }
    updateNodeData(nodeId, prev => ({
      ...prev,
      viewMode,
    }), { markStale: false });
  }, [nodeId, updateNodeData]);

  const handleCollapse = useCallback(() => {
    updateViewMode('collapsed');
    onCloseEditor();
  }, [onCloseEditor, updateViewMode]);

  const handleSwitchLight = useCallback(() => {
    updateViewMode('light');
    setPanelMode('light');
  }, [updateViewMode]);

  const handleSwitchImmersive = useCallback(() => {
    updateViewMode('immersive');
    setPanelMode('immersive');
  }, [updateViewMode]);

  useEffect(() => {
    if (panelMode !== 'immersive') {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleSwitchLight();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSwitchLight, panelMode]);

  if (!showEditor || !nodeId || !nodeData || !panelPos) return null;

  const editorContent = (
    <>
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
          nodeRun={nodeRuns[nodeId]}
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
          nodeRun={nodeRuns[nodeId]}
          promptReferences={promptReferences}
          workspaceId={workspaceId}
          onAssetLibraryMutate={onAssetLibraryMutate}
          onRun={() => onRunNode(nodeId)}
        />
      )}
      {nodeType === 'linghui/script' && (
        <ScriptNodeEditor
          nodeId={nodeId}
          nodeData={nodeData}
          nodeRun={nodeRuns[nodeId]}
          promptReferences={promptReferences}
          onRun={() => onRunNode(nodeId)}
          onDeriveShots={shots => onDeriveScriptShots(nodeId, shots)}
          onGenerateImages={shots => onGenerateScriptImages(nodeId, shots)}
          onGenerateVideos={shots => onGenerateScriptVideos(nodeId, shots)}
        />
      )}
    </>
  );

  const editorModeRail = (
    <div className="linghuiNodeEditorModeBar" onMouseDown={event => event.stopPropagation()}>
      <button
        type="button"
        className={`linghuiNodeEditorModeButton ${activeViewMode === 'collapsed' ? 'isActive' : ''}`}
        onClick={handleCollapse}
        title="折叠为紧凑节点卡片"
      >
        <FoldHorizontal size={14} />
        折叠态
      </button>
      <button
        type="button"
        className={`linghuiNodeEditorModeButton ${activeViewMode === 'light' ? 'isActive' : ''}`}
        onClick={handleSwitchLight}
        title="打开跟随节点的轻编辑面板"
      >
        <PanelsTopLeft size={14} />
        轻编辑态
      </button>
      <button
        type="button"
        className={`linghuiNodeEditorModeButton ${activeViewMode === 'immersive' ? 'isActive' : ''}`}
        onClick={handleSwitchImmersive}
        title="切换到沉浸式全屏编辑"
      >
        <Expand size={14} />
        沉浸式态
      </button>
    </div>
  );

  if (panelMode === 'immersive') {
    return (
      <div className="linghuiNodeEditorBackdrop" onMouseDown={event => event.stopPropagation()}>
        <div
          className="linghuiNodeEditorImmersiveShell"
          style={{ width: `min(${immersiveWidth}px, calc(100vw - 48px))` }}
          onMouseDown={event => event.stopPropagation()}
        >
          {editorModeRail}
          <div className="linghuiNodeEditorImmersiveBody">
            {editorContent}
          </div>
        </div>
      </div>
    );
  }

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
      {editorModeRail}
      {editorContent}
    </div>
  );
};
