import type { MediaAssetSource, ProviderAssetInput } from '../../types';
import type { PromptCompilationReferenceItem } from './types';

export interface ParsedPromptReference {
  id: string;
  fullMatch: string;
  from: number;
  to: number;
}

export interface CompilePromptReferencesResult {
  compiledPrompt: string;
  compiledReferences: Array<MediaAssetSource | ProviderAssetInput>;
  unresolvedMentions: string[];
}

export const PROMPT_REFERENCE_REGEX = /@ref_([a-zA-Z0-9_-]+)/g;

export function parsePromptReferences(text: string): ParsedPromptReference[] {
  const refs: ParsedPromptReference[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(PROMPT_REFERENCE_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    refs.push({
      id: match[1],
      fullMatch: match[0],
      from: match.index,
      to: match.index + match[0].length,
    });
  }

  return refs;
}

function buildRefKey(ref: MediaAssetSource | ProviderAssetInput): string {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object' && 'transport' in ref && 'value' in ref) {
    return `${ref.transport}:${ref.value}`;
  }

  const anyRef = ref as unknown as Record<string, unknown> | undefined;
  const remoteUrl = typeof anyRef?.remoteUrl === 'string' ? anyRef.remoteUrl : '';
  const localPath = typeof anyRef?.localPath === 'string' ? anyRef.localPath : '';
  return remoteUrl || localPath || JSON.stringify(ref);
}

interface OrderedVisualReference {
  key: string;
  source: MediaAssetSource | ProviderAssetInput;
}

export function compilePromptReferences(params: {
  prompt: string;
  references: PromptCompilationReferenceItem[];
  extraReferences?: Array<MediaAssetSource | ProviderAssetInput>;
  replacementStrategy: 'image-index' | 'readable-name';
  primaryReferenceId?: string;
  ensurePrimaryReference?: boolean;
}): CompilePromptReferencesResult {
  const {
    prompt,
    references,
    extraReferences = [],
    replacementStrategy,
    primaryReferenceId,
    ensurePrimaryReference = false,
  } = params;

  const parsedRefs = parsePromptReferences(prompt);
  const refMap = new Map(references.map(item => [item.id, item]));
  const unresolvedMentions: string[] = [];
  let compiledPrompt = prompt;

  const primaryReference = primaryReferenceId ? refMap.get(primaryReferenceId) : undefined;
  const primarySourceKey = primaryReference?.source ? buildRefKey(primaryReference.source) : null;
  const requiredVisualKeys = new Set<string>();

  if (primarySourceKey) {
    requiredVisualKeys.add(primarySourceKey);
  }

  for (const ref of extraReferences) {
    requiredVisualKeys.add(buildRefKey(ref));
  }

  for (const parsed of parsedRefs) {
    const item = refMap.get(parsed.id);
    if (item?.source) {
      requiredVisualKeys.add(buildRefKey(item.source));
    }
  }

  const orderedVisualRefs: OrderedVisualReference[] = [];
  const orderedVisualKeys = new Set<string>();
  const pushOrderedVisualRef = (source?: MediaAssetSource | ProviderAssetInput) => {
    if (!source) return;
    const key = buildRefKey(source);
    if (!requiredVisualKeys.has(key) || orderedVisualKeys.has(key)) {
      return;
    }

    orderedVisualKeys.add(key);
    orderedVisualRefs.push({ key, source });
  };

  if (primaryReference?.source) {
    pushOrderedVisualRef(primaryReference.source);
  }

  for (const ref of extraReferences) {
    pushOrderedVisualRef(ref);
  }

  for (const item of references) {
    if (item.source) {
      pushOrderedVisualRef(item.source);
    }
  }

  const imageIndexBySourceKey = new Map<string, number>();
  orderedVisualRefs.forEach((item, index) => {
    imageIndexBySourceKey.set(item.key, index + 1);
  });

  const replacements = parsedRefs.map(parsed => {
    const item = refMap.get(parsed.id);
    if (!item) {
      unresolvedMentions.push(parsed.fullMatch);
      return null;
    }

    if (item.source) {
      const sourceKey = buildRefKey(item.source);

      if (replacementStrategy === 'image-index') {
        const index = imageIndexBySourceKey.get(sourceKey);
        if (index != null) {
          return { ...parsed, replacement: `@Image ${index}` };
        }
      }

      return { ...parsed, replacement: item.name };
    }

    return {
      ...parsed,
      replacement: item.textValue || item.name,
    };
  }).filter(Boolean) as Array<ParsedPromptReference & { replacement: string }>;

  const sorted = [...replacements].sort((left, right) => right.from - left.from);
  for (const item of sorted) {
    compiledPrompt = compiledPrompt.slice(0, item.from) + item.replacement + compiledPrompt.slice(item.to);
  }

  void ensurePrimaryReference;

  const compiledReferences = orderedVisualRefs
    .filter(item => item.key !== primarySourceKey)
    .map(item => item.source);

  return {
    compiledPrompt,
    compiledReferences,
    unresolvedMentions,
  };
}
