import type {
  LinghuiNodeCatalogItem,
  LinghuiNodeType,
  LinghuiSlotDataType,
} from '../../../../types/linghui';
import {
  LINGHUI_NODE_CATALOG,
  resolveLinghuiCompatibleInputSlot,
} from '../../library/state/linghuiNodeDefs';

interface QuickCreatePreset {
  id: string;
  type: LinghuiNodeType;
  label: string;
  description: string;
  nodeLabel?: string;
  initialProperties?: Record<string, unknown>;
  recommendation: string;
}

const QUICK_CREATE_PRESETS: Partial<Record<LinghuiSlotDataType, QuickCreatePreset[]>> = {
  text: [
    {
      id: 'text-to-image-generator',
      type: 'linghui/image',
      label: '图片生成器',
      description: '把当前文本作为提示词，继续生成图片历史。',
      nodeLabel: '图片生成器',
      recommendation: '文生图',
    },
    {
      id: 'text-to-video',
      type: 'linghui/video',
      label: '文生视频',
      description: '直接把剧情、镜头或提示词转成视频镜头。',
      nodeLabel: '文生视频',
      initialProperties: { videoCapability: 'video.text-to-video' },
      recommendation: '文生视频',
    },
    {
      id: 'text-to-audio',
      type: 'linghui/audio',
      label: '音频生成器',
      description: '把文本继续转成旁白、对白或音频草稿。',
      nodeLabel: '音频生成器',
      recommendation: '文本转音频',
    },
    {
      id: 'text-to-storyboard',
      type: 'linghui/storyboard',
      label: '脚本生成器',
      description: '把剧情大纲拆成可继续生成图片和视频的镜头序列。',
      nodeLabel: '脚本生成器',
      recommendation: '拆分镜',
    },
  ],
  image: [
    {
      id: 'image-to-video',
      type: 'linghui/video',
      label: '图生视频',
      description: '以当前图片作为主图，让画面动起来。',
      nodeLabel: '图生视频',
      initialProperties: { videoCapability: 'video.image-to-video' },
      recommendation: '图生视频',
    },
    {
      id: 'image-to-reference-video',
      type: 'linghui/video',
      label: '全能参考',
      description: '把当前图片作为参考集合的一部分，统一主体、风格和构图。',
      nodeLabel: '全能参考视频',
      initialProperties: { videoCapability: 'video.reference-to-video' },
      recommendation: '参考生视频',
    },
    {
      id: 'image-to-start-end-video',
      type: 'linghui/video',
      label: '首尾帧视频',
      description: '用当前图片作为首帧或尾帧，继续补另一帧完成过渡。',
      nodeLabel: '首尾帧视频',
      initialProperties: { videoCapability: 'video.start-end-to-video' },
      recommendation: '首尾帧',
    },
    {
      id: 'image-to-image-generator',
      type: 'linghui/image',
      label: '图片参考',
      description: '把当前图片作为参考，继续批量生成新图片。',
      nodeLabel: '图片参考生成器',
      recommendation: '图生图',
    },
    {
      id: 'image-to-panorama',
      type: 'linghui/panorama',
      label: '进入全景预览',
      description: '用当前画面继续生成或预览 720° 空间环境。',
      nodeLabel: '全景预览',
      recommendation: '空间扩展',
    },
  ],
  images: [
    {
      id: 'images-to-reference-video',
      type: 'linghui/video',
      label: '全能参考',
      description: '把多张图片作为完整参考集合生成视频。',
      nodeLabel: '全能参考视频',
      initialProperties: { videoCapability: 'video.reference-to-video' },
      recommendation: '多图参考',
    },
    {
      id: 'images-to-start-end-video',
      type: 'linghui/video',
      label: '首尾帧视频',
      description: '使用多图中的首尾画面组织连续过渡。',
      nodeLabel: '首尾帧视频',
      initialProperties: { videoCapability: 'video.start-end-to-video' },
      recommendation: '首尾帧',
    },
    {
      id: 'images-to-image-generator',
      type: 'linghui/image',
      label: '图片参考',
      description: '把多图作为参考，继续生成新的图片版本。',
      nodeLabel: '图片参考生成器',
      recommendation: '多图参考',
    },
  ],
  video: [
    {
      id: 'video-to-video-edit',
      type: 'linghui/video',
      label: '视频编辑',
      description: '把当前视频作为视频参考，继续改写运动、节奏或风格。',
      nodeLabel: '视频编辑',
      initialProperties: { videoCapability: 'video.reference-to-video' },
      recommendation: '视频参考',
    },
    {
      id: 'video-to-text',
      type: 'linghui/text',
      label: '文本生成器',
      description: '解析当前视频，继续提炼镜头说明、动作和提示词。',
      nodeLabel: '文本生成器',
      initialProperties: { mode: 'generate' },
      recommendation: '视频解析',
    },
    {
      id: 'video-to-image',
      type: 'linghui/image',
      label: '图片参考',
      description: '使用视频首帧或封面继续生成静态视觉参考。',
      nodeLabel: '视频图片参考',
      recommendation: '首帧参考',
    },
  ],
  audio: [
    {
      id: 'audio-to-video',
      type: 'linghui/video',
      label: '视频生成器',
      description: '把音频节奏和旁白作为视频生成参考。',
      nodeLabel: '音频驱动视频',
      initialProperties: { videoCapability: 'video.text-to-video' },
      recommendation: '音频参考',
    },
    {
      id: 'audio-to-text',
      type: 'linghui/text',
      label: '文本生成器',
      description: '围绕当前音频继续整理旁白、歌词或镜头文字。',
      nodeLabel: '音频文本生成器',
      initialProperties: { mode: 'generate' },
      recommendation: '音频转文本',
    },
  ],
  storyboard: [
    {
      id: 'storyboard-to-script',
      type: 'linghui/script',
      label: '脚本生成器',
      description: '继续编辑结构化脚本，并派生镜头图片和视频。',
      nodeLabel: '脚本生成器',
      recommendation: '脚本编辑',
    },
    {
      id: 'storyboard-to-video',
      type: 'linghui/video',
      label: '视频生成器',
      description: '基于分镜序列继续生成视频流程。',
      nodeLabel: '分镜视频生成器',
      initialProperties: { videoCapability: 'video.text-to-video' },
      recommendation: '分镜视频',
    },
    {
      id: 'storyboard-to-text',
      type: 'linghui/text',
      label: '文本生成器',
      description: '把分镜序列继续整理成提示词、旁白或制作说明。',
      nodeLabel: '分镜文本生成器',
      initialProperties: { mode: 'generate' },
      recommendation: '分镜文本',
    },
  ],
  shot: [
    {
      id: 'shot-to-image',
      type: 'linghui/image',
      label: '图片生成器',
      description: '用单个镜头继续生成画面。',
      nodeLabel: '镜头图片生成器',
      recommendation: '镜头生图',
    },
    {
      id: 'shot-to-video',
      type: 'linghui/video',
      label: '视频生成器',
      description: '用单个镜头继续生成视频。',
      nodeLabel: '镜头视频生成器',
      initialProperties: { videoCapability: 'video.text-to-video' },
      recommendation: '镜头视频',
    },
  ],
};

function buildPresetItem(
  preset: QuickCreatePreset,
  sourceDataType: LinghuiSlotDataType,
): LinghuiNodeCatalogItem | null {
  const baseItem = LINGHUI_NODE_CATALOG.find(item => item.type === preset.type);
  const compatibleSlot = resolveLinghuiCompatibleInputSlot(preset.type, sourceDataType);
  if (!baseItem || !compatibleSlot) {
    return null;
  }

  return {
    ...baseItem,
    ...preset,
    targetSlotName: compatibleSlot.slot.name,
    targetSlotType: compatibleSlot.slot.dataType,
  };
}

function buildCompatibleBaseItem(
  item: LinghuiNodeCatalogItem,
  sourceDataType: LinghuiSlotDataType,
): LinghuiNodeCatalogItem | null {
  const compatibleSlot = resolveLinghuiCompatibleInputSlot(item.type, sourceDataType);
  if (!compatibleSlot) {
    return null;
  }

  return {
    ...item,
    recommendation: item.recommendation ?? '兼容下游',
    targetSlotName: compatibleSlot.slot.name,
    targetSlotType: compatibleSlot.slot.dataType,
  };
}

function createMenuPreset(
  preset: Omit<LinghuiNodeCatalogItem, 'description' | 'accent' | 'category'> & {
    description?: string;
    category?: LinghuiNodeCatalogItem['category'];
  },
): LinghuiNodeCatalogItem | null {
  const baseItem = LINGHUI_NODE_CATALOG.find(item => item.type === preset.type);
  if (!baseItem) {
    return null;
  }

  return {
    ...baseItem,
    ...preset,
    description: preset.description ?? baseItem.description,
    category: preset.category ?? baseItem.category,
  };
}

const CANVAS_CREATE_MENU_PRESETS: Array<Parameters<typeof createMenuPreset>[0]> = [
  {
    id: 'asset-image-reference',
    type: 'linghui/image',
    label: '图片参考',
    description: '导入或粘贴图片，作为后续生图、生视频和主体提取参考。',
    category: 'asset',
    nodeLabel: '图片参考',
    // 对齐 LibTV "图片参考" 节点：纯素材，执行只回放原图；
    // 不设 mode 时会走 generate 默认，导致出现 prompt 和工具栏，违背参考语义。
    initialProperties: { mode: 'import' },
  },
  {
    id: 'asset-video-reference',
    type: 'linghui/video',
    label: '视频参考',
    description: '导入视频或承接上游视频，作为视频编辑和解析参考。',
    category: 'asset',
    nodeLabel: '视频参考',
    // 对齐 LibTV "视频参考"：纯素材节点，不展示 prompt / 模型 / 生成按钮。
    initialProperties: { mode: 'import', videoCapability: 'video.reference-to-video' },
  },
  {
    id: 'asset-audio-reference',
    type: 'linghui/audio',
    label: '音频参考',
    description: '导入音频、旁白或声音草稿，供下游视频和文本节点使用。',
    category: 'asset',
    nodeLabel: '音频参考',
    // 对齐 LibTV "音频参考"：纯素材节点，不展示 prompt / TTS / 生成按钮。
    initialProperties: { mode: 'import' },
  },
  {
    id: 'asset-text-reference',
    type: 'linghui/text',
    label: '文本节点',
    description: '手动输入角色设定、剧情描述、镜头说明等文本内容。',
    category: 'asset',
    nodeLabel: '文本节点',
  },
  {
    id: 'generator-text',
    type: 'linghui/text',
    label: '文本生成器',
    description: '调用 LLM 生成提示词、设定、镜头说明或制作文本。',
    category: 'generation',
    nodeLabel: '文本生成器',
    initialProperties: { mode: 'generate' },
    recommendation: 'LLM',
  },
  {
    id: 'generator-agent',
    type: 'linghui/agent',
    label: 'Agent 节点',
    description: '消费上游文本与图片，调用工具并整理文本结论。',
    category: 'generation',
    nodeLabel: 'Agent',
    recommendation: '工具调用',
  },
  {
    id: 'generator-image',
    type: 'linghui/image',
    label: '图片生成器',
    description: '输入提示词生成图片，生成后可继续扩图、重绘、打光和多角度编辑。',
    category: 'generation',
    initialProperties: { mode: 'generate' },
    recommendation: '文生图',
  },
  {
    id: 'generator-video-text',
    type: 'linghui/video',
    label: '文生视频',
    description: '直接把剧情、镜头或提示词转成视频镜头。',
    category: 'generation',
    nodeLabel: '文生视频',
    initialProperties: { videoCapability: 'video.text-to-video' },
    recommendation: '视频生成',
  },
  {
    id: 'generator-video-image',
    type: 'linghui/video',
    label: '图生视频',
    description: '以图片参考作为首帧或主视觉，让画面动起来。',
    category: 'generation',
    nodeLabel: '图生视频',
    initialProperties: { videoCapability: 'video.image-to-video' },
    recommendation: '图片驱动',
  },
  {
    id: 'generator-video-reference',
    type: 'linghui/video',
    label: '全能参考',
    description: '把图片、文本、音频或视频作为统一参考生成镜头。',
    category: 'generation',
    nodeLabel: '全能参考视频',
    initialProperties: { videoCapability: 'video.reference-to-video' },
    recommendation: '多参考',
  },
  {
    id: 'generator-video-start-end',
    type: 'linghui/video',
    label: '首尾帧视频',
    description: '使用首帧和尾帧组织连续过渡。',
    category: 'generation',
    nodeLabel: '首尾帧视频',
    initialProperties: { videoCapability: 'video.start-end-to-video' },
    recommendation: '首尾帧',
  },
  {
    id: 'generator-audio',
    type: 'linghui/audio',
    label: '音频生成器',
    description: '把文本继续转成旁白、对白或音频草稿。',
    category: 'generation',
    nodeLabel: '音频生成器',
    recommendation: 'TTS',
  },
  {
    id: 'storyboard-script',
    type: 'linghui/script',
    label: '脚本生成器',
    description: '生成结构化脚本，并批量派生镜头文本、图片和视频。',
    category: 'storyboard',
    nodeLabel: '脚本生成器',
  },
  {
    id: 'storyboard-planner',
    type: 'linghui/storyboard',
    label: '故事板节点',
    description: '只填剧情大纲，自动拆出可拍摄镜头序列。',
    category: 'storyboard',
    nodeLabel: '故事板',
  },
  {
    id: 'spatial-panorama',
    type: 'linghui/panorama',
    label: '全景节点',
    description: '生成或导入全景环境图，并在画布中预览空间关系。',
    category: 'spatial',
    nodeLabel: '全景节点',
    recommendation: '空间',
  },
  {
    id: 'spatial-director3d',
    type: 'linghui/director3d',
    label: '3D 导演工作台',
    description: '低成本 3D 摆位、放假人、导出构图线稿参考。',
    category: 'spatial',
    nodeLabel: '3D 导演工作台',
  },
];

export const LINGHUI_CANVAS_CREATE_MENU_CATALOG: LinghuiNodeCatalogItem[] = CANVAS_CREATE_MENU_PRESETS
  .map(createMenuPreset)
  .filter((item): item is LinghuiNodeCatalogItem => Boolean(item));

export function resolveLinghuiQuickCreateCatalog(
  sourceDataType?: LinghuiSlotDataType | null,
): LinghuiNodeCatalogItem[] {
  if (!sourceDataType) {
    return LINGHUI_CANVAS_CREATE_MENU_CATALOG;
  }

  const presetItems = (QUICK_CREATE_PRESETS[sourceDataType] ?? [])
    .map(preset => buildPresetItem(preset, sourceDataType))
    .filter((item): item is LinghuiNodeCatalogItem => Boolean(item));
  const presetTypes = new Set(presetItems.map(item => item.type));
  const baseItems = LINGHUI_NODE_CATALOG
    .filter(item => !presetTypes.has(item.type))
    .map(item => buildCompatibleBaseItem(item, sourceDataType))
    .filter((item): item is LinghuiNodeCatalogItem => Boolean(item));

  return [
    ...presetItems,
    ...baseItems,
  ];
}
