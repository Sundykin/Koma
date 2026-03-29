import type {
  LinghuiVideoCapability,
  LinghuiVideoNodeProperties,
  LinghuiVideoToolKey,
} from '../../types/linghui';
import { electronService } from '../../services/electronService';
import {
  VIDEO_CAPABILITY_LABELS,
  type LinghuiVideoCapability as SharedLinghuiVideoCapability,
} from './videoCapabilityUtils';

export function getPreviewSource(source?: string): string {
  if (!source) return '';
  if (source.startsWith('http') || source.startsWith('data:') || source.startsWith('blob:') || source.startsWith('koma-local://')) return source;
  return electronService.fs.toLocalUrl(source);
}

export interface ProviderOption {
  value: string;
  label: string;
  capabilities: SharedLinghuiVideoCapability[];
  channelLabel?: string;
  modelLabel?: string;
}

export const VIDEO_CAPABILITIES: Array<{ key: LinghuiVideoCapability; label: string }> = [
  { key: 'video.text-to-video', label: VIDEO_CAPABILITY_LABELS['video.text-to-video'] },
  { key: 'video.image-to-video', label: VIDEO_CAPABILITY_LABELS['video.image-to-video'] },
  { key: 'video.reference-to-video', label: VIDEO_CAPABILITY_LABELS['video.reference-to-video'] },
  { key: 'video.start-end-to-video', label: VIDEO_CAPABILITY_LABELS['video.start-end-to-video'] },
];

export const DURATION_OPTIONS = [
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
];

export interface VideoToolPreset {
  label: string;
  description: string;
  promptSnippet?: string;
  properties?: Partial<LinghuiVideoNodeProperties>;
}

export const VIDEO_TOOL_PRESETS: Record<LinghuiVideoToolKey, {
  title: string;
  description: string;
  buildPresets: (context: {
    imageCount: number;
    videoCount: number;
    audioCount: number;
    videoCapability: LinghuiVideoCapability;
  }) => VideoToolPreset[];
}> = {
  upscale: {
    title: '高清',
    description: '提升视频节点的画质预期与输出规格。',
    buildPresets: () => [
      {
        label: '1080P 电影质感',
        description: '提升清晰度、材质细节和边缘锐度。',
        promptSnippet: '高细节、高动态范围、电影级清晰度，主体边缘锐利，材质纹理完整。',
        properties: { resolution: '1080P' },
      },
      {
        label: '广告级精修',
        description: '偏商业广告与高质感镜头。',
        promptSnippet: '广告级成片质感，主体细节精修，反光和纹理清晰，画面稳定且高级。',
        properties: { resolution: '1080P' },
      },
    ],
  },
  analyze: {
    title: '解析',
    description: '根据当前参考输入自动组织一份可继续细化的提示词骨架。',
    buildPresets: ({ imageCount, videoCount, audioCount, videoCapability }) => [
      {
        label: '写入镜头解析骨架',
        description: '把当前输入结构整理成一份更适合继续润色的提示词。',
        promptSnippet: [
          `基于当前输入制作一段${VIDEO_CAPABILITY_LABELS[videoCapability]}。`,
          imageCount > 0 ? `保留 ${imageCount} 张图片参考中的主体和视觉风格。` : '',
          videoCount > 0 ? `吸收 ${videoCount} 条视频参考中的运动节奏和镜头语言。` : '',
          audioCount > 0 ? `让画面动作与 ${audioCount} 条音频输入的节奏保持同步。` : '',
          '镜头运动稳定，主体清晰，动作连贯，转场自然。',
        ].filter(Boolean).join(' '),
      },
      {
        label: '写入分镜节奏骨架',
        description: '更强调开场、推进和收束的镜头节奏。',
        promptSnippet: '镜头节奏清晰：开场建立环境，中段推进主体动作，结尾收束到视觉高潮，整体连贯不跳切。',
      },
    ],
  },
  compose: {
    title: '合成',
    description: '把图片、视频和音频输入重新编排成更明确的合成方式。',
    buildPresets: () => [
      {
        label: '纯提示词推进',
        description: '切到文生视频模式，只保留提示词驱动。',
        promptSnippet: '仅依据提示词控制镜头运动、构图节奏和主体表演，不依赖明确的视觉参考图。',
        properties: { videoCapability: 'video.text-to-video' },
      },
      {
        label: '主图动起来',
        description: '以第一张主图为核心生成动态镜头。',
        promptSnippet: '以主图中的主体和构图为基础，让动作自然展开，镜头连贯稳定。',
        properties: { videoCapability: 'video.image-to-video' },
      },
      {
        label: '融合全部参考',
        description: '优先整合所有视觉参考和音频氛围。',
        promptSnippet: '融合全部参考输入，统一主体风格、镜头节奏与氛围细节，避免素材割裂。',
        properties: { videoCapability: 'video.reference-to-video' },
      },
      {
        label: '首尾帧过渡',
        description: '以首帧到尾帧的方式组织镜头演化。',
        promptSnippet: '以首帧到尾帧的明确变化来组织镜头推进，中间过程连贯自然，过渡平滑。',
        properties: { videoCapability: 'video.start-end-to-video' },
      },
    ],
  },
};

export function mergePromptSnippet(currentPrompt: string, snippet?: string): string {
  const normalizedCurrent = currentPrompt.trim();
  const normalizedSnippet = String(snippet ?? '').trim();
  if (!normalizedSnippet) return normalizedCurrent;
  if (normalizedCurrent.includes(normalizedSnippet)) return normalizedCurrent;
  return normalizedCurrent ? `${normalizedCurrent}\n${normalizedSnippet}` : normalizedSnippet;
}
