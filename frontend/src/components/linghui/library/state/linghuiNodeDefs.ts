import type {
  LinghuiNodeCatalogItem,
  LinghuiNodeData,
  LinghuiNodeType,
} from '../../../../types/linghui';
import { createDefaultDirector3DScene } from '../../director3d/director3dScene';
import {
  LIBTV_PANORAMA_SLASH_LABEL,
  LIBTV_PANORAMA_SLASH_QUALITY,
  LIBTV_PANORAMA_SLASH_SCENE,
  LIBTV_PANORAMA_SUBMIT_MODEL_KEY,
  LIBTV_PANORAMA_WITH_PROMPT_SCENE,
  getLibTVPanoramaRatioForModel,
} from '../../panorama/panoramaPromptTemplate';
import { DEFAULT_LINGHUI_STORYBOARD_SCENE } from '../../editors/state/linghuiStoryboardScenes';

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
  /**
   * LibTV 节点默认 label 的递增序号：`${nodeKindLabel} ${serial}` → 如 "图片节点 5"、"视频节点 7"。
   * 全画布按创建顺序递增（跨节点类型共享 counter，与 LibTV `++r.current` 一致）。
   * 调用方应传入当前画布节点总数 + 1。如未传，则降级到 NODE_META.title 作为 label。
   */
  serial?: number;
}

/**
 * 节点 label 模板：LibTV 把所有节点都按 "图片节点 N" / "视频节点 N" 命名。
 * 这里映射 linghui type → label 前缀。
 */
export const NODE_LABEL_TEMPLATE: Record<LinghuiNodeType, string> = {
  'linghui/text': '文本节点',
  'linghui/agent': 'Agent 节点',
  'linghui/image': '图片节点',
  'linghui/panorama': '全景节点',
  'linghui/video': '视频节点',
  'linghui/audio': '音频节点',
  'linghui/script': '脚本节点',
  'linghui/storyboard': '故事板节点',
  'linghui/director3d': '3D 导演工作台',
  'linghui/image-grid-slice': '宫格切分',
  'linghui/video-clip': '视频合成',
};

const LINGHUI_NODE_BACKGROUND = 'var(--token-bg-card)';
const LINGHUI_NODE_COLORS = {
  text: 'var(--token-status-warning)',
  agent: 'var(--token-status-info)',
  image: 'var(--token-status-success)',
  video: 'var(--token-accent-base)',
  audio: 'var(--token-status-warning)',
  script: 'var(--token-accent-hover)',
  storyboard: 'var(--token-accent-base)',
  director3d: 'var(--token-status-info)',
} as const;

export const NODE_META: Record<LinghuiNodeType, LinghuiNodeMeta> = {
  'linghui/text': {
    type: 'linghui/text',
    title: '文本',
    desc: '手动输入文本，或调用 LLM 生成文本块',
    catalogCategory: 'asset',
    catalogLabel: '文本节点',
    catalogDescription: '输入角色设定、剧情描述、镜头说明等文本内容',
    accent: LINGHUI_NODE_COLORS.text,
    background: LINGHUI_NODE_BACKGROUND,
  },
  'linghui/agent': {
    type: 'linghui/agent',
    title: 'Agent',
    desc: '执行单 Agent 推理与工具调用，输出文本结果',
    catalogCategory: 'generation',
    catalogLabel: 'Agent 节点',
    catalogDescription: '消费上游文本与图片，调用工具并整理文本结论',
    accent: LINGHUI_NODE_COLORS.agent,
    background: LINGHUI_NODE_BACKGROUND,
  },
  'linghui/image': {
    type: 'linghui/image',
    title: '图片',
    desc: '统一图片生成节点，支持单图/宫格/多角度',
    catalogCategory: 'asset',
    catalogLabel: '图片节点',
    catalogDescription: '生成图片，支持单图、宫格、多参考',
    accent: LINGHUI_NODE_COLORS.image,
    background: LINGHUI_NODE_BACKGROUND,
  },
  'linghui/panorama': {
    type: 'linghui/panorama',
    title: '全景',
    desc: '生成 720° 全景环境板，结果支持球面拖拽预览',
    catalogCategory: 'spatial',
    catalogLabel: '全景节点',
    catalogDescription: '生成或导入全景环境图，并在画布中预览空间关系',
    accent: LINGHUI_NODE_COLORS.image,
    background: LINGHUI_NODE_BACKGROUND,
  },
  'linghui/video': {
    type: 'linghui/video',
    title: '视频',
    desc: '统一视频生成节点，支持文生、图生、参考生和首尾帧',
    catalogCategory: 'generation',
    catalogLabel: '视频节点',
    catalogDescription: '生成视频，按模型能力切换不同视频模式',
    accent: LINGHUI_NODE_COLORS.video,
    background: LINGHUI_NODE_BACKGROUND,
  },
  'linghui/audio': {
    type: 'linghui/audio',
    title: '音频',
    desc: '统一音频节点，支持上传音频或文本转语音',
    catalogCategory: 'asset',
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
  'linghui/storyboard': {
    type: 'linghui/storyboard',
    title: '故事板',
    desc: '内置导演级提示词，剧情大纲一键拆分镜',
    catalogCategory: 'storyboard',
    catalogLabel: '故事板节点',
    catalogDescription: '只填剧情大纲，自动拆出 6-24 个可拍摄镜头，结构与脚本节点兼容',
    accent: LINGHUI_NODE_COLORS.storyboard,
    background: LINGHUI_NODE_BACKGROUND,
  },
  'linghui/director3d': {
    type: 'linghui/director3d',
    title: '3D 导演',
    desc: '3D 草图工作台：摆机位、放假人、导出线稿构图参考',
    catalogCategory: 'spatial',
    catalogLabel: '3D 导演工作台',
    catalogDescription: '低成本 3D 摆位 + 假人 + 相机，导出 lineart 给图片/视频节点参考',
    accent: LINGHUI_NODE_COLORS.director3d,
    background: LINGHUI_NODE_BACKGROUND,
  },
  // 宫格切分中间节点：作为"切分流程"的中间步骤，不出现在 quickCreate 主菜单，仅由 grid-split 工具派生。
  'linghui/image-grid-slice': {
    type: 'linghui/image-grid-slice',
    title: '宫格切分',
    desc: '把上游图切成 N 个槽位，每个槽位可独立派生为图节点',
    catalogCategory: 'asset',
    catalogLabel: '宫格切分',
    catalogDescription: '上游主图本地切成 N 槽，每槽位可独立"彻底切分"派生为图节点',
    accent: LINGHUI_NODE_COLORS.image,
    background: LINGHUI_NODE_BACKGROUND,
  },
  // 视频合成节点：把多个 video / image 片段拼合为单一视频；点详情进"最终剪辑"工具。
  'linghui/video-clip': {
    type: 'linghui/video-clip',
    title: '视频合成',
    desc: '把多个视频/图片片段拼合为单一视频',
    catalogCategory: 'generation',
    catalogLabel: '视频合成',
    catalogDescription: '本地 FFmpeg concat 多个 video/image 片段（image 转 N 秒静帧），输出最终 mp4',
    accent: LINGHUI_NODE_COLORS.video,
    background: LINGHUI_NODE_BACKGROUND,
  },
};


import { NODE_SLOT_LAYOUTS } from './linghuiConnectionValidation';
export { NODE_SLOT_LAYOUTS, SLOT_TYPE_LABELS, isLinghuiSlotDataTypeCompatible, resolveLinghuiCompatibleInputSlot, validateLinghuiConnection, isLinghuiConnectionValid } from './linghuiConnectionValidation';
export type { LinghuiConnectionValidationResult } from './linghuiConnectionValidation';
export const NODE_PROPERTY_DEFAULTS: Record<LinghuiNodeType, Record<string, unknown>> = {
  // LibTV TextNode 默认无 action，UI 渲染走 empty_generate 视图态（15gvxu:55066-55074）。
  // 灵绘类型要求 mode 必填 → 默认 'generate' 让新节点显示 EmptyState 4 actions；
  // 用户点"自己编写内容"后再切到 'manual'。
  'linghui/text': {
    mode: 'generate',
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
    focusRegion: null,
    markPoints: [],
    cinematic: { lighting: 'auto', focalLength: 'auto', aperture: 'auto' },
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
    aspectRatio: getLibTVPanoramaRatioForModel(LIBTV_PANORAMA_SUBMIT_MODEL_KEY),
    resolution: 'auto',
    gridType: 'none',
    batchCount: 1,
    focusRegion: null,
    markPoints: [],
    cinematic: { lighting: 'auto', focalLength: 'auto', aperture: 'auto' },
    // 全景模板档位：'auto' | 'indoor' | 'outdoor'，影响执行器拼装的 system prompt
    panoramaTemplate: 'auto',
    // LibTV 全景 slash 默认用 lib-image-2 + 2:1，等价于真经纬球面预览。
    projectionMode: 'equirectangular-2to1',
    panoramaSlashScene: LIBTV_PANORAMA_SLASH_SCENE,
    panoramaWithPromptScene: LIBTV_PANORAMA_WITH_PROMPT_SCENE,
    panoramaSlashLabel: LIBTV_PANORAMA_SLASH_LABEL,
    panoramaModelKey: LIBTV_PANORAMA_SUBMIT_MODEL_KEY,
    panoramaQuality: LIBTV_PANORAMA_SLASH_QUALITY,
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
    mode: 'generate',
  },
  'linghui/audio': {
    source: '',
    prompt: '',
    ttsSelection: '',
    voiceId: '',
    mode: 'generate',
  },
  'linghui/script': {
    mode: 'manual',
    content: '',
    prompt: '',
    systemPrompt: '',
    llmSelection: '',
    viewMode: 'cards',
  },
  // 故事板节点：剧情→分镜傻瓜版，不暴露 mode / systemPrompt 字段
  'linghui/storyboard': {
    prompt: '',
    llmSelection: '',
    scene: DEFAULT_LINGHUI_STORYBOARD_SCENE,
    viewMode: 'cards',
    targetShotCount: 9,
  },
  'linghui/director3d': {
    prompt: '',
    scene: createDefaultDirector3DScene(),
  },
  // 宫格切分中间节点：派生时由 documentOps 显式给 slots 充值；空 source 时显示"等待上游"占位。
  'linghui/image-grid-slice': {
    source: '',
    gridType: '3x3',
    slots: [],
  },
  // 视频合成节点：默认空 clips 列表 + 1080p/30fps/3s 静帧时长；执行器读取 clips 调 FFmpeg concat。
  'linghui/video-clip': {
    clips: [],
    resolution: '1080p',
    fps: 30,
    imageDurationSec: 3,
    source: '',
    posterSource: '',
    status: 'idle',
  },
};

export const LINGHUI_NODE_CATALOG: LinghuiNodeCatalogItem[] = Object.values(NODE_META)
  .map(meta => ({
    type: meta.type,
    label: meta.catalogLabel,
    description: meta.catalogDescription,
    category: meta.catalogCategory,
    accent: meta.accent,
  }));

export function getLinghuiNodeMeta(type?: string | null): LinghuiNodeMeta | undefined {
  return type ? NODE_META[type as LinghuiNodeType] : undefined;
}

export function getLinghuiNodeAccent(type?: string | null): string {
  return getLinghuiNodeMeta(type)?.accent ?? 'var(--token-accent-base)';
}

export function createNewNodeData(type: LinghuiNodeType, options?: CreateNewNodeDataOptions): LinghuiNodeData {
  const meta = NODE_META[type];
  const slots = NODE_SLOT_LAYOUTS[type];
  const defaults = NODE_PROPERTY_DEFAULTS[type];
  const fallbackLabel = NODE_LABEL_TEMPLATE[type] ?? meta.title;
  const resolvedLabel = options?.label?.trim() || (typeof options?.serial === 'number' ? `${fallbackLabel} ${options.serial}` : fallbackLabel);
  return {
    linghuiType: type, label: resolvedLabel, accent: meta.accent, background: meta.background,
    viewMode: 'light', properties: { ...defaults },
    inputs: slots.inputs.map(s => ({ ...s })), outputs: slots.outputs.map(s => ({ ...s })),
    active: false,
  };
}
