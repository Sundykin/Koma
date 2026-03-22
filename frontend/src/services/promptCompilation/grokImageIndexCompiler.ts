import type { MediaAssetSource, ProviderAssetInput } from '../../types';
import { parseMentions } from '../../editor/mentionTypes';
import type { MentionType, ParsedMention } from '../../editor/mentionTypes';
import type { PromptCompilationDebug, PromptCompilationInput } from './types';

function buildMatchIds(type: MentionType, assetId: string, altIds?: string[]): Set<string> {
  const ids = new Set<string>();

  const add = (id?: string) => {
    if (!id) return;
    ids.add(id);
    const prefix = `${type}_`;
    if (id.startsWith(prefix)) {
      ids.add(id.slice(prefix.length));
    }
  };

  add(assetId);
  for (const alt of altIds || []) add(alt);

  return ids;
}

function truncateDataUrl(value: string, keep = 120): string {
  if (!value.startsWith('data:')) return value;
  const len = value.length;
  return `${value.slice(0, keep)}...(data-url ${len} chars)`;
}

function refKey(ref: MediaAssetSource | ProviderAssetInput): string {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object' && 'transport' in ref && 'value' in ref) {
    return `${(ref as ProviderAssetInput).transport}:${(ref as ProviderAssetInput).value}`;
  }
  // StoredMediaAsset-ish
  const anyRef = ref as any;
  return anyRef?.remoteUrl || anyRef?.localPath || JSON.stringify(anyRef);
}

export function compileGrokTTI(params: {
  prompt: string;
  selectedAssets: PromptCompilationInput['selectedAssets'];
  /**
   * Additional references (optional) that should NOT affect @imageN indices.
   * They will be appended after selected assets.
   */
  extraReferences?: Array<MediaAssetSource | ProviderAssetInput>;
}): {
  compiledPrompt: string;
  compiledReferences: Array<MediaAssetSource | ProviderAssetInput>;
  debug: PromptCompilationDebug;
} {
  const mentions = parseMentions(params.prompt);

  // Keep only assets that have an actual source (otherwise they can't be used as image refs).
  const usableAssets = params.selectedAssets.filter(a => Boolean(a.source));
  const assetMatchIds = usableAssets.map(a => ({
    asset: a,
    matchIds: buildMatchIds(a.type, a.assetId, a.altIds),
  }));

  const mentionToIndex: Array<{ mention: ParsedMention; index: number }> = [];
  const unmappedMentions: PromptCompilationDebug['unmappedMentions'] = [];

  for (const mention of mentions) {
    const hit = assetMatchIds.find(({ asset, matchIds }) => asset.type === mention.type && matchIds.has(mention.id));
    if (!hit) {
      unmappedMentions.push({ type: mention.type, id: mention.id, fullMatch: mention.fullMatch });
      continue;
    }
    const idx = usableAssets.findIndex(a => a === hit.asset);
    if (idx >= 0) {
      mentionToIndex.push({ mention, index: idx + 1 }); // @image1..N
    }
  }

  // Replace mentions from tail to head to avoid index shifts.
  const sorted = [...mentionToIndex].sort((a, b) => b.mention.from - a.mention.from);
  let compiledPrompt = params.prompt;
  for (const { mention, index } of sorted) {
    compiledPrompt = compiledPrompt.slice(0, mention.from) + `@image${index}` + compiledPrompt.slice(mention.to);
  }

  const selectedRefs = usableAssets.map(a => a.source!).filter(Boolean);
  const selectedKeys = new Set(selectedRefs.map(refKey));
  const extraRefs = (params.extraReferences || []).filter(r => !selectedKeys.has(refKey(r)));

  const compiledReferences: Array<MediaAssetSource | ProviderAssetInput> = [
    ...selectedRefs,
    ...extraRefs,
  ];

  const debug: PromptCompilationDebug = {
    protocol: 'grok-image-index',
    originalPrompt: params.prompt,
    compiledPrompt,
    mentions,
    assetToImageIndex: usableAssets.map((a, i) => ({
      type: a.type,
      assetId: a.assetId,
      image: `@image${i + 1}`,
    })),
    unmappedMentions,
  };

  // Avoid giant console output by normalizing any data-url previews in debug payload consumers.
  // (Callers can log compiledReferences with truncation.)
  void truncateDataUrl;

  return { compiledPrompt, compiledReferences, debug };
}

export function compileGrokITV(params: {
  prompt: string;
  primaryImage: MediaAssetSource | ProviderAssetInput;
  selectedAssets: PromptCompilationInput['selectedAssets'];
  /**
   * Additional references (optional) that should NOT affect @imageN indices.
   * They will be appended after selected assets.
   */
  extraReferences?: Array<MediaAssetSource | ProviderAssetInput>;
}): {
  compiledPrompt: string;
  compiledAdditionalReferences: Array<MediaAssetSource | ProviderAssetInput>;
  debug: PromptCompilationDebug;
} {
  const mentions = parseMentions(params.prompt);

  const usableAssets = params.selectedAssets.filter(a => Boolean(a.source));
  const assetMatchIds = usableAssets.map(a => ({
    asset: a,
    matchIds: buildMatchIds(a.type, a.assetId, a.altIds),
  }));

  const mentionToIndex: Array<{ mention: ParsedMention; index: number }> = [];
  const unmappedMentions: PromptCompilationDebug['unmappedMentions'] = [];

  for (const mention of mentions) {
    const hit = assetMatchIds.find(({ asset, matchIds }) => asset.type === mention.type && matchIds.has(mention.id));
    if (!hit) {
      unmappedMentions.push({ type: mention.type, id: mention.id, fullMatch: mention.fullMatch });
      continue;
    }
    const idx = usableAssets.findIndex(a => a === hit.asset);
    if (idx >= 0) {
      // @image1 reserved for primary image; assets start from @image2
      mentionToIndex.push({ mention, index: idx + 2 });
    }
  }

  const sorted = [...mentionToIndex].sort((a, b) => b.mention.from - a.mention.from);
  let compiledPrompt = params.prompt;
  for (const { mention, index } of sorted) {
    compiledPrompt = compiledPrompt.slice(0, mention.from) + `@image${index}` + compiledPrompt.slice(mention.to);
  }

  // Ensure primary image is explicitly referenced as @image1.
  if (!/\@image1\b/.test(compiledPrompt)) {
    compiledPrompt = `@image1 ${compiledPrompt}`.trim();
  }

  // Provider API separates primary image from additional refs.
  // We align indices by:
  // - @image1 -> primaryImage
  // - @image2.. -> additionalReferences[0..]
  const selectedRefs = usableAssets.map(a => a.source!).filter(Boolean);
  const selectedKeys = new Set(selectedRefs.map(refKey));
  const extraRefs = (params.extraReferences || []).filter(r => !selectedKeys.has(refKey(r)));

  const compiledAdditionalReferences: Array<MediaAssetSource | ProviderAssetInput> = [
    ...selectedRefs,
    ...extraRefs,
  ];

  const debug: PromptCompilationDebug = {
    protocol: 'grok-image-index',
    originalPrompt: params.prompt,
    compiledPrompt,
    mentions,
    assetToImageIndex: [
      { type: 'scene' as any, assetId: '(primary-image)', image: '@image1' },
      ...usableAssets.map((a, i) => ({
        type: a.type,
        assetId: a.assetId,
        image: `@image${i + 2}`,
      })),
    ],
    unmappedMentions,
  };

  return { compiledPrompt, compiledAdditionalReferences, debug };
}
