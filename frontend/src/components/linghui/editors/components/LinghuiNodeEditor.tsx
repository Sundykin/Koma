import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useEdges,
  useNodes,
  useNodesData,
} from '@xyflow/react';
import { Button, Dropdown, Modal, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { X } from 'lucide-react';
import type {
  LinghuiGridType,
  LinghuiImageAssetItem,
  LinghuiImageNodeProperties,
  LinghuiImageToolKey,
  LinghuiNodeData,
  LinghuiNodeType,
  LinghuiVideoNodeProperties,
  LinghuiVideoToolKey,
} from '../../../../types/linghui';
import { getLinghuiResultPrimaryMedia } from '../../../../types/linghui';
import { AgentNodeEditor } from './AgentNodeEditor';
import { AudioNodeEditor } from './AudioNodeEditor';
import { ImageNodeEditor } from './ImageNodeEditor';
import { ImageGeneratorNodeEditor } from './ImageGeneratorNodeEditor';
import { PanoramaNodeEditor } from './PanoramaNodeEditor';
import { Director3DNodeEditor } from './Director3DNodeEditor';
import { ScriptNodeEditor } from './ScriptNodeEditor';
import { StoryboardNodeEditor } from './StoryboardNodeEditor';
import { TextNodeEditor } from './TextNodeEditor';
import { VideoNodeEditor } from './VideoNodeEditor';
import { EditableCompactNodeLabel } from '../../nodes/components/EditableCompactNodeLabel';
import {
  useLinghuiCanvasZoom,
  useLinghuiGridSplitOverlay,
  useLinghuiNodeEditorApi,
} from '../../nodes/state/LinghuiNodeRunsContext';
import {
  buildLinghuiPromptReferenceItems,
  collectOrderedUpstreamReferenceNodeIds,
} from '../state/linghuiPromptReferences';
import { resolveLinghuiImagePrimaryForNode } from '../state/linghuiImageCollections';
import { buildLinghuiReferenceMediaBuckets } from '../state/linghuiReferenceMedia';
import { VIDEO_TOOL_PRESETS } from '../state/videoNodeEditorShared';
import { cssVars } from '../../../../theme/runtime';

interface LinghuiNodeEditorProps {
  nodeId: string;
  nodeType: LinghuiNodeType;
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

const GRID_SPLIT_OPTIONS: Array<{ value: LinghuiGridType; label: string; size: number }> = [
  { value: '2x2', label: '4格', size: 2 },
  { value: '3x3', label: '9格', size: 3 },
  { value: '4x4', label: '16格', size: 4 },
  { value: '5x5', label: '25格', size: 5 },
];

interface ImageToolPresetDef {
  label: string;
  description: string;
  promptSnippet: string;
  properties?: Partial<LinghuiImageNodeProperties>;
}

const IMAGE_TOOL_PRESETS: Record<LinghuiImageToolKey, {
  title: string;
  description: string;
  presets: ImageToolPresetDef[];
}> = {
  'multi-angle': {
    title: '多角度',
    description: '适合角色、商品或场景设定图，一次拉出多个稳定视角。',
    presets: [
      {
        label: '角色四视图',
        description: '正、侧、背、3/4 视角的角色设定图。',
        promptSnippet: '角色四视图设定图，正面、左侧、背面、三分之四视角，服装、发型与材质一致，背景简洁。',
        properties: { gridType: '2x2', batchCount: 4, aspectRatio: '3:4' },
      },
      {
        label: '商品多面展示',
        description: '适合电商或工业设计的结构表达。',
        promptSnippet: '同一商品的多面展示图，突出材质、结构和细节，角度清晰且统一。',
        properties: { gridType: '2x2', batchCount: 4, aspectRatio: '1:1' },
      },
    ],
  },
  outpaint: {
    title: '扩图',
    description: '把现有构图延展成海报、横幅或竖版画面。',
    presets: [
      {
        label: '横向扩图',
        description: '扩成横版场景，补足环境空间。',
        promptSnippet: '横向扩图，补足主体两侧环境、前后景关系和纵深层次，保持主体位置稳定。',
        properties: { aspectRatio: '16:9', resolution: '2K' },
      },
      {
        label: '海报延展',
        description: '增强留白和标题区，适合封面设计。',
        promptSnippet: '海报式扩图，保留主体视觉焦点，预留标题空间和排版留白，背景细节丰富但不喧宾夺主。',
        properties: { aspectRatio: '4:3', resolution: '2K' },
      },
    ],
  },
  relight: {
    title: '打光',
    description: '快速为画面添加更明确的光比和情绪氛围。',
    presets: [
      {
        label: '电影补光',
        description: '强调主光、边缘光和皮肤层次。',
        promptSnippet: '电影级补光，主体面部和轮廓光干净，皮肤与材质细节保留，层次分明。',
        properties: { resolution: '2K' },
      },
      {
        label: '霓虹夜景',
        description: '偏赛博与高对比氛围光。',
        promptSnippet: '霓虹夜景光效，冷暖对比明显，反光与氛围雾层次丰富，主体仍然清晰。',
        properties: { resolution: '2K' },
      },
    ],
  },
  repaint: {
    title: '重绘',
    description: '把当前节点切到局部修复、替换和细节统一方向。',
    presets: [
      {
        label: '修复细节',
        description: '优先修手部、五官和边缘。',
        promptSnippet: '细节修复，优化手部、五官、发丝和服装边缘，整体风格保持一致。',
      },
      {
        label: '替换背景',
        description: '保留主体，重绘背景氛围。',
        promptSnippet: '保留主体身份与姿态，仅重绘背景环境与氛围元素，增强故事感与空间层次。',
      },
    ],
  },
  'grid-split': {
    title: '宫格切分',
    description: '把当前主图切成 4 / 9 / 16 / 25 宫格，再选中若干格子继续生成节点。',
    presets: [],
  },
};

const PANEL_GAP = 8;
const TOOLBAR_STANDOFF = 6;

function getNodeTypeLabel(nodeType: LinghuiNodeType): string {
  switch (nodeType) {
    case 'linghui/image':
      return '图片节点';
    case 'linghui/image-generator':
      return '图片生成器';
    case 'linghui/panorama':
      return '全景节点';
    case 'linghui/agent':
      return 'Agent 节点';
    case 'linghui/video':
      return '视频节点';
    case 'linghui/audio':
      return '音频节点';
    case 'linghui/script':
      return '脚本节点';
    case 'linghui/storyboard':
      return '故事板节点';
    case 'linghui/text':
      return '文本节点';
    case 'linghui/director3d':
      return '3D 导演工作台';
    default:
      return '节点编辑';
  }
}

function getPanelWidth(nodeType: LinghuiNodeType): number {
  if (nodeType === 'linghui/script') return 760;
  if (nodeType === 'linghui/storyboard') return 760;
  if (nodeType === 'linghui/audio') return 540;
  if (nodeType === 'linghui/agent') return 620;
  if (nodeType === 'linghui/director3d') return 1080;
  return 560;
}

function getPanelMaxHeight(nodeType: LinghuiNodeType): number {
  if (nodeType === 'linghui/script') return 760;
  if (nodeType === 'linghui/storyboard') return 760;
  if (nodeType === 'linghui/agent') return 640;
  if (nodeType === 'linghui/text') return 520;
  if (nodeType === 'linghui/director3d') return 720;
  if (nodeType === 'linghui/image-generator') return 520;
  return 620;
}

function getViewportBoundWidth(width: number): string {
  return `min(${width}px, calc(100vw - 48px))`;
}

function getViewportBoundHeight(height: number): string {
  return `min(${height}px, calc(100vh - 112px))`;
}

export const LinghuiNodeEditor: React.FC<LinghuiNodeEditorProps> = ({
  nodeId,
  nodeType,
}) => {
  const {
    selection,
    activeTool,
    setActiveTool,
    closeEditor,
    nodeRuns,
    workspaceId,
    onAssetLibraryMutate,
    onRunNode,
    onDeriveScriptShots,
    onGenerateScriptImages,
    onGenerateScriptVideos,
    onExecuteMultiAngle,
    onApplyImageToolPreset,
    onSetGridSplitType,
    onClearGridSplitCells,
    onExecuteGridSplit,
    onGenerateImageFromController,
    gridSplitUpscaleFactor,
    onSetGridSplitUpscaleFactor,
    onRevertGridSplit,
  } = useLinghuiNodeEditorApi();
  const canvasZoom = useLinghuiCanvasZoom();
  const edges = useEdges();
  const nodes = useNodes();
  const nodeEntry = useNodesData(nodeId);

  const isVisible = selection?.kind === 'node' && selection.nodeId === nodeId && selection.nodeType === nodeType;
  const nodeData = useMemo(() => (
    (nodeEntry?.data as unknown as LinghuiNodeData | undefined) ?? null
  ), [nodeEntry]);

  const nodeDataMap = useMemo(() => (
    new Map(nodes.map(node => [node.id, node.data as unknown as LinghuiNodeData]))
  ), [nodes]);
  const referenceEdges = useMemo(() => (
    edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    }))
  ), [edges]);
  const upstreamNodeIds = useMemo(() => (
    collectOrderedUpstreamReferenceNodeIds(nodeId, referenceEdges)
  ), [nodeId, referenceEdges]);

  const referenceMedia = useMemo(() => (
    buildLinghuiReferenceMediaBuckets({
      upstreamNodeIds,
      nodeDataMap,
      getNodeResult(upstreamNodeId) {
        return nodeRuns[upstreamNodeId]?.result;
      },
    })
  ), [nodeDataMap, nodeRuns, upstreamNodeIds]);
  const referenceImages = referenceMedia.images;
  const referenceVideos = referenceMedia.videos;
  const referenceAudios = referenceMedia.audios;

  const promptReferences = useMemo(() => (
    buildLinghuiPromptReferenceItems({
      nodeId,
      nodes: nodes.map(node => ({
        id: node.id,
        data: node.data as unknown as LinghuiNodeData,
      })),
      edges: referenceEdges,
      getNodeResult(upstreamNodeId) {
        return nodeRuns[upstreamNodeId]?.result;
      },
    })
  ), [nodeId, nodeRuns, nodes, referenceEdges]);
  const currentPrimaryImage = useMemo(() => (
    nodeData ? resolveLinghuiImagePrimaryForNode(nodeData, nodeRuns[nodeId]?.result) : null
  ), [nodeData, nodeId, nodeRuns]);
  const hasCurrentImage = Boolean(String(currentPrimaryImage?.source ?? '').trim());
  const currentPrimaryVideo = useMemo(() => (
    nodeType === 'linghui/video' ? getLinghuiResultPrimaryMedia(nodeRuns[nodeId]?.result) : null
  ), [nodeId, nodeRuns, nodeType]);
  const isVideoPassThroughNode = nodeType === 'linghui/video'
    && Boolean(String((nodeData?.properties as unknown as LinghuiVideoNodeProperties | undefined)?.source ?? '').trim());
  const hasCurrentVideo = nodeType === 'linghui/video'
    && Boolean(String(
      currentPrimaryVideo?.source
      ?? (nodeData?.properties as unknown as LinghuiVideoNodeProperties | undefined)?.source
      ?? '',
    ).trim());
  const isAgentNode = nodeType === 'linghui/agent';

  const activeImageTool = activeTool?.kind === 'image' && activeTool.nodeId === nodeId
    ? activeTool.tool
    : null;
  const activeVideoTool = activeTool?.kind === 'video' && activeTool.nodeId === nodeId
    ? activeTool.tool
    : null;
  const isGridSplitMode = nodeType === 'linghui/image' && activeImageTool === 'grid-split';
  const useMinimalTopBar = nodeType === 'linghui/image' && !hasCurrentImage && !isGridSplitMode;
  const safeZoom = Number.isFinite(canvasZoom) && canvasZoom > 0 ? canvasZoom : 1;
  const inverseZoom = 1 / safeZoom;
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);

  const gridSplitState = useLinghuiGridSplitOverlay(nodeId);
  const splitGridSize = gridSplitState?.gridSize ?? 2;
  const selectedSplitCells = gridSplitState?.selectedCells ?? [];
  const splitGridType = GRID_SPLIT_OPTIONS.find(option => option.size === splitGridSize)?.value ?? '2x2';

  const toolbarWidth = isGridSplitMode
    ? 720
    : nodeType === 'linghui/video'
      ? (isVideoPassThroughNode || !hasCurrentVideo ? 248 : Math.max(248, VIDEO_TOOLBAR_ITEMS.length * 88 + 108))
      : nodeType === 'linghui/image'
        ? (useMinimalTopBar ? 240 : Math.max(248, IMAGE_TOOLBAR_ITEMS.length * 88 + 108))
        : 248;
  const panelGap = nodeType === 'linghui/image' ? 0 : PANEL_GAP;

  const toolbarStyle = useMemo(() => cssVars({
    '--linghui-node-editor-bottom': `calc(100% + ${(TOOLBAR_STANDOFF / safeZoom).toFixed(3)}px)`,
    '--linghui-node-editor-width': getViewportBoundWidth(toolbarWidth),
    '--linghui-node-editor-scale': inverseZoom.toFixed(4),
  }), [inverseZoom, safeZoom, toolbarWidth]);

  const panelStyle = useMemo(() => cssVars({
    '--linghui-node-editor-top': `calc(100% + ${(panelGap / safeZoom).toFixed(3)}px)`,
    '--linghui-node-editor-width': getViewportBoundWidth(getPanelWidth(nodeType)),
    '--linghui-node-editor-max-height': getViewportBoundHeight(getPanelMaxHeight(nodeType)),
    '--linghui-node-editor-scale': inverseZoom.toFixed(4),
  }), [inverseZoom, nodeType, panelGap, safeZoom]);

  const handleClose = useCallback(() => {
    setOpenDropdownKey(null);
    setActiveTool(null);
    closeEditor();
  }, [closeEditor, setActiveTool]);

  const handleStopPropagation = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const handleDropdownOpenChange = useCallback((key: string, nextOpen: boolean) => {
    setOpenDropdownKey(current => {
      if (nextOpen) {
        return key;
      }
      return current === key ? null : current;
    });
  }, []);

  const handleDropdownTriggerClick = useCallback((event: React.MouseEvent<HTMLElement>, key: string) => {
    event.stopPropagation();
    setOpenDropdownKey(current => current === key ? null : key);
  }, []);

  const resolveDropdownContainer = useCallback((triggerNode: HTMLElement) => (
    (triggerNode.closest('.linghuiNodeEditorTopBar') as HTMLElement | null)
    ?? triggerNode.parentElement
    ?? triggerNode.ownerDocument.body
  ), []);

  useEffect(() => {
    setOpenDropdownKey(null);
  }, [isVisible, isGridSplitMode, nodeId, nodeType]);

  useEffect(() => {
    if (isVideoPassThroughNode && activeTool?.kind === 'video' && activeTool.nodeId === nodeId) {
      setActiveTool(null);
    }
  }, [activeTool, isVideoPassThroughNode, nodeId, setActiveTool]);

  useEffect(() => {
    if (!hasCurrentVideo && activeTool?.kind === 'video' && activeTool.nodeId === nodeId) {
      setActiveTool(null);
    }
  }, [activeTool, hasCurrentVideo, nodeId, setActiveTool]);

  useEffect(() => {
    if (!hasCurrentImage && activeTool?.kind === 'image' && activeTool.nodeId === nodeId && activeTool.tool === 'multi-angle') {
      setActiveTool(null);
    }
  }, [activeTool, hasCurrentImage, nodeId, setActiveTool]);

  const gridSplitMenuItems = useMemo<MenuProps['items']>(() => (
    GRID_SPLIT_OPTIONS.map(option => ({
      key: option.value,
      label: option.label,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        setOpenDropdownKey(null);
        onSetGridSplitType?.(option.value);
        onClearGridSplitCells?.();
        setActiveTool({ kind: 'image', nodeId, tool: 'grid-split' });
      },
    }))
  ), [nodeId, onClearGridSplitCells, onSetGridSplitType, setActiveTool]);

  const gridSplitUpscaleMenuItems = useMemo<MenuProps['items']>(() => (
    [2, 4].map(value => ({
      key: String(value),
      label: `${value}x`,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        setOpenDropdownKey(null);
        onSetGridSplitUpscaleFactor?.(value as 2 | 4);
      },
    }))
  ), [onSetGridSplitUpscaleFactor]);

  const createPresetMenuItems = useCallback((toolKey: LinghuiImageToolKey): MenuProps['items'] => {
    const toolDef = IMAGE_TOOL_PRESETS[toolKey];
    if (!toolDef) {
      return [];
    }

    if (toolKey === 'grid-split') {
      return gridSplitMenuItems;
    }

    return toolDef.presets.map(preset => ({
      key: `${toolKey}-${preset.label}`,
      label: (
        <div className="linghuiNodeEditorDropdownOption">
          <div className="linghuiNodeEditorDropdownTitle">{preset.label}</div>
          <div className="linghuiNodeEditorDropdownDesc">{preset.description}</div>
        </div>
      ),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        setOpenDropdownKey(null);
        onApplyImageToolPreset?.(preset);
      },
    }));
  }, [gridSplitMenuItems, onApplyImageToolPreset]);

  if (!isVisible || !nodeData) {
    return null;
  }

  if (nodeType === 'linghui/director3d') {
    return (
      <Modal
        open
        onCancel={handleClose}
        footer={null}
        width="100vw"
        centered={false}
        destroyOnClose
        className="linghuiDirector3DModal"
        rootClassName="linghuiDirector3DModal"
      >
        <Director3DNodeEditor
          nodeId={nodeId}
          nodeData={nodeData}
          nodeRun={nodeRuns[nodeId]}
          onRun={() => onRunNode(nodeId)}
        />
      </Modal>
    );
  }

  const renderToolbar = () => {
    if (nodeType === 'linghui/image') {
      if (!hasCurrentImage) {
        return null;
      }

      if (isGridSplitMode) {
        return (
          <div className="linghuiNodeEditorGridToolRail">
            <Dropdown
              open={openDropdownKey === 'grid-split:type'}
              trigger={[]}
              classNames={{ root: 'linghuiNodeEditorDropdownMenu' }}
              getPopupContainer={resolveDropdownContainer}
              onOpenChange={(nextOpen) => handleDropdownOpenChange('grid-split:type', nextOpen)}
              menu={{
                items: gridSplitMenuItems,
                selectable: true,
                selectedKeys: [splitGridType],
              }}
            >
              <Button
                size="small"
                className="linghuiNodeEditorToolButton isActive"
                onClick={(event) => handleDropdownTriggerClick(event, 'grid-split:type')}
              >
                宫格 {GRID_SPLIT_OPTIONS.find(option => option.value === splitGridType)?.label ?? '4格'}
              </Button>
            </Dropdown>
            <div className="linghuiNodeEditorGridStatus">
              已选择 {selectedSplitCells.length} 个宫格
            </div>
            <Button
              type="primary"
              size="small"
              disabled={selectedSplitCells.length === 0}
              onClick={() => onExecuteGridSplit?.()}
            >
              创建生图节点
            </Button>
            <Dropdown
              open={openDropdownKey === 'grid-split:upscale'}
              trigger={[]}
              classNames={{ root: 'linghuiNodeEditorDropdownMenu' }}
              getPopupContainer={resolveDropdownContainer}
              onOpenChange={(nextOpen) => handleDropdownOpenChange('grid-split:upscale', nextOpen)}
              menu={{
                items: gridSplitUpscaleMenuItems,
                selectable: true,
                selectedKeys: [String(gridSplitUpscaleFactor)],
              }}
            >
              <Button
                size="small"
                className="linghuiNodeEditorToolButton"
                onClick={(event) => handleDropdownTriggerClick(event, 'grid-split:upscale')}
              >
                高清 {gridSplitUpscaleFactor}x
              </Button>
            </Dropdown>
            <Button
              size="small"
              className="linghuiNodeEditorToolButton"
              onClick={() => onRevertGridSplit?.()}
            >
              回退
            </Button>
          </div>
        );
      }

      return (
        <div className="linghuiNodeEditorToolRail">
          {IMAGE_TOOLBAR_ITEMS.map(item => {
            if (item.key === 'multi-angle') {
              if (!hasCurrentImage) {
                return null;
              }

              return (
                <Button
                  key={item.key}
                  size="small"
                  className={`linghuiNodeEditorToolButton ${activeImageTool === item.key ? 'isActive' : ''}`}
                  onClick={() => setActiveTool(activeImageTool === item.key ? null : { kind: 'image', nodeId, tool: item.key })}
                >
                  {item.label}
                </Button>
              );
            }

            return (
              <Dropdown
                key={item.key}
                open={openDropdownKey === `image-tool:${item.key}`}
                trigger={[]}
                classNames={{ root: 'linghuiNodeEditorDropdownMenu' }}
                getPopupContainer={resolveDropdownContainer}
                onOpenChange={(nextOpen) => handleDropdownOpenChange(`image-tool:${item.key}`, nextOpen)}
                menu={{ items: createPresetMenuItems(item.key) }}
              >
                <Button
                  size="small"
                  className={`linghuiNodeEditorToolButton ${activeImageTool === item.key ? 'isActive' : ''}`}
                  onClick={(event) => handleDropdownTriggerClick(event, `image-tool:${item.key}`)}
                >
                  {item.label}
                </Button>
              </Dropdown>
            );
          })}
        </div>
      );
    }

    if (nodeType === 'linghui/video') {
      if (isVideoPassThroughNode || !hasCurrentVideo) {
        return null;
      }

      return (
        <div className="linghuiNodeEditorToolRail">
          {VIDEO_TOOLBAR_ITEMS.map(item => (
            <Tooltip
              key={item.key}
              title={VIDEO_TOOL_PRESETS[item.key].description}
            >
              <button
                type="button"
                className={`linghuiNodeEditorToolButton ${activeVideoTool === item.key ? 'isActive' : ''}`}
                onClick={() => setActiveTool(activeVideoTool === item.key ? null : { kind: 'video', nodeId, tool: item.key })}
              >
                {item.label}
              </button>
            </Tooltip>
          ))}
        </div>
      );
    }

    return null;
  };

  const toolbarContent = renderToolbar();

  return (
    <div className="linghuiNodeEditorContainer nodrag nopan nowheel">
      <div
        className={`linghuiNodeEditorTopBar ${useMinimalTopBar ? 'isMinimal' : ''}`}
        style={toolbarStyle}
        onClick={handleStopPropagation}
        onMouseDown={handleStopPropagation}
        onPointerDown={handleStopPropagation}
      >
        <div className="linghuiNodeEditorTopBarMeta">
          <EditableCompactNodeLabel
            nodeId={nodeId}
            label={nodeData.label}
            fallbackLabel={getNodeTypeLabel(nodeType)}
            variant="editor"
            title="双击重命名节点"
          />
          {!useMinimalTopBar && (
            <div className="linghuiNodeEditorTopBarType">{getNodeTypeLabel(nodeType)}</div>
          )}
        </div>
        <div className="linghuiNodeEditorTopBarActions">
          {toolbarContent}
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

      {!isGridSplitMode && (
        <div
          className="linghuiNodeEditorMainSurface"
          style={panelStyle}
          onClick={handleStopPropagation}
          onMouseDown={handleStopPropagation}
          onPointerDown={handleStopPropagation}
        >
          {nodeType === 'linghui/text' && (
            <TextNodeEditor
              nodeId={nodeId}
              nodeData={nodeData}
              nodeRun={nodeRuns[nodeId]}
              promptReferences={promptReferences}
              onRun={() => onRunNode(nodeId)}
            />
          )}
          {isAgentNode && (
            <AgentNodeEditor
              nodeId={nodeId}
              nodeData={nodeData}
              nodeRun={nodeRuns[nodeId]}
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
              onToolChange={tool => setActiveTool(tool ? { kind: 'image', nodeId, tool } : null)}
              onExecuteMultiAngle={options => onExecuteMultiAngle?.(options)}
              onRun={() => onRunNode(nodeId)}
            />
          )}
          {nodeType === 'linghui/image-generator' && (
            <ImageGeneratorNodeEditor
              nodeId={nodeId}
              nodeData={nodeData}
              promptReferences={promptReferences}
              onGenerate={() => onGenerateImageFromController?.(nodeId) ?? null}
            />
          )}
          {nodeType === 'linghui/panorama' && (
            <PanoramaNodeEditor
              nodeId={nodeId}
              nodeData={nodeData}
              nodeRun={nodeRuns[nodeId]}
              referenceImages={referenceImages}
              promptReferences={promptReferences}
              workspaceId={workspaceId}
              activeTool={activeImageTool}
              onToolChange={tool => setActiveTool(tool ? { kind: 'image', nodeId, tool } : null)}
              onExecuteMultiAngle={options => onExecuteMultiAngle?.(options)}
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
              onToolChange={tool => setActiveTool(tool ? { kind: 'video', nodeId, tool } : null)}
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
          {nodeType === 'linghui/storyboard' && (
            <StoryboardNodeEditor
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
      )}
    </div>
  );
};
