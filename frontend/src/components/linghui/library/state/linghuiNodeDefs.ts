import type {
  LinghuiNodeCatalogItem,
  LinghuiNodeData,
  LinghuiNodeType,
  LinghuiSlotDataType,
  LinghuiSlotDef,
} from '../../../../types/linghui';

export interface LinghuiNodeMeta {
  type: LinghuiNodeType;
  title: string;
  desc: string;
  catalogCategory: LinghuiNodeCatalogItem['category'];
  catalogLabel: string;
  catalogDescription: string;
  accent: string;
  background: string;
}

interface CreateNewNodeDataOptions {
  label?: string;
}

const LINGHUI_NODE_BACKGROUND = 'var(--token-bg-card)';
const LINGHUI_NODE_COLORS = {
  text: 'var(--token-status-warning)',
  agent: 'var(--token-status-info)',
  image: 'var(--token-status-success)',
  video: 'var(--token-accent-base)',
  audio: 'var(--token-status-warning)',
  script: 'var(--token-accent-hover)',
} as const;

export const NODE_META: Record<LinghuiNodeType, LinghuiNodeMeta> = {
  'linghui/text': {
    type: 'linghui/text',
    title: '文本',
    desc: '手动输入文本，或调用 LLM 生成文本块',
    catalogCategory: 'creation',
    catalogLabel: '文本节点',
    catalogDescription: '输入角色设定、剧情描述、镜头说明等文本内容',
    accent: LINGHUI_NODE_COLORS.text,
    background: LINGHUI_NODE_BACKGROUND,
  },
  'linghui/agent': {
    type: 'linghui/agent',
    title: 'Agent',
    desc: '执行单 Agent 推理与工具调用，输出文本结果',
    catalogCategory: 'creation',
    catalogLabel: 'Agent 节点',
    catalogDescription: '消费上游文本与图片，调用工具并整理文本结论',
    accent: LINGHUI_NODE_COLORS.agent,
    background: LINGHUI_NODE_BACKGROUND,
  },
  'linghui/image': {
    type: 'linghui/image',
    title: '图片',
    desc: '统一图片生成节点，支持单图/宫格/多角度',
    catalogCategory: 'creation',
    catalogLabel: '图片节点',
    catalogDescription: '生成图片，支持单图、宫格、多参考',
    accent: LINGHUI_NODE_COLORS.image,
    background: LINGHUI_NODE_BACKGROUND,
  },
  'linghui/panorama': {
    type: 'linghui/panorama',
    title: '全景',
    desc: '生成 720° 全景环境板，结果支持球面拖拽预览',
    catalogCategory: 'creation',
    catalogLabel: '全景生图',
    catalogDescription: '内置 AR720 提示词模板 + 球面伪 720° 浏览（拖拽/缩放）',
    accent: LINGHUI_NODE_COLORS.image,
    background: LINGHUI_NODE_BACKGROUND,
  },
  'linghui/video': {
    type: 'linghui/video',
    title: '视频',
    desc: '统一视频生成节点，支持文生、图生、参考生和首尾帧',
    catalogCategory: 'creation',
    catalogLabel: '视频节点',
    catalogDescription: '生成视频，按模型能力切换不同视频模式',
    accent: LINGHUI_NODE_COLORS.video,
    background: LINGHUI_NODE_BACKGROUND,
  },
  'linghui/audio': {
    type: 'linghui/audio',
    title: '音频',
    desc: '统一音频节点，支持上传音频或文本转语音',
    catalogCategory: 'creation',
    catalogLabel: '音频节点',
    catalogDescription: '上传音频或生成语音，输出音频产物',
    accent: LINGHUI_NODE_COLORS.audio,
    background: LINGHUI_NODE_BACKGROUND,
  },
  'linghui/script': {
    type: 'linghui/script',
    title: '脚本',
    desc: '生成结构化脚本，并批量派生镜头文本、图片和视频',
    catalogCategory: 'storyboard',
    catalogLabel: '脚本节点',
    catalogDescription: '生成或整理剧情脚本，输出结构化分镜序列',
    accent: LINGHUI_NODE_COLORS.script,
    background: LINGHUI_NODE_BACKGROUND,
  },
};

export const SLOT_TYPE_LABELS: Record<LinghuiSlotDataType, string> = {
  image: '图片',
  text: '文本',
  video: '视频',
  audio: '音频',
  images: '多图',
  shot: '分镜',
  storyboard: '分镜序列',
};

export const NODE_SLOT_LAYOUTS: Record<LinghuiNodeType, { inputs: LinghuiSlotDef[]; outputs: LinghuiSlotDef[] }> = {
  'linghui/text': {
    inputs: [
      { name: '图片参考', dataType: 'image' },
      { name: '文本输入', dataType: 'text' },
      { name: '视频参考', dataType: 'video' },
      { name: '音频参考', dataType: 'audio' },
    ],
    outputs: [{ name: 'text', dataType: 'text' }],
  },
  'linghui/agent': {
    inputs: [
      { name: '图片参考', dataType: 'image' },
      { name: '文本输入', dataType: 'text' },
    ],
    outputs: [{ name: 'text', dataType: 'text' }],
  },
  'linghui/image': {
    inputs: [
      { name: '参考', dataType: 'image' },
      { name: '文本', dataType: 'text' },
    ],
    outputs: [{ name: 'image', dataType: 'image' }],
  },
  'linghui/panorama': {
    inputs: [
      { name: '参考', dataType: 'image' },
      { name: '文本', dataType: 'text' },
    ],
    outputs: [{ name: 'image', dataType: 'image' }],
  },
  'linghui/video': {
    inputs: [
      { name: '参考', dataType: 'image' },
      { name: '文本', dataType: 'text' },
      { name: '音频', dataType: 'audio' },
      { name: '视频', dataType: 'video' },
    ],
    outputs: [{ name: 'video', dataType: 'video' }],
  },
  'linghui/audio': {
    inputs: [
      { name: '图片参考', dataType: 'image' },
      { name: '文本输入', dataType: 'text' },
      { name: '视频参考', dataType: 'video' },
      { name: '音频参考', dataType: 'audio' },
    ],
    outputs: [{ name: 'audio', dataType: 'audio' }],
  },
  'linghui/script': {
    inputs: [
      { name: '图片参考', dataType: 'image' },
      { name: '文本设定', dataType: 'text' },
      { name: '视频参考', dataType: 'video' },
    ],
    outputs: [
      { name: 'script', dataType: 'text' },
      { name: 'storyboard', dataType: 'storyboard' },
    ],
  },
};

export const NODE_PROPERTY_DEFAULTS: Record<LinghuiNodeType, Record<string, unknown>> = {
  'linghui/text': {
    mode: 'manual',
    content: '',
    prompt: '',
    systemPrompt: '',
    llmSelection: '',
  },
  'linghui/agent': {
    prompt: '',
    systemPrompt: '',
    llmSelection: '',
    enabledTools: [],
    maxIterations: 6,
  },
  'linghui/image': {
    mode: 'generate',
    source: '',
    items: [],
    primaryAssetId: '',
    primaryResultSource: '',
    prompt: '',
    ttiSelection: '',
    aspectRatio: '3:4',
    resolution: 'auto',
    gridType: 'none',
    batchCount: 1,
  },
  // 全景节点 = 独立节点类型：执行器自己包装提示词，编辑器自己渲染 720° 预览，
  // 与图片节点共享底层数据结构（mode/source/prompt/ttiSelection/...），但不复用 properties 里的 panorama 标志位
  'linghui/panorama': {
    mode: 'generate',
    source: '',
    items: [],
    primaryAssetId: '',
    primaryResultSource: '',
    prompt: '',
    ttiSelection: '',
    aspectRatio: '21:9',
    resolution: 'auto',
    gridType: 'none',
    batchCount: 1,
    // 全景模板档位：'auto' | 'indoor' | 'outdoor'，影响执行器拼装的 system prompt
    panoramaTemplate: 'auto',
  },
  'linghui/video': {
    prompt: '',
    itvSelection: '',
    source: '',
    posterSource: '',
    videoCapability: 'video.text-to-video',
    aspectRatio: '16:9',
    resolution: '720p',
    duration: 5,
  },
  'linghui/audio': {
    source: '',
    prompt: '',
    ttsSelection: '',
    voiceId: '',
  },
  'linghui/script': {
    mode: 'manual',
    content: '',
    prompt: '',
    systemPrompt: '',
    llmSelection: '',
    viewMode: 'cards',
  },
};

export const LINGHUI_NODE_CATALOG: LinghuiNodeCatalogItem[] = Object.values(NODE_META)
  .filter(meta => meta.type !== 'linghui/agent')
  .map(meta => ({
    type: meta.type,
    label: meta.catalogLabel,
    description: meta.catalogDescription,
    category: meta.catalogCategory,
    accent: meta.accent,
  }));

export interface LinghuiConnectionValidationResult {
  valid: boolean;
  message?: string;
}

export function validateLinghuiConnection(params: {
  sourceDataType: LinghuiSlotDataType;
  targetDataType: LinghuiSlotDataType;
  sourceNodeType?: LinghuiNodeType;
  targetNodeType?: LinghuiNodeType;
  sourceSlotIndex?: number;
  targetSlotIndex?: number;
}): LinghuiConnectionValidationResult {
  const {
    sourceDataType,
    targetDataType,
    sourceNodeType,
    targetNodeType,
    targetSlotIndex,
  } = params;

  if (
    sourceDataType === 'image'
    && targetDataType === 'image'
    && targetSlotIndex === 0
    && (targetNodeType === 'linghui/text' || targetNodeType === 'linghui/audio' || targetNodeType === 'linghui/script')
  ) {
    const targetNodeLabel = NODE_META[targetNodeType]?.title ?? '当前节点';
    return {
      valid: false,
      message: `${targetNodeLabel}节点当前不会消费图片输入，请改用可被执行层读取的文本或媒体结果。`,
    };
  }

  if (sourceDataType === targetDataType) {
    return { valid: true };
  }

  const sourceNodeLabel = sourceNodeType ? (NODE_META[sourceNodeType]?.title ?? '当前节点') : '当前节点';
  const targetNodeLabel = targetNodeType ? (NODE_META[targetNodeType]?.title ?? '目标节点') : '目标节点';
  const sourceTypeLabel = SLOT_TYPE_LABELS[sourceDataType] ?? sourceDataType;
  const targetTypeLabel = SLOT_TYPE_LABELS[targetDataType] ?? targetDataType;

  return {
    valid: false,
    message: `${sourceNodeLabel} 的 ${sourceTypeLabel} 输出不能连接到 ${targetNodeLabel} 的 ${targetTypeLabel} 输入。`,
  };
}

export function parseHandleId(handleId: string | null | undefined): { direction: 'input' | 'output'; index: number } | null {
  if (!handleId) return null;
  const match = handleId.match(/^(input|output)-(\d+)$/);
  if (!match) return null;
  return { direction: match[1] as 'input' | 'output', index: Number(match[2]) };
}

export function isLinghuiConnectionValid(
  connection: { source: string; target: string; sourceHandle: string | null; targetHandle: string | null },
  nodes: Array<{ id: string; data: LinghuiNodeData }>,
): LinghuiConnectionValidationResult {
  const sourceNode = nodes.find(n => n.id === connection.source);
  const targetNode = nodes.find(n => n.id === connection.target);
  if (!sourceNode || !targetNode) return { valid: false, message: '连接端口不存在。' };

  const sourceHandle = parseHandleId(connection.sourceHandle);
  const targetHandle = parseHandleId(connection.targetHandle);
  if (!sourceHandle || !targetHandle) return { valid: false, message: '连接端口不存在。' };

  const sourceSlot = sourceNode.data.outputs[sourceHandle.index];
  const targetSlot = targetNode.data.inputs[targetHandle.index];
  if (!sourceSlot || !targetSlot) return { valid: false, message: '连接端口不存在。' };

  return validateLinghuiConnection({
    sourceDataType: sourceSlot.dataType,
    targetDataType: targetSlot.dataType,
    sourceNodeType: sourceNode.data.linghuiType,
    targetNodeType: targetNode.data.linghuiType,
    sourceSlotIndex: sourceHandle.index,
    targetSlotIndex: targetHandle.index,
  });
}

export function getLinghuiNodeMeta(type?: string | null): LinghuiNodeMeta | null {
  if (!type || !(type in NODE_META)) return null;
  return NODE_META[type as LinghuiNodeType];
}

export function getLinghuiNodeAccent(type?: string | null): string {
  return getLinghuiNodeMeta(type)?.accent ?? 'var(--token-accent-base)';
}

export function createNewNodeData(type: LinghuiNodeType, options?: CreateNewNodeDataOptions): LinghuiNodeData {
  const meta = NODE_META[type];
  const slots = NODE_SLOT_LAYOUTS[type];
  const defaults = NODE_PROPERTY_DEFAULTS[type];

  return {
    linghuiType: type,
    label: options?.label?.trim() || meta.title,
    accent: meta.accent,
    background: meta.background,
    viewMode: 'light',
    properties: { ...defaults },
    inputs: slots.inputs.map(s => ({ ...s })),
    outputs: slots.outputs.map(s => ({ ...s })),
    active: false,
  };
}
