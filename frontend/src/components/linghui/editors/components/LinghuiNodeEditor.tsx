import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  useEdges,
  useNodes,
  useNodesData,
} from '@xyflow/react';
import { App, Button, Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  AudioWaveform,
  Captions,
  ChevronDown,
  ScanLine,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  LinghuiGridType,
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
import { LinghuiImageNodeFloatingToolbar } from '../../nodes/components/LinghuiImageNodeFloatingToolbar';
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

/**
 * 导入素材节点（mode='import'）下需要隐藏的工具：
 * - focus / mark 是 in-place 二次生成工具，依赖 prompt + executor 生成流程；
 *   素材节点 executor 直接返回上传图片，这两个工具点击后只会保存状态但不会真的执行任何修复/重绘，属于假按钮。
 *   其余工具都是"派生下游新节点"行为，对素材节点同样有意义，因此保留。
 */
const IMPORT_HIDDEN_IMAGE_TOOLS = new Set<LinghuiImageToolKey>(['focus', 'mark']);

/** 对齐 LibTV 视频工具条（截图）：剪辑 / 高清 / 解析 / 智能去字幕 / 音频分离。 */
const VIDEO_TOOLBAR_ITEMS: Array<{ key: LinghuiVideoToolKey; label: string }> = [
  { key: 'clip', label: '剪辑' },
  { key: 'upscale', label: '高清' },
  { key: 'analyze', label: '解析' },
  { key: 'subtitle-remove', label: '智能去字幕' },
  { key: 'audio-separation', label: '音频分离' },
];

const GRID_SPLIT_OPTIONS: Array<{ value: LinghuiGridType; label: string; size: number }> = [
  { value: '2x2', label: '4格', size: 2 },
  { value: '3x3', label: '9格', size: 3 },
  { value: '4x4', label: '16格', size: 4 },
  { value: '5x5', label: '25格', size: 5 },
];

const PANEL_GAP = 8;
const TOOLBAR_STANDOFF = 6;

function getNodeTypeLabel(nodeType: LinghuiNodeType): string {
  switch (nodeType) {
    case 'linghui/image':
      return '图片节点';
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
    gridSplitUpscaleFactor,
    onSetGridSplitUpscaleFactor,
    onRevertGridSplit,
    onSeparateVideoAudio,
  } = useLinghuiNodeEditorApi();
  const { message } = App.useApp();
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
  const isLibTVImageToolPanelOpen = nodeType === 'linghui/image'
    && hasCurrentImage
    && ['multi-angle', 'relight', 'outpaint', 'repaint'].includes(activeImageTool ?? '');
  const isImageToolbarOnlyTopBar = nodeType === 'linghui/image' && hasCurrentImage && !isGridSplitMode;
  const useMinimalTopBar = nodeType === 'linghui/image' && !hasCurrentImage && !isGridSplitMode;
  // 区分"导入素材节点"和"生成节点"。前者执行器只是回放上传图，不消费 prompt，
  // 因此 in-place 二次生成工具（focus/mark）对它无意义，必须在工具条与编辑器面板里都拦截掉。
  const isImportImageNode = useMemo(() => {
    if (nodeType !== 'linghui/image') return false;
    const rawProps = nodeData?.properties as unknown as Partial<LinghuiImageNodeProperties> | undefined;
    if (!rawProps) return false;
    if (rawProps.mode === 'import' || rawProps.mode === 'generate') {
      return rawProps.mode === 'import';
    }
    return Boolean(String(rawProps.source ?? '').trim());
  }, [nodeData, nodeType]);
  const safeZoom = Number.isFinite(canvasZoom) && canvasZoom > 0 ? canvasZoom : 1;
  const inverseZoom = 1 / safeZoom;
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);

  const gridSplitState = useLinghuiGridSplitOverlay(nodeId);
  const splitGridSize = gridSplitState?.gridSize ?? 2;
  const selectedSplitCells = gridSplitState?.selectedCells ?? [];
  const splitGridType = GRID_SPLIT_OPTIONS.find(option => option.size === splitGridSize)?.value ?? '2x2';

  const toolbarWidth = isGridSplitMode
    ? 640
    : nodeType === 'linghui/video'
      ? (isVideoPassThroughNode || !hasCurrentVideo ? 248 : Math.max(248, VIDEO_TOOLBAR_ITEMS.length * 88 + 108))
      : nodeType === 'linghui/image'
        ? (useMinimalTopBar ? 240 : 500)
        : 248;
  const panelGap = nodeType === 'linghui/image' ? 0 : PANEL_GAP;
  const panelWidth = isLibTVImageToolPanelOpen
    ? activeImageTool === 'relight'
      ? 640
      : activeImageTool === 'multi-angle'
        ? 560
        : 640
    : getPanelWidth(nodeType);
  const panelMaxHeight = isLibTVImageToolPanelOpen ? 620 : getPanelMaxHeight(nodeType);

  const toolbarStyle = useMemo(() => cssVars({
    '--linghui-node-editor-bottom': `calc(100% + ${(TOOLBAR_STANDOFF / safeZoom).toFixed(3)}px)`,
    '--linghui-node-editor-width': getViewportBoundWidth(toolbarWidth),
    '--linghui-node-editor-scale': inverseZoom.toFixed(4),
  }), [inverseZoom, safeZoom, toolbarWidth]);

  const panelStyle = useMemo(() => cssVars({
    '--linghui-node-editor-top': `calc(100% + ${(panelGap / safeZoom).toFixed(3)}px)`,
    '--linghui-node-editor-width': getViewportBoundWidth(panelWidth),
    '--linghui-node-editor-max-height': getViewportBoundHeight(panelMaxHeight),
    '--linghui-node-editor-scale': inverseZoom.toFixed(4),
  }), [inverseZoom, panelGap, panelMaxHeight, panelWidth, safeZoom]);

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
    if (
      !hasCurrentImage
      && activeTool?.kind === 'image'
      && activeTool.nodeId === nodeId
      && (activeTool.tool === 'focus' || activeTool.tool === 'mark' || activeTool.tool === 'multi-angle')
    ) {
      setActiveTool(null);
    }
  }, [activeTool, hasCurrentImage, nodeId, setActiveTool]);

  // 导入素材节点禁止 focus/mark：若历史状态残留，立即关闭，避免编辑器渲染无效面板。
  useEffect(() => {
    if (
      isImportImageNode
      && activeTool?.kind === 'image'
      && activeTool.nodeId === nodeId
      && IMPORT_HIDDEN_IMAGE_TOOLS.has(activeTool.tool)
    ) {
      setActiveTool(null);
    }
  }, [activeTool, isImportImageNode, nodeId, setActiveTool]);

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

  if (!isVisible || !nodeData) {
    return null;
  }

  if (nodeType === 'linghui/director3d') {
    // 3D 导演工作台脱离 Modal：用 portal 自建全屏容器，避免 modal 的内边距 / 默认动画
    // 干扰 viewport / timeline 的 flex 布局
    return ReactDOM.createPortal(
      <div className="linghuiDirector3DFullscreen">
        <button
          type="button"
          className="linghuiDirector3DFullscreenClose"
          onClick={handleClose}
          title="关闭 (Esc)"
        >
          <X size={16} />
        </button>
        <Director3DNodeEditor
          nodeId={nodeId}
          nodeData={nodeData}
          nodeRun={nodeRuns[nodeId]}
          onRun={() => onRunNode(nodeId)}
        />
      </div>,
      document.body,
    );
  }

  /**
   * 视频工具条 LibTV 风：剪辑 / 高清 / 解析 / 智能去字幕 / 音频分离（音视频分离 + 人声分离>仅人声/仅背景音）。
   * 严格不暴露假按钮：未接入服务的入口走 disabled + tooltip 解释。
   */
  const renderLibTVVideoToolbar = () => {
    const activateTool = (tool: LinghuiVideoToolKey) => {
      setActiveTool(activeVideoTool === tool ? null : { kind: 'video', nodeId, tool });
    };

    const handleSubtitleRemove = () => {
      message.info('智能去字幕需要云端 AI 服务，暂未在本地接入。');
    };

    const handleAudioVideoSplit = () => {
      if (onSeparateVideoAudio) {
        onSeparateVideoAudio(nodeId);
      } else {
        message.error('音频分离能力当前不可用，请检查工作区状态');
      }
    };

    const audioSeparationMenu: MenuProps['items'] = [
      {
        key: 'audio-vocal-separation',
        label: '人声分离',
        children: [
          {
            key: 'audio-vocal-only',
            label: '仅保留人声',
            disabled: true,
          },
          {
            key: 'audio-bgm-only',
            label: '仅保留背景音',
            disabled: true,
          },
        ],
      },
      {
        key: 'audio-av-split',
        label: '音视频分离',
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          handleAudioVideoSplit();
        },
      },
    ];

    return (
      <div className="linghuiNodeEditorToolRail isLibTVVideo">
        <Tooltip title={VIDEO_TOOL_PRESETS.clip.description}>
          <button
            type="button"
            className={`linghuiNodeEditorToolButton ${activeVideoTool === 'clip' ? 'isActive' : ''}`}
            onClick={() => activateTool('clip')}
          >
            <Scissors size={14} className="linghuiNodeEditorToolButtonIcon" />
            <span>剪辑</span>
          </button>
        </Tooltip>

        <Tooltip title={VIDEO_TOOL_PRESETS.upscale.description}>
          <button
            type="button"
            className={`linghuiNodeEditorToolButton ${activeVideoTool === 'upscale' ? 'isActive' : ''}`}
            onClick={() => activateTool('upscale')}
          >
            <span className="linghuiNodeEditorToolButtonBadge">HD</span>
            <span>高清</span>
          </button>
        </Tooltip>

        <Tooltip title={VIDEO_TOOL_PRESETS.analyze.description}>
          <button
            type="button"
            className={`linghuiNodeEditorToolButton ${activeVideoTool === 'analyze' ? 'isActive' : ''}`}
            onClick={() => activateTool('analyze')}
          >
            <ScanLine size={14} className="linghuiNodeEditorToolButtonIcon" />
            <span>解析</span>
          </button>
        </Tooltip>

        <Tooltip title={VIDEO_TOOL_PRESETS['subtitle-remove'].description}>
          <button
            type="button"
            className="linghuiNodeEditorToolButton isPlaceholder"
            onClick={handleSubtitleRemove}
            disabled
          >
            <Captions size={14} className="linghuiNodeEditorToolButtonIcon" />
            <span>智能去字幕</span>
            <Sparkles size={12} className="linghuiNodeEditorToolButtonHintIcon" />
          </button>
        </Tooltip>

        <Dropdown
          trigger={['click']}
          classNames={{ root: 'linghuiNodeEditorDropdownMenu' }}
          getPopupContainer={resolveDropdownContainer}
          menu={{ items: audioSeparationMenu }}
        >
          <button
            type="button"
            className={`linghuiNodeEditorToolButton ${activeVideoTool === 'audio-separation' ? 'isActive' : ''}`}
            onClick={event => event.stopPropagation()}
          >
            <AudioWaveform size={14} className="linghuiNodeEditorToolButtonIcon" />
            <span>音频分离</span>
            <ChevronDown size={12} className="linghuiNodeEditorToolButtonCaret" />
          </button>
        </Dropdown>
      </div>
    );
  };

  const renderToolbar = () => {
    if (nodeType === 'linghui/image') {
      if (!hasCurrentImage) {
        return null;
      }

      // 宫格切分模式：保留特殊工具条（用户在切分流程中需要"宫格档位/已选宫格数/创建生图节点/回退"专属操作）。
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

      // LibTV 1:1：图片节点常规态点击展开后，把同款工具条挂到编辑器顶部（点击菜单）。
      // 节点上方 hover 浮空工具条已删除，避免两套工具条不一致 + hover 闪退；统一只有这一处。
      return (
        <LinghuiImageNodeFloatingToolbar
          nodeId={nodeId}
          isPanorama={false /* 进入此分支说明 nodeType === 'linghui/image'，panorama 走另一支编辑器 */}
          primarySource={String(currentPrimaryImage?.source ?? '').trim() || undefined}
          variant="static"
          hiddenTools={isImportImageNode ? Array.from(IMPORT_HIDDEN_IMAGE_TOOLS) : undefined}
        />
      );
    }

    if (nodeType === 'linghui/video') {
      if (isVideoPassThroughNode || !hasCurrentVideo) {
        return null;
      }

      return renderLibTVVideoToolbar();
    }

    return null;
  };

  const toolbarContent = renderToolbar();

  return (
    <div className="linghuiNodeEditorContainer nodrag nopan nowheel">
      <div
        className={`linghuiNodeEditorTopBar ${useMinimalTopBar ? 'isMinimal' : ''} ${isImageToolbarOnlyTopBar ? 'isImageToolbarOnly' : ''}`}
        style={toolbarStyle}
        onClick={handleStopPropagation}
        onMouseDown={handleStopPropagation}
        onPointerDown={handleStopPropagation}
      >
        {!isImageToolbarOnlyTopBar && (
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
        )}
        <div className="linghuiNodeEditorTopBarActions">
          {toolbarContent}
          {!isImageToolbarOnlyTopBar && (
            <button
              type="button"
              className="linghuiNodeEditorCloseButton"
              onClick={handleClose}
              aria-label="关闭节点编辑"
            >
              <X size={14} />
            </button>
          )}
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
              onApplyImageToolPreset={onApplyImageToolPreset}
              onRun={() => onRunNode(nodeId)}
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
