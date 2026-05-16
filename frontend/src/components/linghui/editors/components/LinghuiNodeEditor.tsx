import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  useEdges,
  useNodes,
  useNodesData,
} from '@xyflow/react';
import { App, Button, Dropdown, Modal, Tooltip } from 'antd';
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

const IMAGE_TOOLBAR_ITEMS: Array<{ key: LinghuiImageToolKey; label: string }> = [
  { key: 'focus', label: '聚焦' },
  { key: 'mark', label: '标记' },
  { key: 'upscale', label: '高清' },
  { key: 'multi-angle', label: '多角度' },
  { key: 'outpaint', label: '扩图' },
  { key: 'relight', label: '打光' },
  { key: 'repaint', label: '重绘' },
  { key: 'erase', label: '擦除' },
  { key: 'remove-bg', label: '抠图' },
  { key: 'crop', label: '裁剪' },
  { key: 'mockup', label: 'Mockup' },
  { key: 'edit-elements', label: '元素' },
  { key: 'edit-texts', label: '文字' },
  { key: 'grid-split', label: '宫格' },
];

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

interface ImageToolPresetDef {
  label: string;
  description: string;
  promptSnippet: string;
  properties?: Partial<LinghuiImageNodeProperties>;
  localAction?: 'crop';
}

const IMAGE_TOOL_PRESETS: Record<LinghuiImageToolKey, {
  title: string;
  description: string;
  presets: ImageToolPresetDef[];
}> = {
  focus: {
    title: '聚焦',
    description: '标记图片中的局部区域，下一次生成会优先修复、补全或重绘这个区域。',
    presets: [],
  },
  mark: {
    title: '标记',
    description: '在图片上点选主体或细节焦点，并把标记点写入下一次生成提示。',
    presets: [],
  },
  upscale: {
    title: '高清放大',
    description: '用本地 FFmpeg 对当前图片做 2x 或 4x 高清放大，并派生新的图片节点。',
    presets: [],
  },
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
  erase: {
    title: '擦除',
    description: '移除画面中的干扰元素，生成独立擦除任务节点。',
    presets: [
      {
        label: '智能擦除',
        description: '自动识别并清理瑕疵、水印或多余物体。',
        promptSnippet: '智能擦除画面中的多余物体、瑕疵、杂乱元素或水印痕迹，背景纹理自然补全，主体结构保持稳定。',
        properties: { resolution: '2K' },
      },
      {
        label: '框选擦除',
        description: '按已有聚焦/标记意图清理指定区域。',
        promptSnippet: '框选擦除指定区域中的干扰元素，并根据周围背景、光影和纹理自然补全，不改变主体身份与构图重心。',
        properties: { resolution: '2K' },
      },
    ],
  },
  'remove-bg': {
    title: '抠图',
    description: '生成主体干净、背景可替换的图片任务节点。',
    presets: [
      {
        label: '主体抠图',
        description: '保留主体边缘细节，移除背景。',
        promptSnippet: '主体抠图，保留人物/物体轮廓、发丝、透明材质和边缘细节，背景变为干净纯色或透明风格，主体不变形。',
        properties: { aspectRatio: '1:1', resolution: '2K' },
      },
      {
        label: '商品白底',
        description: '适合电商图和素材整理。',
        promptSnippet: '商品白底抠图，保留商品材质、阴影和真实比例，背景简洁干净，边缘锐利，适合素材库或电商展示。',
        properties: { aspectRatio: '1:1', resolution: '2K' },
      },
    ],
  },
  crop: {
    title: '裁剪',
    description: '按常用构图比例生成裁剪后的独立图片节点。',
    presets: [
      {
        label: '方图裁剪',
        description: '裁成社媒/头像友好的 1:1。',
        promptSnippet: '将当前画面裁剪重构为 1:1 方图构图，主体居中清晰，边缘信息自然补足，画面不出现拉伸变形。',
        properties: { aspectRatio: '1:1', resolution: '2K' },
        localAction: 'crop',
      },
      {
        label: '竖版裁剪',
        description: '裁成短视频封面或人物海报。',
        promptSnippet: '将当前画面裁剪重构为 9:16 竖版构图，保留主体完整性和视觉焦点，上下空间自然补足。',
        properties: { aspectRatio: '9:16', resolution: '2K' },
        localAction: 'crop',
      },
      {
        label: '横版裁剪',
        description: '裁成横幅和视频首帧。',
        promptSnippet: '将当前画面裁剪重构为 16:9 横版构图，保留主体和关键环境关系，两侧空间自然延展。',
        properties: { aspectRatio: '16:9', resolution: '2K' },
        localAction: 'crop',
      },
    ],
  },
  mockup: {
    title: 'Mockup',
    description: '把当前主体放入展示样机、海报或产品场景。',
    presets: [
      {
        label: '海报样机',
        description: '生成可展示的品牌/角色海报 mockup。',
        promptSnippet: '将当前主体制作成高级海报 Mockup，加入真实纸张/屏幕/展架质感，光影自然，主体清晰，排版留白专业。',
        properties: { aspectRatio: '4:3', resolution: '2K' },
      },
      {
        label: '产品展示',
        description: '放入桌面、展台或商业展示场景。',
        promptSnippet: '将当前主体放入产品展示 Mockup 场景，包含真实材质台面、柔和商业灯光和可读的空间透视，主体外观保持一致。',
        properties: { aspectRatio: '16:9', resolution: '2K' },
      },
    ],
  },
  'edit-elements': {
    title: '编辑元素',
    description: '替换、添加或整理画面里的局部元素。',
    presets: [
      {
        label: '替换元素',
        description: '保留整体构图，只替换指定对象。',
        promptSnippet: '编辑画面元素：保留主体身份、构图和光影，仅替换或优化指定对象，使新元素与场景透视、材质和比例自然一致。',
        properties: { resolution: '2K' },
      },
      {
        label: '添加道具',
        description: '为主体补充自然互动道具。',
        promptSnippet: '在画面中添加与主体动作和剧情匹配的道具，保持手部关系、遮挡、光影和材质真实，不破坏原有构图。',
        properties: { resolution: '2K' },
      },
    ],
  },
  'edit-texts': {
    title: '编辑文本',
    description: '清理画面文字或生成更规整的可替换文字区域。',
    presets: [
      {
        label: '去除文字',
        description: '移除水印、字幕和画面文字。',
        promptSnippet: '移除画面中的文字、水印、字幕、logo 或标签痕迹，并自然补全背景纹理，不改变主体与关键画面内容。',
        properties: { resolution: '2K' },
      },
      {
        label: '留出版面',
        description: '整理出可后期加字的干净区域。',
        promptSnippet: '整理画面中的文字区域，保留干净可编辑的版面留白，让背景、光影和主体关系自然，避免生成不可读乱码文字。',
        properties: { resolution: '2K' },
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
    onExecuteImageUpscale,
    onExecuteImageCrop,
    onExecuteMultiAngle,
    onApplyImageToolPreset,
    onSetGridSplitType,
    onClearGridSplitCells,
    onExecuteGridSplit,
    onGenerateImageFromController,
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
  const imageToolbarItems = useMemo(() => (
    isImportImageNode
      ? IMAGE_TOOLBAR_ITEMS.filter(item => !IMPORT_HIDDEN_IMAGE_TOOLS.has(item.key))
      : IMAGE_TOOLBAR_ITEMS
  ), [isImportImageNode]);
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
        ? (useMinimalTopBar ? 240 : 860)
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

  const imageUpscaleMenuItems = useMemo<MenuProps['items']>(() => (
    [2, 4].map(value => ({
      key: String(value),
      label: `${value}x 高清放大`,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        setOpenDropdownKey(null);
        setActiveTool({ kind: 'image', nodeId, tool: 'upscale' });
        onExecuteImageUpscale?.(nodeId, { factor: value as 2 | 4 });
      },
    }))
  ), [nodeId, onExecuteImageUpscale, setActiveTool]);

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
        if (preset.localAction === 'crop') {
          setActiveTool({ kind: 'image', nodeId, tool: 'crop' });
          onExecuteImageCrop?.(nodeId, {
            label: preset.label,
            aspectRatio: String(preset.properties?.aspectRatio ?? '1:1'),
          });
          return;
        }
        onApplyImageToolPreset?.({
          label: preset.label,
          promptSnippet: preset.promptSnippet,
          properties: preset.properties,
        });
      },
    }));
  }, [gridSplitMenuItems, onApplyImageToolPreset]);

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
