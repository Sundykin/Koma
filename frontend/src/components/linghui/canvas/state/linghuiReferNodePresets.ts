import {
  AudioLines,
  Boxes,
  Image as ImageIcon,
  Mountain,
  Scissors,
  ScrollText,
  Type,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  LinghuiNodeCategory,
  LinghuiNodeType,
  LinghuiSlotDataType,
} from '../../../../types/linghui';
import { resolveLinghuiCompatibleInputSlot } from '../../library/state/linghuiNodeDefs';

/**
 * LibTV "引用该节点生成" 面板的真实 6 项（来源：libtv 打包 chunk 0gg5ir~xd-ho3.js）。
 *
 *   { type: TEXT,       label: "文本",     description: "剧本、广告词、品牌文案" }
 *   { type: IMAGE,      label: "图片",     description: "海报、分镜、角色设计" }
 *   { type: VIDEO,      label: "视频",     description: "创意广告、动画、电影" }
 *   { type: VIDEO_CLIP, label: "视频合成", description: "多个视频片段合为一个", badge: "Beta" }
 *   { type: AUDIO,      label: "音频",     description: "音效、配音、音乐" }
 *   { type: SCRIPT,     label: "脚本",     description: "创意脚本、生成故事板", badge: "Beta" }
 *
 * 兼容性检查：disabled = (有上游 sourceDataType) && (该上游类型不能接到该 target 节点的任何 input)。
 * UI 期望：始终展示 6 项（不过滤），不兼容时变灰禁用，与 LibTV 完全一致。
 */
export interface LinghuiReferNodePreset {
  /** LibTV 内部 NodeType key（带 _CLIP 这种灵绘暂时没有的） */
  key: 'text' | 'image' | 'video' | 'video-clip' | 'audio' | 'script' | 'panorama' | 'director3d';
  /** 实际派生出来的灵绘节点类型 */
  type: LinghuiNodeType;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: 'Beta';
  /** 灵绘当前是否有能力承接此项；为 false 时永久 disabled */
  available: boolean;
  /** 创建时附带的默认 properties（例如 video 的 capability） */
  initialProperties?: Record<string, unknown>;
  /**
   * 显式节点 label；不传则由 createNewNodeData 用全画布 counter 生成 LibTV 风默认名（"图片节点 N"）。
   * 仅在需要强制语义化命名时填（如 "全能参考视频"）。
   */
  nodeLabel?: string;
  /** 用于"添加节点"非连线场景下的分组（素材 / 生成 / 剧情 / 空间）。 */
  category: LinghuiNodeCategory;
  /**
   * 仅在"连线松开 → 引用该节点生成"场景下显示。空间类节点（全景 / 3D 导演）只在添加节点场景才出现，
   * 上游连线模式下隐藏（避免上游链上数据类型不匹配）。
   */
  hideInReferMode?: boolean;
}

export const LINGHUI_REFER_NODE_PRESETS: LinghuiReferNodePreset[] = [
  {
    key: 'text',
    type: 'linghui/text',
    label: '文本',
    description: '剧本、广告词、品牌文案',
    icon: Type,
    available: true,
    initialProperties: { mode: 'generate' },
    category: 'asset',
  },
  {
    key: 'image',
    // LibTV 1:1：图片节点统一是 linghui/image，按 mode + 是否有 result 分三态渲染。
    // 不再有独立的 image-generator 类型；新建图片节点 = mode='generate' + 空 source。
    type: 'linghui/image',
    label: '图片',
    description: '海报、分镜、角色设计',
    icon: ImageIcon,
    available: true,
    initialProperties: { mode: 'generate' },
    category: 'asset',
  },
  {
    key: 'video',
    type: 'linghui/video',
    label: '视频',
    description: '创意广告、动画、电影',
    icon: Video,
    available: true,
    initialProperties: { mode: 'generate', videoCapability: 'video.text-to-video' },
    category: 'generation',
  },
  {
    key: 'video-clip',
    // #16 已加 linghui/video-clip 节点类型，开放派生入口
    type: 'linghui/video-clip',
    label: '视频合成',
    description: '多个视频片段合为一个',
    icon: Scissors,
    badge: 'Beta',
    available: true,
    category: 'generation',
  },
  {
    key: 'audio',
    type: 'linghui/audio',
    label: '音频',
    description: '音效、配音、音乐',
    icon: AudioLines,
    available: true,
    initialProperties: { mode: 'generate' },
    category: 'asset',
  },
  {
    key: 'script',
    type: 'linghui/script',
    label: '脚本',
    description: '创意脚本、生成故事板',
    icon: ScrollText,
    badge: 'Beta',
    available: true,
    category: 'storyboard',
  },
  // 用户要求：把全景节点 + 3D 导演工作台也加入到统一的 quickCreate 菜单
  {
    key: 'panorama',
    type: 'linghui/panorama',
    label: '全景节点',
    description: '生成或导入全景环境图，并在画布中预览空间关系',
    icon: Mountain,
    available: true,
    initialProperties: { mode: 'generate' },
    category: 'spatial',
    // 上游引用场景下不显示（全景是输入节点不是输出端）
    hideInReferMode: true,
  },
  {
    key: 'director3d',
    type: 'linghui/director3d',
    label: '3D 导演工作台',
    description: '搭建 3D 场景、摆位、布光，导出参考图给下游 image 节点',
    icon: Boxes,
    available: true,
    category: 'spatial',
    hideInReferMode: true,
  },
];

/**
 * 根据上游 sourceDataType 判断某项 LibTV preset 是否兼容（可连）。
 * sourceDataType 为空 / undefined 时，仅以 available 决定 disabled 状态（无连线场景）。
 */
export function isReferPresetCompatible(
  preset: LinghuiReferNodePreset,
  sourceDataType?: LinghuiSlotDataType | null,
): boolean {
  if (!preset.available) return false;
  if (!sourceDataType) return true;
  return Boolean(resolveLinghuiCompatibleInputSlot(preset.type, sourceDataType));
}
