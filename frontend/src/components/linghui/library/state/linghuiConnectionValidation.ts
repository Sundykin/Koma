import type {
  LinghuiNodeCatalogItem,
  LinghuiNodeData,
  LinghuiNodeType,
  LinghuiSlotDataType,
  LinghuiSlotDef,
} from '../../../../types/linghui';

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
  'linghui/storyboard': {
    inputs: [
      { name: '图片参考', dataType: 'image' },
      { name: '剧情补充', dataType: 'text' },
      { name: '视频参考', dataType: 'video' },
    ],
    outputs: [
      { name: 'script', dataType: 'text' },
      { name: 'storyboard', dataType: 'storyboard' },
    ],
  },
  'linghui/director3d': {
    inputs: [
      { name: '背景', dataType: 'image' },
      { name: '文本', dataType: 'text' },
    ],
    outputs: [
      { name: 'image', dataType: 'image' },
      { name: 'text', dataType: 'text' },
    ],
  },
  // 宫格切分节点：单图入，多图出（每个槽位一张图，下游可挑选派生）
  'linghui/image-grid-slice': {
    inputs: [{ name: '主图', dataType: 'image' }],
    outputs: [{ name: 'slots', dataType: 'images' }],
  },
  // 视频合成节点：多输入（视频 + 图片 + 音频），单视频出
  'linghui/video-clip': {
    inputs: [
      { name: '视频片段', dataType: 'video' },
      { name: '图片片段', dataType: 'image' },
      { name: '音频', dataType: 'audio' },
    ],
    outputs: [{ name: 'video', dataType: 'video' }],
  },
};


export interface LinghuiConnectionValidationResult {
  valid: boolean;
  message?: string;
}

export function isLinghuiSlotDataTypeCompatible(params: {
  sourceDataType: LinghuiSlotDataType;
  targetDataType: LinghuiSlotDataType;
}): boolean {
  const { sourceDataType, targetDataType } = params;

  if (sourceDataType === targetDataType) {
    return true;
  }

  if (sourceDataType === 'images' && targetDataType === 'image') {
    return true;
  }

  if (sourceDataType === 'image' && targetDataType === 'images') {
    return true;
  }

  if (sourceDataType === 'video' && targetDataType === 'image') {
    return true;
  }

  if (sourceDataType === 'storyboard' && (targetDataType === 'text' || targetDataType === 'shot')) {
    return true;
  }

  if (sourceDataType === 'shot' && (targetDataType === 'text' || targetDataType === 'image')) {
    return true;
  }

  return false;
}

export function resolveLinghuiCompatibleInputSlot(
  type: LinghuiNodeType,
  sourceDataType: LinghuiSlotDataType,
): { slot: LinghuiSlotDef; index: number } | null {
  const slots = NODE_SLOT_LAYOUTS[type]?.inputs ?? [];
  const index = slots.findIndex(slot => isLinghuiSlotDataTypeCompatible({
    sourceDataType,
    targetDataType: slot.dataType,
  }));

  if (index < 0) {
    return null;
  }

  return { slot: slots[index], index };
}

export function validateLinghuiConnection(params: {
  sourceDataType: LinghuiSlotDataType;
  targetDataType: LinghuiSlotDataType;
  sourceNodeType?: LinghuiNodeType;
  targetNodeType?: LinghuiNodeType;
  sourceSlotIndex?: number;
  targetSlotIndex?: number;
}): LinghuiConnectionValidationResult {
  if (isLinghuiSlotDataTypeCompatible(params)) {
    return { valid: true };
  }

  const sourceLabel = SLOT_TYPE_LABELS[params.sourceDataType] ?? params.sourceDataType;
  const targetLabel = SLOT_TYPE_LABELS[params.targetDataType] ?? params.targetDataType;
  return {
    valid: false,
    message: `${sourceLabel}输出不能连接到${targetLabel}输入。`,
  };
}

export function isLinghuiConnectionValid(
  connection: { source: string; target: string; sourceHandle: string | null; targetHandle: string | null },
  nodes: Array<{ id: string; data: LinghuiNodeData }>,
): LinghuiConnectionValidationResult {
  const sourceNode = nodes.find(n => n.id === connection.source);
  const targetNode = nodes.find(n => n.id === connection.target);
  if (!sourceNode || !targetNode) return { valid: false, message: '连接节点不存在。' };
  if (sourceNode.id === targetNode.id) return { valid: false, message: '节点不能连接到自身。' };
  if (!sourceNode.data.outputs.length || !targetNode.data.inputs.length) {
    return { valid: false, message: '连接端口不存在。' };
  }

  const sourceSlot = sourceNode.data.outputs[0];
  const targetSlot = targetNode.data.inputs.find(slot => isLinghuiSlotDataTypeCompatible({
    sourceDataType: sourceSlot.dataType,
    targetDataType: slot.dataType,
  }));

  if (!targetSlot) {
    const sourceLabel = SLOT_TYPE_LABELS[sourceSlot.dataType] ?? sourceSlot.dataType;
    return { valid: false, message: `当前节点没有可接收${sourceLabel}输出的输入槽。` };
  }

  return validateLinghuiConnection({
    sourceDataType: sourceSlot.dataType,
    targetDataType: targetSlot.dataType,
    sourceNodeType: sourceNode.data.linghuiType,
    targetNodeType: targetNode.data.linghuiType,
    sourceSlotIndex: 0,
    targetSlotIndex: targetNode.data.inputs.indexOf(targetSlot),
  });
}
