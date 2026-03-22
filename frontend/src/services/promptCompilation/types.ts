import type { MediaAssetSource, ProviderAssetInput } from '../../types';
import type { MentionType, ParsedMention } from '../../editor/mentionTypes';

export type PromptCompilationProtocol = 'grok-image-index';

export interface PromptCompilationAsset {
  type: MentionType;
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

export interface PromptCompilationInput {
  /**
   * Ordered assets selected by the shot (characters -> scenes -> props).
   * The order is the source of truth for @imageN index mapping in grok protocol.
   */
  selectedAssets: PromptCompilationAsset[];
}

export interface PromptCompilationDebug {
  protocol: PromptCompilationProtocol;
  originalPrompt: string;
  compiledPrompt: string;
  mentions: ParsedMention[];
  /**
   * `@imageN` mapping for each selected asset (if the asset is usable / has source).
   */
  assetToImageIndex: Array<{ type: MentionType; assetId: string; image: string }>;
  /**
   * Mentions that could not be mapped to selected assets.
   */
  unmappedMentions: Array<{ type: MentionType; id: string; fullMatch: string }>;
}

