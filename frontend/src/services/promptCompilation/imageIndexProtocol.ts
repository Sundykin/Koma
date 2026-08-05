/**
 * 「按序号引用参考图」类协议的占位符格式。
 *
 * 这类协议共用同一套编译逻辑（把 @角色名/@场景名/@道具名 按参考图顺序编号），
 * 差别只在最终写进提示词的占位符长什么样：
 *   - grok-image-index  → `@Image 1`  （OpenAI 兼容 / Grok / Nano banana 等）
 *   - minimax-image-tag → `<图片 1>`  （ComfyUI MiniMax H3，模型原生识别的中文标签）
 *
 * MiniMax H3 的官方示例提示词即形如「将<图片 2>和<图片 1>作为参考帧，<音频 1>照原样使用」，
 * 所以这里按 kind 给出中文标签。
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
  return `@${GROK_KIND_LABEL[kind]} ${index}`;
}
