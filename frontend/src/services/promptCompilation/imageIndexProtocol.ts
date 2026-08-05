/**
 * 「按序号引用参考图」类协议的占位符格式。
 *
 * 这类协议共用同一套编号逻辑（参考素材按 kind 分桶、每桶从 1 开始编号），
 * 差别只在最终写进提示词的占位符长什么样：
 *   - grok-image-index  → `@Image 1` / `@Video 1` / `@Audio 1`（OpenAI 兼容 / Grok 等）
 *   - minimax-image-tag → `<图片 1>` / `<视频 1>` / `<音频 1>`（ComfyUI MiniMax H3 原生中文标签）
 *   - koma-jimeng       → `@image_file_1` / `@video_file_1` / `@audio_file_1`
 *                         （Koma 即梦网关 multipart 字段名一一对应）
 *
 * 所有协议中，image / video / audio 每一类参考的序号都从 1 开始。
 */
import type { PromptCompilationReferenceKind } from './types';

export type ImageIndexProtocol = 'grok-image-index' | 'minimax-image-tag';

const MINIMAX_KIND_LABEL: Record<PromptCompilationReferenceKind, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
};

const GROK_KIND_LABEL: Record<PromptCompilationReferenceKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
};

const KOMA_JIMENG_KIND_LABEL: Record<PromptCompilationReferenceKind, string> = {
  image: 'image_file',
  video: 'video_file',
  audio: 'audio_file',
};

/** 是否为「按序号引用参考图」协议（决定走编号编译还是 readable-name 回退） */
export function isImageIndexProtocol(protocol?: string): protocol is ImageIndexProtocol {
  return protocol === 'grok-image-index' || protocol === 'minimax-image-tag';
}

/**
 * 生成参考素材占位符。index 从 1 开始。
 * 未知协议按 grok 风格兜底，保持与历史行为一致。
 */
export function formatReferencePlaceholder(
  protocol: string | undefined,
  kind: PromptCompilationReferenceKind,
  index: number,
): string {
  if (protocol === 'minimax-image-tag') {
    return `<${MINIMAX_KIND_LABEL[kind]} ${index}>`;
  }
  if (protocol === 'koma-jimeng') {
    return `@${KOMA_JIMENG_KIND_LABEL[kind]}_${index}`;
  }
  return `@${GROK_KIND_LABEL[kind]} ${index}`;
}
