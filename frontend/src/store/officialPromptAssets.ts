export type OfficialPromptAssetCategory =
  | 'script-conversion'
  | 'content-refinement'
  | 'chapter-division'
  | 'storyboard-inference'
  | 'batch-rewrite'
  | 'asset-extraction'
  | 'story-outline';

export interface OfficialPromptAsset {
  id: string;
  sourceFile: string;
  sourceTemplateId: string;
  name: string;
  order: number;
  category: OfficialPromptAssetCategory;
  platform: string;
  model: string;
  mappedOperatorId?: string;
  contentPreview: string;
}

export interface OfficialModelPresetAsset {
  id: string;
  label: string;
  provider: 'webui' | 'midjourney' | 'comfyui';
  currentTab: number;
  summary: string;
  comfyuiFlowName: string;
}

export interface OfficialPromptAssetSummary {
  totalPromptAssets: number;
  totalModelPresets: number;
  categories: Array<{
    category: OfficialPromptAssetCategory;
    label: string;
    count: number;
  }>;
}

const CATEGORY_LABELS: Record<OfficialPromptAssetCategory, string> = {
  'script-conversion': '剧本转换',
  'content-refinement': '内容精炼',
  'chapter-division': '章节划分',
  'storyboard-inference': '分镜推理',
  'batch-rewrite': '批量改写',
  'asset-extraction': '资产提取',
  'story-outline': '剧情参考',
};

export const OFFICIAL_PROMPT_ASSETS: OfficialPromptAsset[] = [
  {
    id: 'official-script-conversion-20004',
    sourceFile: 'preset_script_conversion.json',
    sourceTemplateId: '20004',
    name: '化繁为简',
    order: 0,
    category: 'script-conversion',
    platform: '默认',
    model: '默认',
    mappedOperatorId: 'script-conversion-basic',
    contentPreview: '按固定字数比例把长文案压成连续分镜，并要求上下镜头对话连贯。',
  },
  {
    id: 'official-script-conversion-20000',
    sourceFile: 'preset_script_conversion.json',
    sourceTemplateId: '20000',
    name: '默认剧本转换',
    order: 1,
    category: 'script-conversion',
    platform: '默认',
    model: '默认',
    mappedOperatorId: 'script-conversion-basic',
    contentPreview: '将输入文案转换为简化剧本格式，保留场景、描述和对话结构。',
  },
  {
    id: 'official-script-conversion-20001',
    sourceFile: 'preset_script_conversion.json',
    sourceTemplateId: '20001',
    name: '工作室爆量',
    order: 2,
    category: 'script-conversion',
    platform: '默认',
    model: '默认',
    mappedOperatorId: 'script-conversion-studio',
    contentPreview: '强调导演拉片思维、镜头类型和场面调度，适合高密度分镜生产。',
  },
  {
    id: 'official-script-conversion-20002',
    sourceFile: 'preset_script_conversion.json',
    sourceTemplateId: '20002',
    name: '简易不简单',
    order: 3,
    category: 'script-conversion',
    platform: '默认',
    model: '默认',
    mappedOperatorId: 'script-conversion-basic',
    contentPreview: '要求每个分镜控制在 15 秒左右，并额外保留人物字段，方便后续资产匹配。',
  },
  {
    id: 'official-script-conversion-20003',
    sourceFile: 'preset_script_conversion.json',
    sourceTemplateId: '20003',
    name: '进阶版',
    order: 4,
    category: 'script-conversion',
    platform: '默认',
    model: '默认',
    mappedOperatorId: 'script-conversion-advanced',
    contentPreview: '以影视工业标准组织功能、空间、镜头组和衔接，适合导演型分镜脚本。',
  },
  {
    id: 'official-content-condensation-1',
    sourceFile: 'preset_content_condensation.json',
    sourceTemplateId: '1',
    name: '默认模板',
    order: 1,
    category: 'content-refinement',
    platform: '默认',
    model: '默认',
    mappedOperatorId: 'content-condensation',
    contentPreview: '聚焦删繁就简，保留核心情节、人物关系和关键转折。',
  },
  {
    id: 'official-content-expansion-1',
    sourceFile: 'preset_content_expansion.json',
    sourceTemplateId: '1',
    name: '默认模板',
    order: 1,
    category: 'content-refinement',
    platform: '默认',
    model: '默认',
    mappedOperatorId: 'content-expansion',
    contentPreview: '基于原文继续扩写 200-300 字，补充细节与悬念但不偏离主线。',
  },
  {
    id: 'official-content-polish-1',
    sourceFile: 'preset_content_polish.json',
    sourceTemplateId: '1',
    name: '默认模板',
    order: 1,
    category: 'content-refinement',
    platform: '默认',
    model: '默认',
    mappedOperatorId: 'content-polish',
    contentPreview: '要求润色前后行数一致，逐行保持语义接近但表达不同。',
  },
  {
    id: 'official-inference-10000',
    sourceFile: 'preset_infer.json',
    sourceTemplateId: '10000',
    name: '默认 - Sora',
    order: 0,
    category: 'storyboard-inference',
    platform: '默认',
    model: '默认',
    mappedOperatorId: 'storyboard-inference-studio',
    contentPreview: '围绕上下镜连贯、角色/场景/物品映射和 prompt/video_prompt 双字段输出设计。',
  },
  {
    id: 'official-inference-10001',
    sourceFile: 'preset_infer.json',
    sourceTemplateId: '10001',
    name: '默认 - Wan2.2',
    order: 1,
    category: 'storyboard-inference',
    platform: '默认',
    model: '默认',
    mappedOperatorId: 'storyboard-inference-advanced',
    contentPreview: '强调六维一致性准则、台词合规和衔接前置指令，适合当前镜头连续性推理。',
  },
  {
    id: 'official-inference-10004',
    sourceFile: 'preset_infer.json',
    sourceTemplateId: '10004',
    name: '9宫格',
    order: 4,
    category: 'storyboard-inference',
    platform: '默认',
    model: '默认',
    mappedOperatorId: 'storyboard-inference-studio',
    contentPreview: '把当前分镜扩成 3x3 连续关键帧，兼顾静态网格和视频时间线输出。',
  },
  {
    id: 'official-batch-rewrite-10000',
    sourceFile: 'preset_chapter_batch_rewrite.json',
    sourceTemplateId: '10000',
    name: '章节批量文案改写',
    order: 1,
    category: 'batch-rewrite',
    platform: '默认',
    model: '默认',
    mappedOperatorId: 'batch-rewrite-advanced',
    contentPreview: '按 panel_index 返回逐镜头降重改写结果，保持含义与字数接近。',
  },
  {
    id: 'official-character-extract-10000',
    sourceFile: 'preset_extract.json',
    sourceTemplateId: '10000',
    name: '人物提取',
    order: 0,
    category: 'asset-extraction',
    platform: '默认',
    model: '默认',
    contentPreview: '输出角色 name、aliases、description，强调可区分的外观标签。',
  },
  {
    id: 'official-scene-extract-20000',
    sourceFile: 'preset_location_extract.json',
    sourceTemplateId: '20000',
    name: '场景提取',
    order: 0,
    category: 'asset-extraction',
    platform: '默认',
    model: '默认',
    contentPreview: '输出场景 name、aliases、description，并要求场景名称在四字以上。',
  },
  {
    id: 'official-prop-extract-10000',
    sourceFile: 'preset_item_extract.json',
    sourceTemplateId: '10000',
    name: '物品提取',
    order: 0,
    category: 'asset-extraction',
    platform: '默认',
    model: '默认',
    contentPreview: '输出关键物品的名称、代称和外观特征，用于后续镜头映射。',
  },
  {
    id: 'official-story-outline-10000',
    sourceFile: 'preset_reference.json',
    sourceTemplateId: '10000',
    name: '故事情节梗概',
    order: 1,
    category: 'story-outline',
    platform: '默认',
    model: '默认',
    contentPreview: '根据小说原文与推文文案压缩成 500 字以内的故事情节梗概。',
  },
];

export const OFFICIAL_MODEL_PRESETS: OfficialModelPresetAsset[] = [
  {
    id: '444',
    label: 'Niji V6.0',
    provider: 'midjourney',
    currentTab: 0,
    summary: '偏向 Niji 风格，默认 guidance 2.5，适合作为插画向镜头基线。',
    comfyuiFlowName: '用户自配工作流',
  },
  {
    id: '22222',
    label: 'MJ V6.0',
    provider: 'midjourney',
    currentTab: 0,
    summary: '标准 Midjourney V6.0 预设，适合作为通用分镜参考模型。',
    comfyuiFlowName: '用户自配工作流',
  },
  {
    id: '888',
    label: 'MJ V6.0 高引导',
    provider: 'midjourney',
    currentTab: 0,
    summary: '保留 9/9.5 的 steps/cfg 组合，适合作为高约束风格模板参考。',
    comfyuiFlowName: '用户自配工作流',
  },
];

export function getOfficialPromptAssetCategoryLabel(category: OfficialPromptAssetCategory): string {
  return CATEGORY_LABELS[category];
}

export function getOfficialPromptAssetSummary(): OfficialPromptAssetSummary {
  const counts = new Map<OfficialPromptAssetCategory, number>();
  OFFICIAL_PROMPT_ASSETS.forEach((asset) => {
    counts.set(asset.category, (counts.get(asset.category) || 0) + 1);
  });

  return {
    totalPromptAssets: OFFICIAL_PROMPT_ASSETS.length,
    totalModelPresets: OFFICIAL_MODEL_PRESETS.length,
    categories: Array.from(counts.entries())
      .map(([category, count]) => ({
        category,
        label: getOfficialPromptAssetCategoryLabel(category),
        count,
      }))
      .sort((left, right) => right.count - left.count),
  };
}

export function getOfficialPromptAssetsByCategory(
  category: OfficialPromptAssetCategory,
): OfficialPromptAsset[] {
  return OFFICIAL_PROMPT_ASSETS
    .filter((asset) => asset.category === category)
    .sort((left, right) => left.order - right.order);
}
