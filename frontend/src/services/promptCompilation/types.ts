import type { MediaAssetSource, ProviderAssetInput } from '../../types';
import type { AssetMentionType, MentionType, ParsedMention } from '../../editor/mentionTypes';

export type PromptCompilationProtocol = 'grok-image-index';

export interface PromptCompilationAsset {
  type: AssetMentionType;
  name?: string;
  textValue?: string;
  /**
   * Asset primary ID (project internal).
   * Example: "char_1774162760773_0"
   */
  assetId: string;
  /**
   * Optional alternate identifiers that may appear inside prompt mentions.
   * Example: sora2CharacterId / sora2PropId.
   */
  altIds?: string[];
  /**
   * The image source used as reference input.
   * Can be StoredMediaAsset, local path, remote URL, or data URL.
   */
  source?: MediaAssetSource | ProviderAssetInput;
}

/**
 * 引用条目的媒体类型。决定 @ 占位符在协议编译时的命名空间：
 *   - image → @Image N（不限上限）
 *   - video → @Video N（最多 3 个，超出的引用替换为 name fallback）
 *   - audio → @Audio N（最多 3 个）
 * 缺省视为 image（向后兼容）。
 */
export type PromptCompilationReferenceKind = 'image' | 'video' | 'audio';

export interface PromptCompilationReferenceItem {
  id: string;
  name: string;
  kind?: PromptCompilationReferenceKind;
  textValue?: string;
  source?: MediaAssetSource | ProviderAssetInput;
}

export interface PromptReferenceCompilationInput {
  references: PromptCompilationReferenceItem[];
  extraReferences?: Array<MediaAssetSource | ProviderAssetInput>;
  primaryReferenceId?: string;
  ensurePrimaryReference?: boolean;
}

export interface PromptCompilationInput {
  /**
   * Ordered assets selected by the shot (characters -> scenes -> props).
   * The order is the source of truth for @Image N index mapping in grok protocol.
   */
  selectedAssets?: PromptCompilationAsset[];
  /**
   * Optional leading visual reference that should occupy @Image 1 for reference-to-video compilation.
   */
  primaryReferenceSource?: MediaAssetSource | ProviderAssetInput;
  promptReferences?: PromptReferenceCompilationInput;
}

export interface PromptCompilationDebug {
  protocol: PromptCompilationProtocol;
  originalPrompt: string;
  compiledPrompt: string;
  mentions: ParsedMention[];
  /**
   * `@Image N` mapping for each selected asset (if the asset is usable / has source).
   */
  assetToImageIndex: Array<{ type: AssetMentionType; assetId: string; image: string }>;
  /**
   * Mentions that could not be mapped to selected assets.
   */
  unmappedMentions: Array<{ type: MentionType; id: string; fullMatch: string }>;
}
