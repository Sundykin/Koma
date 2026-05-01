import { getProjectITVProvider, getProjectTTIProvider } from '../../providers';
import type { ProviderAssetInput } from '../../types';
import type { AttachmentFile } from './ChatComposer';
import { uploadBytesToImageHostingWithRetry } from '../../services/imageHostingService';

export type ChatMediaMode =
  | 'chat'
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'start-end-to-video'
  | 'reference-to-video';

/** 视频子模式（UI 层） */
export type VideoSubMode = 'text' | 'image' | 'first-last' | 'multi-ref';

/** 视频子模式 → 后端 capability */
export function videoSubModeToCapability(sub: VideoSubMode): Exclude<ChatMediaMode, 'chat' | 'text-to-image' | 'image-to-image'> {
  switch (sub) {
    case 'text': return 'text-to-video';
    case 'image': return 'image-to-video';
    case 'first-last': return 'start-end-to-video';
    case 'multi-ref': return 'reference-to-video';
  }
}

export interface ChatImageRef {
  id: string;
  label: string;
  source: string;
  mimeType?: string;
  origin: 'upload' | 'generated';
  /** 是否还未跟随消息送出（true=本次输入暂存，false=已经在对话历史里） */
  pending?: boolean;
}

export interface ChatGeneratedMediaResult {
  images: ChatImageRef[];
  video?: string;
}

/** 用户在输入框上选择的生图/生视频参数 */
export interface ChatMediaParams {
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  count?: number;
}

/**
 * 一条媒体生成消息的完整元信息，存于 ChatMessage.metadata.mediaResult
 * 用于：
 *   - 渲染媒体结果卡片（标题/网格/按钮）
 *   - "重新编辑" 把参数还原到输入框
 *   - "再次生成" 用相同参数再触发一次
 */
export interface MediaResultMeta {
  kind: 'media-result';
  mode: Exclude<ChatMediaMode, 'chat'>;
  prompt: string;
  modelLabel?: string;
  modelSelectionKey?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  count?: number;
  generating?: boolean;
  error?: string;
  images?: ChatImageRef[];
  video?: string;
  /** 触发时使用的源参考图（用于"再次生成"复刻） */
  sourceImageRefs?: ChatImageRef[];
}

export const ASPECT_RATIO_OPTIONS = ['1:1', '21:9', '16:9', '3:2', '4:3', '3:4', '2:3', '9:16'] as const;
export const VIDEO_DURATION_OPTIONS = [5, 8, 10, 12] as const;
export const IMAGE_RESOLUTION_OPTIONS = ['1K', '2K', '4K'] as const;
export const IMAGE_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function detectChatMediaMode(text: string, attachments: AttachmentFile[] = []): ChatMediaMode {
  const lower = text.toLowerCase();
  const hasImageInput = attachments.some(a => a.type === 'image') || extractChatImageMentionLabels(text).length > 0;
  if (/图生视频|生视频|视频|动态|video|i2v/.test(lower) && hasImageInput) return 'image-to-video';
  if (/图生图|参考生图|垫图|改图|重绘|image-to-image|i2i/.test(lower) && hasImageInput) return 'image-to-image';
  if (/文生图|生图|生成图|画一张|出图|图片|image/.test(lower)) return hasImageInput ? 'image-to-image' : 'text-to-image';
  return 'chat';
}

export function extractChatImageMentionLabels(text: string): string[] {
  return Array.from(text.matchAll(/@图片(\d+)/g)).map(match => `图片${match[1]}`);
}

export function resolveChatImageReferences(params: {
  text: string;
  attachments: AttachmentFile[];
  imageRefs: ChatImageRef[];
  attachmentDataUrls: string[];
}): string[] {
  const mentioned = extractChatImageMentionLabels(params.text);
  const mentionedSources = mentioned
    .map(label => params.imageRefs.find(ref => ref.label === label)?.source)
    .filter(Boolean) as string[];
  if (mentionedSources.length > 0) return mentionedSources;
  return params.attachmentDataUrls;
}

export function stripChatImageMentions(text: string): string {
  return text.replace(/@图片\d+/g, '').replace(/\s+/g, ' ').trim();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToProviderInput(dataUrl: string): ProviderAssetInput {
  const mimeType = dataUrl.match(/^data:([^;,]+)/)?.[1];
  return { transport: 'data-url', value: dataUrl, mimeType };
}

function sourceToProviderInput(source: string): ProviderAssetInput {
  if (/^https?:\/\//i.test(source)) {
    return { transport: 'remote-url', value: source };
  }
  return dataUrlToProviderInput(source);
}

export async function imageAttachmentsToDataUrls(attachments: AttachmentFile[]): Promise<string[]> {
  return Promise.all(
    attachments
      .filter(a => a.type === 'image')
      .map(a => fileToDataUrl(a.file)),
  );
}

/**
 * 将图片附件上传到图床插件，返回远程 URL 列表（保持入参顺序）。
 * 未配置图床或上传失败时抛出错误，由调用方决定如何提示用户。
 */
export async function uploadAttachmentImagesToHosting(
  attachments: AttachmentFile[],
): Promise<string[]> {
  const imageAttachments = attachments.filter(a => a.type === 'image');
  if (imageAttachments.length === 0) return [];

  const urls: string[] = [];
  for (const attachment of imageAttachments) {
    const buf = await attachment.file.arrayBuffer();
    const result = await uploadBytesToImageHostingWithRetry(
      new Uint8Array(buf),
      { filename: attachment.file.name },
    );
    if (!result.success || !result.url) {
      throw new Error(result.error || `图片 ${attachment.file.name} 上传到图床失败`);
    }
    urls.push(result.url);
  }
  return urls;
}

function getImageOutputSources(output: any): string[] {
  const batchImages = output?.metadata?.batchImages;
  if (Array.isArray(batchImages) && batchImages.length > 0) {
    return batchImages.map((item) => item.url || item.path).filter(Boolean);
  }
  return [output?.url || output?.path].filter(Boolean);
}

export function getChatMediaDisplaySource(source: string | undefined): string | undefined {
  return source;
}

export function createChatImageRefs(params: {
  sources: string[];
  origin: ChatImageRef['origin'];
  existingCount: number;
  mimeTypes?: Array<string | undefined>;
}): ChatImageRef[] {
  return params.sources.map((source, index) => {
    const number = params.existingCount + index + 1;
    return {
      id: `chat-image-${Date.now()}-${number}-${Math.random().toString(36).slice(2, 8)}`,
      label: `图片${number}`,
      source,
      mimeType: params.mimeTypes?.[index],
      origin: params.origin,
    };
  });
}

export async function generateChatMedia(params: {
  text: string;
  mode: Exclude<ChatMediaMode, 'chat'>;
  attachments: AttachmentFile[];
  imageRefs: ChatImageRef[];
  ttiSelection?: string;
  itvSelection?: string;
  existingImageCount: number;
  mediaParams?: ChatMediaParams;
}): Promise<ChatGeneratedMediaResult> {
  const attachmentDataUrls = await imageAttachmentsToDataUrls(params.attachments);
  const prompt = stripChatImageMentions(params.text);
  const referenceSources = resolveChatImageReferences({
    text: params.text,
    attachments: params.attachments,
    imageRefs: params.imageRefs,
    attachmentDataUrls,
  });

  const generatedImages: ChatImageRef[] = [];
  if (params.mode === 'text-to-image' || params.mode === 'image-to-image') {
    if (params.mode === 'image-to-image' && referenceSources.length === 0) {
      throw new Error('图生图需要上传图片或使用 @图片 引用历史图片');
    }
    const provider = await getProjectTTIProvider(params.ttiSelection, 'image.text-to-image');
    if (!provider) throw new Error('未配置 TTI 生图服务');
    const ttiOptions: Record<string, unknown> = {};
    if (params.mediaParams?.aspectRatio) ttiOptions.aspectRatio = params.mediaParams.aspectRatio;
    if (params.mediaParams?.resolution) ttiOptions.imageSize = params.mediaParams.resolution;
    const requestedCount = Math.min(Math.max(params.mediaParams?.count ?? 1, 1), 9);
    const started = await provider.start({
      prompt,
      references: referenceSources.map(sourceToProviderInput),
      count: requestedCount,
      options: Object.keys(ttiOptions).length > 0 ? ttiOptions as any : undefined,
    });
    if (started.mode !== 'immediate') {
      throw new Error('当前 TTI 渠道返回异步任务，对话内暂不支持等待该任务完成');
    }
    const sources = getImageOutputSources(started.output);
    generatedImages.push(...createChatImageRefs({
      sources,
      origin: 'generated',
      existingCount: params.existingImageCount,
    }));
  }

  let video: string | undefined;
  const isVideoMode = params.mode === 'text-to-video'
    || params.mode === 'image-to-video'
    || params.mode === 'start-end-to-video'
    || params.mode === 'reference-to-video';
  if (isVideoMode) {
    // 入参校验
    if (params.mode === 'image-to-video' && referenceSources.length === 0) {
      throw new Error('图生视频需要至少 1 张参考图');
    }
    if (params.mode === 'start-end-to-video' && referenceSources.length < 2) {
      throw new Error('首尾帧视频需要按顺序提供 2 张参考图（首帧、尾帧）');
    }
    if (params.mode === 'reference-to-video' && referenceSources.length === 0) {
      throw new Error('多参考视频至少需要 1 张参考图');
    }

    const capabilityFor = `video.${params.mode}` as
      | 'video.text-to-video' | 'video.image-to-video'
      | 'video.start-end-to-video' | 'video.reference-to-video';
    const provider = await getProjectITVProvider(params.itvSelection, capabilityFor);
    if (!provider) throw new Error('未配置 ITV 视频生成服务（或当前模型不支持该子模式）');

    const itvOptions: Record<string, unknown> = {
      duration: params.mediaParams?.duration ?? 5,
    };
    if (params.mediaParams?.aspectRatio) itvOptions.aspectRatio = params.mediaParams.aspectRatio;

    // 按 capability 构造不同的 ITVRequest shape
    let request: any;
    if (params.mode === 'text-to-video') {
      request = {
        capability: 'video.text-to-video',
        prompt,
        options: itvOptions,
      };
    } else if (params.mode === 'image-to-video') {
      const [primary, ...rest] = referenceSources;
      request = {
        capability: 'video.image-to-video',
        prompt,
        primaryImage: sourceToProviderInput(primary),
        additionalReferences: rest.map(sourceToProviderInput),
        options: itvOptions,
      };
    } else if (params.mode === 'start-end-to-video') {
      // 仅取前 2 张：首帧 + 尾帧（按 @ 顺序由调用方保证）
      const [start, end] = referenceSources;
      request = {
        capability: 'video.start-end-to-video',
        prompt,
        startFrame: sourceToProviderInput(start),
        endFrame: sourceToProviderInput(end),
        options: itvOptions,
      };
    } else {
      // reference-to-video
      request = {
        capability: 'video.reference-to-video',
        prompt,
        referenceImages: referenceSources.map(sourceToProviderInput),
        options: itvOptions,
      };
    }

    const started = await provider.start(request);
    if (started.mode !== 'immediate') {
      if (!provider.getTaskSnapshot) {
        throw new Error('当前 ITV 渠道返回异步任务，但不支持任务查询');
      }
      let snapshot;
      for (let i = 0; i < 120; i += 1) {
        snapshot = await provider.getTaskSnapshot(started.taskId, { capability: capabilityFor });
        if (snapshot.state === 'succeeded') break;
        if (snapshot.state === 'failed') throw new Error(snapshot.error || '视频生成失败');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (snapshot?.state !== 'succeeded' || !snapshot.output?.source) {
        throw new Error('视频生成超时，请稍后在任务记录中查看');
      }
      video = snapshot.output.source;
    } else {
      video = started.output.source;
    }
  }

  return { images: generatedImages, video };
}
