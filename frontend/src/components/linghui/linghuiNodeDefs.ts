import type {
  LinghuiNodeCatalogItem,
  LinghuiNodeData,
  LinghuiNodeType,
  LinghuiSlotDataType,
  LinghuiSlotDef,
} from '../../types/linghui';

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

export const NODE_META: Record<LinghuiNodeType, LinghuiNodeMeta> = {
  'linghui/reference': {
    type: 'linghui/reference',
    title: '参考图',
    desc: '拖入或上传参考图，作为上游图片输入',
    catalogCategory: 'creation',
    catalogLabel: '参考图节点',
    catalogDescription: '挂载本地图片或素材图，输出单张参考图',
    accent: '#38bdf8',
    background: '#0f1720',
  },
  'linghui/image': {
    type: 'linghui/image',
    title: '图片',
    desc: '统一图片生成节点，支持单图/宫格/多角度',
    catalogCategory: 'creation',
    catalogLabel: '图片节点',
    catalogDescription: '生成图片，支持单图、宫格、多参考',
    accent: '#4ade80',
    background: '#0f1720',
  },
  'linghui/video': {
    type: 'linghui/video',
    title: '视频',
    desc: '统一视频生成节点，支持全能参考/首尾帧',
    catalogCategory: 'creation',
    catalogLabel: '视频节点',
    catalogDescription: '生成视频，支持多种参考模式',
    accent: '#22c55e',
    background: '#0f1720',
  },
  'linghui/storyboard-shot': {
    type: 'linghui/storyboard-shot',
    title: '分镜',
    desc: '管理单个分镜内容与时长',
    catalogCategory: 'storyboard',
    catalogLabel: '分镜节点',
    catalogDescription: '描述单个镜头内容与时长',
    accent: '#2dd4bf',
    background: '#0f1720',
  },
  'linghui/storyboard-group': {
    type: 'linghui/storyboard-group',
    title: '分镜组',
    desc: '串联多个分镜形成序列',
    catalogCategory: 'storyboard',
    catalogLabel: '分镜组节点',
    catalogDescription: '聚合多个分镜节点形成序列',
    accent: '#facc15',
    background: '#0f1720',
  },
};

export const SLOT_TYPE_LABELS: Record<LinghuiSlotDataType, string> = {
  image: '图片',
  text: '文本',
  video: '视频',
  images: '多图',
  shot: '分镜',
  storyboard: '分镜序列',
};

export const NODE_SLOT_LAYOUTS: Record<LinghuiNodeType, { inputs: LinghuiSlotDef[]; outputs: LinghuiSlotDef[] }> = {
  'linghui/reference': {
    inputs: [],
    outputs: [{ name: 'reference', dataType: 'image' }],
  },
  'linghui/image': {
    inputs: [{ name: '参考', dataType: 'image' }],
    outputs: [{ name: 'image', dataType: 'image' }],
  },
  'linghui/video': {
    inputs: [{ name: '参考', dataType: 'image' }],
    outputs: [{ name: 'video', dataType: 'video' }],
  },
  'linghui/storyboard-shot': {
    inputs: [
      { name: 'image', dataType: 'image' },
      { name: 'prompt', dataType: 'text' },
    ],
    outputs: [{ name: 'shot', dataType: 'shot' }],
  },
  'linghui/storyboard-group': {
    inputs: [{ name: '分镜 1', dataType: 'shot' }],
    outputs: [{ name: 'sequence', dataType: 'storyboard' }],
  },
};

export const NODE_PROPERTY_DEFAULTS: Record<LinghuiNodeType, Record<string, unknown>> = {
  'linghui/reference': {
    source: '',
    note: '',
  },
  'linghui/image': {
    prompt: '',
    ttiConfigId: '',
    aspectRatio: '3:4',
    resolution: 'auto',
    gridType: 'none',
    batchCount: 4,
  },
  'linghui/video': {
    prompt: '',
    itvConfigId: '',
    refMode: 'all-ref',
    aspectRatio: '16:9',
    resolution: '720P',
    duration: 5,
  },
  'linghui/storyboard-shot': { description: '', duration: 3 },
  'linghui/storyboard-group': { title: '场景序列', notes: '' },
};

export const LINGHUI_NODE_CATALOG: LinghuiNodeCatalogItem[] = Object.values(NODE_META).map(meta => ({
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
}): LinghuiConnectionValidationResult {
  const { sourceDataType, targetDataType, sourceNodeType, targetNodeType } = params;

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
  });
}

export function getLinghuiNodeMeta(type?: string | null): LinghuiNodeMeta | null {
  if (!type || !(type in NODE_META)) return null;
  return NODE_META[type as LinghuiNodeType];
}

export function getLinghuiNodeAccent(type?: string | null): string {
  return getLinghuiNodeMeta(type)?.accent ?? '#4ade80';
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
    properties: { ...defaults },
    inputs: slots.inputs.map(s => ({ ...s })),
    outputs: slots.outputs.map(s => ({ ...s })),
    active: false,
  };
}
