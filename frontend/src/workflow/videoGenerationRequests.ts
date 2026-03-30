import type { Character, ITVRequest, MediaAssetSource, Prop } from '../types';
import type { PromptCompilationInput } from '../services/promptCompilation/types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import {
  buildShotVideoRequest,
  type ShotVideoPlan,
} from './shotVideoPlan';

export interface CompiledVideoGenerationRequest {
  prompt: string;
  request: ITVRequest<MediaAssetSource>;
  promptCompilation?: PromptCompilationInput;
  templateId?: string;
  promptSource?: 'default' | 'custom' | 'finalized';
}

function normalizePromptSource(
  source: string | undefined,
): 'default' | 'custom' | 'finalized' | undefined {
  return source === 'default' || source === 'custom' || source === 'finalized'
    ? source
    : undefined;
}

export function compileShotVideoGenerationRequest(params: {
  plan: ShotVideoPlan;
  prompt: string;
  aspectRatio: string;
  duration: number;
  motionPrompt?: string;
}): CompiledVideoGenerationRequest {
  return {
    prompt: params.prompt,
    request: buildShotVideoRequest({
      plan: params.plan,
      prompt: params.prompt,
      duration: params.duration,
      motionPrompt: params.motionPrompt,
      aspectRatio: params.aspectRatio,
    }),
    promptCompilation: {
      selectedAssets: params.plan.selectedAssetsForCompilation,
    },
  };
}

export async function compileCharacterPreviewVideoRequest(params: {
  character: Character;
  primaryImage: MediaAssetSource;
  stylePrefix: string;
}): Promise<CompiledVideoGenerationRequest> {
  const visualPrompt = params.character.prompt || params.character.name;
  const resolvedPrompt = await resolvePromptTemplate('itv_character_motion', {
    stylePrefix: params.stylePrefix,
    characterName: params.character.name,
    action: `${visualPrompt}, character showcase, subtle breathing, natural eye movement, steady camera`,
  });

  return {
    prompt: resolvedPrompt.prompt,
    request: {
      capability: 'video.image-to-video',
      prompt: resolvedPrompt.prompt,
      primaryImage: params.primaryImage,
      additionalReferences: [],
      options: { duration: 4, aspectRatio: '9:16' },
    },
    templateId: resolvedPrompt.template.id,
    promptSource: normalizePromptSource(resolvedPrompt.source),
  };
}

export async function compilePropPreviewVideoRequest(params: {
  prop: Prop;
  primaryImage: MediaAssetSource;
  stylePrefix: string;
}): Promise<CompiledVideoGenerationRequest> {
  const resolvedPrompt = await resolvePromptTemplate('itv_prop_motion', {
    stylePrefix: params.stylePrefix,
    description: params.prop.prompt || params.prop.name,
    motion: 'prop showcase, rotating slowly, detailed view',
  });

  return {
    prompt: resolvedPrompt.prompt,
    request: {
      capability: 'video.image-to-video',
      prompt: resolvedPrompt.prompt,
      primaryImage: params.primaryImage,
      additionalReferences: [],
      options: { duration: 4, aspectRatio: '1:1' },
    },
    templateId: resolvedPrompt.template.id,
    promptSource: normalizePromptSource(resolvedPrompt.source),
  };
}
