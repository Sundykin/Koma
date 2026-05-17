import type { MediaAssetSource } from '../../../../types';
import type {
  LinghuiImageNodeMode,
  LinghuiNodeResult,
} from '../../../../types/linghui';
import {
  getLinghuiResultDescriptionText,
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
  getLinghuiResultText,
} from '../../../../types/linghui';
import { parseLinghuiPromptReferences } from '../../editors/state/linghuiPromptReferences';
import {
  buildLinghuiVisualSourceKey,
  resolveLinghuiMediaAssetSource,
} from '../../utils/linghuiMediaAssetSource';

export function collectReferenceSources(results: LinghuiNodeResult[]): MediaAssetSource[] {
  const sources: MediaAssetSource[] = [];
  const dedupe = new Set<string>();
  const pushSource = (candidate?: MediaAssetSource) => {
    const key = buildLinghuiVisualSourceKey(candidate);
    if (!candidate || !key || dedupe.has(key)) return;
    dedupe.add(key);
    sources.push(candidate);
  };

  for (const result of results) {
    const primary = getLinghuiResultPrimaryMedia(result);
    if (primary?.kind === 'image') {
      pushSource(resolveLinghuiMediaAssetSource(primary));
    }
    // 上游视频也算图片参考：用其首帧 posterSource 作为下游图片节点的参考图，
    // 否则 3D 导演台 / 视频节点的输出在 image 槽位被无效化（减产）
    if (primary?.kind === 'video' && primary.posterSource) {
      pushSource(resolveLinghuiMediaAssetSource(primary, {
        kind: 'image',
        sourceOverride: primary.posterSource,
        usePersist: false,
      }));
    }

    for (const item of getLinghuiResultItems(result)) {
      if (item.kind === 'image') {
        pushSource(resolveLinghuiMediaAssetSource(item));
      } else if (item.kind === 'video' && item.posterSource) {
        pushSource(resolveLinghuiMediaAssetSource(item, {
          kind: 'image',
          sourceOverride: item.posterSource,
          usePersist: false,
        }));
      }
    }
  }

  return sources;
}

/**
 * 收集上游结果里的真实视频源（.mp4 / .mov URL），用于下游 video 节点做 video-to-video。
 * 与 collectVideoPosterSources（取首帧静态图）正交：前者用于 video provider 的 video reference，
 * 后者用于 image-to-video provider 的首帧驱动。
 */
export function collectVideoSources(results: LinghuiNodeResult[]): string[] {
  const sources: string[] = [];
  const dedupe = new Set<string>();
  const pushSource = (candidate?: string) => {
    if (!candidate || dedupe.has(candidate)) return;
    dedupe.add(candidate);
    sources.push(candidate);
  };

  for (const result of results) {
    const primary = getLinghuiResultPrimaryMedia(result);
    if (primary?.kind === 'video') {
      pushSource(primary.source);
    }
    for (const item of getLinghuiResultItems(result)) {
      if (item.kind === 'video') {
        pushSource(item.source);
      }
    }
  }

  return sources;
}

export function collectVideoPosterSources(results: LinghuiNodeResult[]): MediaAssetSource[] {
  const sources: MediaAssetSource[] = [];
  const dedupe = new Set<string>();
  const pushSource = (candidate?: MediaAssetSource) => {
    const key = buildLinghuiVisualSourceKey(candidate);
    if (!candidate || !key || dedupe.has(key)) return;
    dedupe.add(key);
    sources.push(candidate);
  };

  for (const result of results) {
    const primary = getLinghuiResultPrimaryMedia(result);
    if (primary?.kind === 'video') {
      pushSource(resolveLinghuiMediaAssetSource(primary, {
        kind: 'image',
        sourceOverride: primary.posterSource,
        usePersist: false,
      }));
    }

    for (const item of getLinghuiResultItems(result)) {
      if (item.kind === 'video') {
        pushSource(resolveLinghuiMediaAssetSource(item, {
          kind: 'image',
          sourceOverride: item.posterSource,
          usePersist: false,
        }));
      }
    }
  }

  return sources;
}

export function mergeUniqueSources<TSource extends MediaAssetSource>(...groups: TSource[][]): TSource[] {
  const merged: TSource[] = [];
  const dedupe = new Set<string>();

  for (const group of groups) {
    for (const source of group) {
      const key = buildLinghuiVisualSourceKey(source);
      if (!source || !key || dedupe.has(key)) continue;
      dedupe.add(key);
      merged.push(source);
    }
  }

  return merged;
}

export function collectTextSnippets(results: LinghuiNodeResult[]): string[] {
  const snippets: string[] = [];
  const dedupe = new Set<string>();

  for (const result of results) {
    const candidate = String(getLinghuiResultText(result) ?? getLinghuiResultDescriptionText(result) ?? '').trim();

    if (!candidate || dedupe.has(candidate)) continue;
    dedupe.add(candidate);
    snippets.push(candidate);
  }

  return snippets;
}

export function mergePromptWithTextInputs(prompt: string, textSnippets: string[]): string {
  const normalizedPrompt = prompt.trim();
  if (!textSnippets.length) {
    return normalizedPrompt;
  }

  if (parseLinghuiPromptReferences(normalizedPrompt).length > 0) {
    return normalizedPrompt;
  }

  const contextBlock = textSnippets.join('\n\n');
  return normalizedPrompt ? `${contextBlock}\n\n${normalizedPrompt}` : contextBlock;
}

export function resolveImageNodeMode(params: { source?: string; mode?: unknown }): LinghuiImageNodeMode {
  if (params.mode === 'import' || params.mode === 'generate') {
    return params.mode;
  }
  return String(params.source ?? '').trim() ? 'import' : 'generate';
}
