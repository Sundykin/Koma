import type { MediaAssetSource, ProviderAssetInput } from '../../types';
import type { PromptCompilationReferenceItem, PromptCompilationReferenceKind } from './types';

/**
 * 每种媒体类型的引用上限：image 不限；video / audio 各 3 个，超出的引用回退到 name。
 * 上限按 provider 实际可消费的 reference 数量定（视频/音频接受多源的 provider 罕见）。
 */
const KIND_CAPS: Record<PromptCompilationReferenceKind, number | undefined> = {
  image: undefined,
  video: 3,
  audio: 3,
};

const KIND_LABEL: Record<PromptCompilationReferenceKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
};

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

/**
 * 提示词引用编译。把 prompt 里的 @ref_xxx 替换为：
 *   - image-index 策略：按 kind 分组 @Image N / @Video N / @Audio N（video / audio 上限 3，超出回退到 name）
 *   - readable-name 策略：替换为 item.name
 *
 * compiledReferences 是「全能参考」扁平数组：image / video / audio 走同一个引用通道，
 * 按推入顺序排列（primary → extra → 声明顺序）；上游会按需上传到图床并塞进
 * additionalReferences / referenceImages 等同一组字段，body 不区分类型。
 * 调用方仅靠 prompt 文本里的 @Image N / @Video N / @Audio N 让模型自行对位。
 */
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

  /**
   * 把 references 按 kind 分桶 + 顺序保留（primary 优先 → extra → references）。
   * 每桶按 KIND_CAPS 截断（image 不限；video / audio 各 3 个）。
   * compiledReferences 是扁平的 image/video/audio 混排数组（全能参考通道），
   * indexByKind 保存 sourceKey → 本桶内编号，用于生成 @Image N / @Video N / @Audio N。
   */
  const orderedVisualRefs: OrderedVisualReference[] = [];
  const orderedVisualKeys = new Set<string>();
  const indexByKind: Record<PromptCompilationReferenceKind, Map<string, number>> = {
    image: new Map(),
    video: new Map(),
    audio: new Map(),
  };
  const counterByKind: Record<PromptCompilationReferenceKind, number> = { image: 0, video: 0, audio: 0 };

  const pushRefByKind = (kind: PromptCompilationReferenceKind, source?: MediaAssetSource | ProviderAssetInput) => {
    if (!source) return;
    const key = buildRefKey(source);
    if (indexByKind[kind].has(key)) return; // 同 kind 同 source 已编号 → 跳过
    const cap = KIND_CAPS[kind];
    if (cap !== undefined && counterByKind[kind] >= cap) return; // 桶已满
    counterByKind[kind] += 1;
    indexByKind[kind].set(key, counterByKind[kind]);
    // 全能参考通道：image / video / audio 一视同仁，按推入顺序进 compiledReferences。
    // 同一 source 跨 kind 复用时也只入一次（key 去重）。
    if (!orderedVisualKeys.has(key)) {
      orderedVisualKeys.add(key);
      orderedVisualRefs.push({ key, source });
    }
  };

  // 优先级 1：primary 引用（一定占位 @Image 1 / @Video 1 / @Audio 1，按其 kind）
  if (primaryReference?.source) {
    pushRefByKind(primaryReference.kind ?? 'image', primaryReference.source);
  }

  // 优先级 2：extraReferences 视为 image 类型
  for (const ref of extraReferences) {
    pushRefByKind('image', ref);
  }

  // 优先级 3：所有声明的 references（按声明顺序）
  for (const item of references) {
    if (item.source) {
      pushRefByKind(item.kind ?? 'image', item.source);
    }
  }

  const replacements = parsedRefs.map(parsed => {
    const item = refMap.get(parsed.id);
    if (!item) {
      unresolvedMentions.push(parsed.fullMatch);
      return null;
    }

    if (item.source) {
      const kind = item.kind ?? 'image';
      const sourceKey = buildRefKey(item.source);

      if (replacementStrategy === 'image-index') {
        const index = indexByKind[kind].get(sourceKey);
        if (index != null) {
          return { ...parsed, replacement: `@${KIND_LABEL[kind]} ${index}` };
        }
        // 该 kind 超出上限 / 没占到编号 → 回退到 readable name
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

  // compiledReferences = image + video + audio 扁平混排，primary 单独剔除（外层会把它
  // 塞进 primaryImage / 首位 referenceImages 等专用槽位，避免重复进 additionalReferences）。
  const compiledReferences = orderedVisualRefs
    .filter(item => item.key !== primarySourceKey)
    .map(item => item.source);

  return {
    compiledPrompt,
    compiledReferences,
    unresolvedMentions,
  };
}
