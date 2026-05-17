import type { AppSettings, MediaAssetSource, ProviderAssetInput } from '../../../../../types';
import type { MultiAngleTTIRequest } from '../../../../../providers/tti/types';
import type { LinghuiPromptReferenceItem } from '../../../editors/state/linghuiPromptReferences';

export type GenerateImageWithProviderParams = {
  prompt: string;
  referenceSources?: Array<MediaAssetSource | ProviderAssetInput>;
  silentReferenceSources?: Array<MediaAssetSource | ProviderAssetInput>;
  steps?: number;
  count?: number;
  /** 画布上用户选的比例（'1:1' / '16:9' / '9:16' / ...）。会透传给 provider.start 的 options。 */
  aspectRatio?: string;
  /** 画布上用户选的分辨率档位（'1K' / '2K' / '4K' / 'auto'）。透传到 options.imageSize，
   *  让 OpenAI 兼容 / 通用上游按用户挑的档位算尺寸。'auto' / 空值表示用模型默认。 */
  resolution?: string;
  onProgress?: (progress: number, message?: string, partialResult?: unknown) => void;
  placeholderTitle: string;
  placeholderSubtitle?: string;
  accent?: string;
  ttiSelection?: string;
  promptReferences?: LinghuiPromptReferenceItem[];
  settingsSnapshot?: AppSettings;
  multiAngle?: Omit<MultiAngleTTIRequest, 'originalPrompt' | 'anglePrompt' | 'compiledPrompt'> | null;
  signal?: AbortSignal;
};

export interface GenerateImageVariantRequest {
  label?: string;
  prompt: string;
  placeholderTitle?: string;
  placeholderSubtitle?: string;
  metadata?: Record<string, unknown>;
}

export type GenerateImageVariantsWithProviderParams = Omit<GenerateImageWithProviderParams, 'prompt' | 'count'> & {
  variants: GenerateImageVariantRequest[];
};
