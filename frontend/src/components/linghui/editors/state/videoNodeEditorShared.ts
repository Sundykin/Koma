import type {
  LinghuiVideoCapability,
  LinghuiVideoNodeProperties,
  LinghuiVideoToolKey,
} from '../../../../types/linghui';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { electronService } from '../../../../services/electronService';
import { stripDataHeader } from '../../../../utils/encoding';
import { fromKomaLocalUrl } from '../../../../utils/urlUtils';
import {
  VIDEO_CAPABILITY_LABELS,
  type LinghuiVideoCapability as SharedLinghuiVideoCapability,
} from './videoCapabilityUtils';
import type { VideoDurationSpec } from '../../../../providers/itv/durationSpec';

export function getPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}

export const decodeLinghuiMediaSource = fromKomaLocalUrl;

function isRemoteMediaUri(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

function isDataUri(source: string): boolean {
  return /^data:/i.test(source);
}

function isBlobUri(source: string): boolean {
  return /^blob:/i.test(source);
}

export function sanitizeFileSegment(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ');
  return normalized || fallback;
}

function getFileExtensionFromMimeType(mimeType?: string, fallback = 'mp4'): string {
  if (!mimeType) {
    return fallback;
  }

  const normalized = mimeType.toLowerCase();
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('quicktime') || normalized.includes('mov')) return 'mov';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('avi')) return 'avi';
  if (normalized.includes('mpeg')) return 'mpeg';
  if (normalized.includes('mp4')) return 'mp4';
  return fallback;
}

export function getVideoFileExtensionFromSource(source: string, mimeType?: string): string {
  const normalized = decodeLinghuiMediaSource(source);
  const matched = normalized.match(/\.([a-zA-Z0-9]+)(?:$|[?#])/);
  if (matched?.[1]) {
    return matched[1].toLowerCase();
  }
  return getFileExtensionFromMimeType(mimeType, 'mp4');
}

export async function writeVideoSourceToPath(source: string, targetPath: string): Promise<void> {
  const normalized = decodeLinghuiMediaSource(source);

  if (isRemoteMediaUri(normalized)) {
    await electronService.fs.downloadFile(normalized, targetPath);
    return;
  }

  if (isDataUri(normalized)) {
    await electronService.fs.writeFile(targetPath, stripDataHeader(normalized).base64, true);
    return;
  }

  if (isBlobUri(normalized)) {
    const response = await fetch(normalized);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await electronService.fs.writeFileBuffer(targetPath, bytes);
    return;
  }

  await electronService.fs.copy(normalized, targetPath);
}

export interface ProviderOption {
  value: string;
  label: string;
  capabilities: SharedLinghuiVideoCapability[];
  providerType?: string;
  durationSpec?: VideoDurationSpec;
  channelLabel?: string;
  modelLabel?: string;
}

export const VIDEO_CAPABILITIES: Array<{ key: LinghuiVideoCapability; label: string }> = [
  { key: 'video.text-to-video', label: VIDEO_CAPABILITY_LABELS['video.text-to-video'] },
  { key: 'video.image-to-video', label: VIDEO_CAPABILITY_LABELS['video.image-to-video'] },
  { key: 'video.reference-to-video', label: VIDEO_CAPABILITY_LABELS['video.reference-to-video'] },
  { key: 'video.start-end-to-video', label: VIDEO_CAPABILITY_LABELS['video.start-end-to-video'] },
];

export function formatVideoResolutionLabel(value: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '720P';
  }
  if (normalized.endsWith('p')) {
    return normalized.toUpperCase();
  }
  return normalized.toUpperCase();
}

export function formatVideoParameterSummary(params: {
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
}): string {
  const aspectRatio = String(params.aspectRatio ?? '').trim() || '16:9';
  const resolution = formatVideoResolutionLabel(String(params.resolution ?? '720p'));
  const duration = Number(params.duration ?? 5);
  return `${aspectRatio} · ${resolution} · ${duration}s`;
}

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
  clip: {
    title: '剪辑',
    description: '裁剪当前视频片段，输出新的本地视频节点。',
    buildPresets: () => [],
  },
  upscale: {
    title: '高清',
    description: '提升视频节点的画质预期与输出规格。',
    buildPresets: () => [
      {
        label: '1080P 电影质感',
        description: '提升清晰度、材质细节和边缘锐度。',
        promptSnippet: '高细节、高动态范围、电影级清晰度，主体边缘锐利，材质纹理完整。',
        properties: { resolution: '1080p' },
      },
      {
        label: '广告级精修',
        description: '偏商业广告与高质感镜头。',
        promptSnippet: '广告级成片质感，主体细节精修，反光和纹理清晰，画面稳定且高级。',
        properties: { resolution: '1080p' },
      },
    ],
  },
  'subtitle-remove': {
    title: '智能去字幕',
    description: 'AI 一键去除视频字幕，仅支持中英文字幕（待接入服务）。',
    buildPresets: () => [],
  },
  'audio-separation': {
    title: '音频分离',
    description: '把音轨从视频中独立出来；提供"音视频分离"（本地）与"人声分离"（云端，待接入）。',
    buildPresets: () => [],
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
};

export function mergePromptSnippet(currentPrompt: string, snippet?: string): string {
  const normalizedCurrent = currentPrompt.trim();
  const normalizedSnippet = String(snippet ?? '').trim();
  if (!normalizedSnippet) return normalizedCurrent;
  if (normalizedCurrent.includes(normalizedSnippet)) return normalizedCurrent;
  return normalizedCurrent ? `${normalizedCurrent}\n${normalizedSnippet}` : normalizedSnippet;
}
