import React, { useCallback, useMemo } from 'react';
import {
  useEdges,
  useInternalNode,
  useNodes,
  useNodesData,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import { X } from 'lucide-react';
import type {
  LinghuiAudioNodeProperties,
  LinghuiCanvasSelection,
  LinghuiImageAssetItem,
  LinghuiImageNodeProperties,
  LinghuiImageToolKey,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiNodeToolState,
  LinghuiNodeType,
  LinghuiStoryboardFrame,
  LinghuiVideoNodeProperties,
  LinghuiVideoToolKey,
} from '../../types/linghui';
import { AudioNodeEditor } from './AudioNodeEditor';
import { ImageNodeEditor } from './ImageNodeEditor';
import { ScriptNodeEditor } from './ScriptNodeEditor';
import { TextNodeEditor } from './TextNodeEditor';
import { VideoNodeEditor } from './VideoNodeEditor';
import { EditableCompactNodeLabel } from './nodes/EditableCompactNodeLabel';
import {
  buildLinghuiPromptReferenceItems,
  getOrderedIncomingReferenceEdges,
} from './linghuiPromptReferences';
import { resolveLinghuiImagePrimaryForNode } from './linghuiImageCollections';

interface LinghuiNodeEditorProps {
  selection: LinghuiCanvasSelection;
  activeTool: LinghuiNodeToolState;
  onToolChange: (tool: LinghuiNodeToolState) => void;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  onRunNode: (nodeId: string) => void;
  onDeriveScriptShots: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onGenerateScriptImages: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onGenerateScriptVideos: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onCreateDerivedImportImages: (nodeId: string, items: LinghuiImageAssetItem[]) => void;
  canvasRect: DOMRect | null;
  workspaceId: string | null;
  onAssetLibraryMutate?: () => void;
  onCloseEditor: () => void;
}

const IMAGE_TOOLBAR_ITEMS: Array<{ key: LinghuiImageToolKey; label: string }> = [
  { key: 'multi-angle', label: '多角度' },
  { key: 'outpaint', label: '扩图' },
  { key: 'relight', label: '打光' },
  { key: 'repaint', label: '重绘' },
  { key: 'grid-split', label: '宫格' },
];

const VIDEO_TOOLBAR_ITEMS: Array<{ key: LinghuiVideoToolKey; label: string }> = [
  { key: 'upscale', label: '高清' },
  { key: 'analyze', label: '解析' },
  { key: 'compose', label: '合成' },
];

const OVERLAY_MARGIN = 12;
const TOOLBAR_GAP = 10;
const MIN_PANEL_HEIGHT = 220;

function clamp(value: number, min: number, max: number): number {
  if (max <= min) return min;
  return Math.max(min, Math.min(value, max));
}

function resolveImageFallbackMode(properties: LinghuiImageNodeProperties): 'import' | 'generate' {
  if (properties.mode === 'import' || properties.mode === 'generate') {
    return properties.mode;
  }
  return String(properties.source ?? '').trim() ? 'import' : 'generate';
}

function getNodeTypeLabel(nodeType: LinghuiNodeType | null): string {
  switch (nodeType) {
    case 'linghui/image':
      return '图片节点';
    case 'linghui/video':
      return '视频节点';
    case 'linghui/audio':
      return '音频节点';
    case 'linghui/script':
      return '脚本节点';
    case 'linghui/text':
      return '文本节点';
    default:
      return '节点编辑';
  }
}

function getPanelWidth(nodeType: LinghuiNodeType | null, canvasWidth: number): number {
  const preferredWidth = nodeType === 'linghui/script' ? 760 : nodeType === 'linghui/audio' ? 540 : 560;
  return Math.min(preferredWidth, Math.max(320, canvasWidth - OVERLAY_MARGIN * 2));
}

function getPanelMaxHeight(nodeType: LinghuiNodeType | null, canvasHeight: number): number {
  const preferredHeight = nodeType === 'linghui/script' ? 760 : nodeType === 'linghui/text' ? 520 : 620;
  return Math.min(preferredHeight, Math.max(MIN_PANEL_HEIGHT, canvasHeight - OVERLAY_MARGIN * 2));
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
  onCreateDerivedImportImages,
  canvasRect,
  workspaceId,
  onAssetLibraryMutate,
  onCloseEditor,
}) => {
  const reactFlow = useReactFlow();
  const viewport = useViewport();
  const edges = useEdges();
  const nodes = useNodes();

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

  const nodeData = useMemo(() => (
    (nodeEntry?.data as unknown as LinghuiNodeData | undefined) ?? null
  ), [nodeEntry]);

  const nodeDataMap = useMemo(() => (
    new Map(nodes.map(node => [node.id, node.data as unknown as LinghuiNodeData]))
  ), [nodes]);

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
      const sourceNodeProps = sourceNodeData?.properties as unknown as LinghuiImageNodeProperties | undefined;
      const fallbackSource = sourceNodeData?.linghuiType === 'linghui/image' && sourceNodeProps
        && resolveImageFallbackMode(sourceNodeProps) === 'import'
        ? String(sourceNodeProps.source ?? '').trim()
        : '';
      const primaryImage = sourceNodeData ? resolveLinghuiImagePrimaryForNode(sourceNodeData, result) : null;
      const source = primaryImage?.source || fallbackSource;

      if (!source || dedupe.has(source)) continue;

      dedupe.add(source);
      refs.push({
        source,
        label: primaryImage?.label || sourceNodeData?.label || `参考 ${refs.length + 1}`,
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

  const activeImageTool = activeTool?.kind === 'image' && activeTool.nodeId === nodeId
    ? activeTool.tool
    : null;
  const activeVideoTool = activeTool?.kind === 'video' && activeTool.nodeId === nodeId
    ? activeTool.tool
    : null;

  const toolbarItems = nodeType === 'linghui/image'
    ? IMAGE_TOOLBAR_ITEMS
    : nodeType === 'linghui/video'
      ? VIDEO_TOOLBAR_ITEMS
      : [];

  const layout = useMemo(() => {
    if (!showEditor || !nodeId || !canvasRect || !internalNode) {
      return null;
    }

    const nodePosition = (internalNode as { internals?: { positionAbsolute?: { x: number; y: number } } }).internals?.positionAbsolute
      ?? internalNode.position;
    const nodeHeight = internalNode.measured?.height ?? internalNode.height ?? 96;
    const nodeWidth = internalNode.measured?.width ?? internalNode.width ?? 220;
    const screenPos = reactFlow.flowToScreenPosition({
      x: nodePosition.x,
      y: nodePosition.y,
    });
    const localNodeLeft = screenPos.x - canvasRect.left;
    const localNodeTop = screenPos.y - canvasRect.top;
    const nodeCenterX = localNodeLeft + nodeWidth / 2;

    const panelWidth = getPanelWidth(nodeType, canvasRect.width);
    const preferredPanelTop = localNodeTop + nodeHeight + TOOLBAR_GAP;
    const panelMaxHeight = getPanelMaxHeight(nodeType, canvasRect.height);
    const minVisibleTop = canvasRect.height - Math.min(panelMaxHeight, canvasRect.height - OVERLAY_MARGIN * 2) - OVERLAY_MARGIN;
    const panelTop = preferredPanelTop + MIN_PANEL_HEIGHT <= canvasRect.height - OVERLAY_MARGIN
      ? preferredPanelTop
      : Math.max(OVERLAY_MARGIN, minVisibleTop);
    const availablePanelHeight = canvasRect.height - panelTop - OVERLAY_MARGIN;
    const resolvedPanelHeight = Math.max(MIN_PANEL_HEIGHT, Math.min(panelMaxHeight, availablePanelHeight));
    const panelLeft = clamp(
      nodeCenterX - panelWidth / 2,
      OVERLAY_MARGIN,
      canvasRect.width - panelWidth - OVERLAY_MARGIN,
    );

    const toolbarPreferredWidth = toolbarItems.length > 0
      ? Math.max(248, toolbarItems.length * 88 + 108)
      : 248;
    const toolbarWidth = Math.min(
      toolbarPreferredWidth,
      Math.max(220, canvasRect.width - OVERLAY_MARGIN * 2),
    );
    const toolbarLeft = clamp(
      nodeCenterX - toolbarWidth / 2,
      OVERLAY_MARGIN,
      canvasRect.width - toolbarWidth - OVERLAY_MARGIN,
    );
    const toolbarTop = Math.max(OVERLAY_MARGIN, localNodeTop - 46 - TOOLBAR_GAP);

    return {
      panelLeft,
      panelTop,
      panelWidth,
      panelMaxHeight: resolvedPanelHeight,
      toolbarLeft,
      toolbarTop,
      toolbarWidth,
    };
  }, [canvasRect, internalNode, nodeId, nodeType, reactFlow, showEditor, toolbarItems.length, viewport]);

  const handleClose = useCallback(() => {
    onToolChange(null);
    onCloseEditor();
  }, [onCloseEditor, onToolChange]);

  if (!showEditor || !nodeId || !nodeData || !layout) {
    return null;
  }

  const renderToolbar = () => {
    if (nodeType === 'linghui/image') {
      return (
        <div className="linghuiNodeEditorToolRail">
          {IMAGE_TOOLBAR_ITEMS.map(item => (
            <button
              key={item.key}
              type="button"
              className={`linghuiNodeEditorToolButton ${activeImageTool === item.key ? 'isActive' : ''}`}
              onClick={() => onToolChange(activeImageTool === item.key ? null : { kind: 'image', nodeId, tool: item.key })}
            >
              {item.label}
            </button>
          ))}
        </div>
      );
    }

    if (nodeType === 'linghui/video') {
      return (
        <div className="linghuiNodeEditorToolRail">
          {VIDEO_TOOLBAR_ITEMS.map(item => (
            <button
              key={item.key}
              type="button"
              className={`linghuiNodeEditorToolButton ${activeVideoTool === item.key ? 'isActive' : ''}`}
              onClick={() => onToolChange(activeVideoTool === item.key ? null : { kind: 'video', nodeId, tool: item.key })}
            >
              {item.label}
            </button>
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="linghuiNodeEditorContainer">
      <div
        className="linghuiNodeEditorTopBar"
        style={{
          left: layout.toolbarLeft,
          top: layout.toolbarTop,
          width: layout.toolbarWidth,
        }}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="linghuiNodeEditorTopBarMeta">
          <EditableCompactNodeLabel
            nodeId={nodeId}
            label={nodeData.label}
            fallbackLabel={getNodeTypeLabel(nodeType)}
            variant="editor"
            title="双击重命名节点"
          />
          <div className="linghuiNodeEditorTopBarType">{getNodeTypeLabel(nodeType)}</div>
        </div>
        <div className="linghuiNodeEditorTopBarActions">
          {renderToolbar()}
          <button
            type="button"
            className="linghuiNodeEditorCloseButton"
            onClick={handleClose}
            aria-label="关闭节点编辑"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div
        className="linghuiNodeEditorMainSurface"
        style={{
          left: layout.panelLeft,
          top: layout.panelTop,
          width: layout.panelWidth,
          maxHeight: layout.panelMaxHeight,
        }}
        onMouseDown={event => event.stopPropagation()}
      >
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
            nodeRun={nodeRuns[nodeId]}
            referenceImages={referenceImages}
            promptReferences={promptReferences}
            workspaceId={workspaceId}
            activeTool={activeImageTool}
            onToolChange={tool => onToolChange(tool ? { kind: 'image', nodeId, tool } : null)}
            onCreateDerivedImportImages={items => onCreateDerivedImportImages(nodeId, items)}
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
            onToolChange={tool => onToolChange(tool ? { kind: 'video', nodeId, tool } : null)}
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
      </div>
    </div>
  );
};
