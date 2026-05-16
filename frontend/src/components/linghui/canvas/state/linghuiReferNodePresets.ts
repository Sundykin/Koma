import {
  AudioLines,
  Image as ImageIcon,
  Scissors,
  ScrollText,
  Type,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
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
  key: 'text' | 'image' | 'video' | 'video-clip' | 'audio' | 'script';
  /** 实际派生出来的灵绘节点类型；video-clip 暂时映射到 linghui/video，但 UI 上 disabled */
  type: LinghuiNodeType;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: 'Beta';
  /** 灵绘当前是否有能力承接此项；为 false 时永久 disabled（视频合成在灵绘尚未实现） */
  available: boolean;
  /** 创建时附带的默认 properties（例如 video 的 capability） */
  initialProperties?: Record<string, unknown>;
  /**
   * 显式节点 label；不传则由 createNewNodeData 用全画布 counter 生成 LibTV 风默认名（"图片节点 N"）。
   * 仅在需要强制语义化命名时填（如 "全能参考视频"）。
   */
  nodeLabel?: string;
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
  },
  {
    key: 'video',
    type: 'linghui/video',
    label: '视频',
    description: '创意广告、动画、电影',
    icon: Video,
    available: true,
    initialProperties: { mode: 'generate', videoCapability: 'video.text-to-video' },
  },
  {
    key: 'video-clip',
    type: 'linghui/video',
    label: '视频合成',
    description: '多个视频片段合为一个',
    icon: Scissors,
    badge: 'Beta',
    // 灵绘暂未实现视频合成（无对应 executor），永久 disabled，与 LibTV "暂未上线 Beta 灰显" 视觉一致。
    available: false,
  },
  {
    key: 'audio',
    type: 'linghui/audio',
    label: '音频',
    description: '音效、配音、音乐',
    icon: AudioLines,
    available: true,
    initialProperties: { mode: 'generate' },
  },
  {
    key: 'script',
    type: 'linghui/script',
    label: '脚本',
    description: '创意脚本、生成故事板',
    icon: ScrollText,
    badge: 'Beta',
    available: true,
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
