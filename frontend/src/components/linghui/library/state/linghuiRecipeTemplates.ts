import type {
  LinghuiNodeType,
  LinghuiRFEdgeSnapshot,
  LinghuiRFNodeSnapshot,
  LinghuiSlotDataType,
  LinghuiSubgraphSnapshot,
} from '../../../../types/linghui';
import { createNewNodeData } from './linghuiNodeDefs';

export type LinghuiRecipeTemplateKey =
  | 'character-design-flow'
  | 'storyboard-creation-flow'
  | 'voiceover-workflow';

export interface LinghuiBuiltinRecipeTemplateDefinition {
  id: string;
  recipeKey: LinghuiRecipeTemplateKey;
  name: string;
  description: string;
  sortOrder: number;
  snapshot: LinghuiSubgraphSnapshot;
}

function toRFNodeType(type: LinghuiNodeType): string {
  return type.replace(/\//g, '-');
}

function createRecipeNode(params: {
  id: string;
  type: LinghuiNodeType;
  label: string;
  x: number;
  y: number;
  properties?: Record<string, unknown>;
}): LinghuiRFNodeSnapshot {
  const data = createNewNodeData(params.type, { label: params.label });
  data.properties = {
    ...data.properties,
    ...params.properties,
  };

  return {
    id: params.id,
    type: toRFNodeType(params.type),
    position: { x: params.x, y: params.y },
    data,
  };
}

function createRecipeEdge(params: {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  sourceSlotType: LinghuiSlotDataType;
  targetSlotType: LinghuiSlotDataType;
}): LinghuiRFEdgeSnapshot {
  return {
    id: params.id,
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle,
    type: 'linghui-edge',
    data: {
      sourceSlotType: params.sourceSlotType,
      targetSlotType: params.targetSlotType,
    },
  };
}

function createCharacterDesignRecipeSnapshot(): LinghuiSubgraphSnapshot {
  const nodes: LinghuiRFNodeSnapshot[] = [
    createRecipeNode({
      id: 'role-brief',
      type: 'linghui/text',
      label: '角色设定',
      x: 0,
      y: 0,
      properties: {
        mode: 'manual',
        content: '填写角色身份、服装、气质、关键道具和画风要求。',
      },
    }),
    createRecipeNode({
      id: 'front-image',
      type: 'linghui/image',
      label: '角色正面',
      x: 300,
      y: 0,
      properties: {
        mode: 'generate',
        prompt: '根据角色设定生成角色正面定妆照，单人，全身，白底，姿态自然。',
        aspectRatio: '3:4',
        resolution: 'auto',
      },
    }),
    createRecipeNode({
      id: 'multi-angle-image',
      type: 'linghui/image',
      label: '角色多角度',
      x: 620,
      y: 0,
      properties: {
        mode: 'generate',
        prompt: '基于上游角色主图生成多角度角色参考，保持服装、五官和比例一致。',
        aspectRatio: '3:4',
        resolution: 'auto',
      },
    }),
    createRecipeNode({
      id: 'character-video',
      type: 'linghui/video',
      label: '角色展示视频',
      x: 940,
      y: 0,
      properties: {
        prompt: '角色缓慢转身展示服装和轮廓，镜头平稳推进，强调材质与体态。',
        videoCapability: 'video.image-to-video',
        aspectRatio: '9:16',
        resolution: '720p',
        duration: 5,
      },
    }),
  ];

  const edges: LinghuiRFEdgeSnapshot[] = [
    createRecipeEdge({
      id: 'edge-role-front',
      source: 'role-brief',
      target: 'front-image',
      sourceHandle: 'output-0',
      targetHandle: 'input-1',
      sourceSlotType: 'text',
      targetSlotType: 'text',
    }),
    createRecipeEdge({
      id: 'edge-front-angle',
      source: 'front-image',
      target: 'multi-angle-image',
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      sourceSlotType: 'image',
      targetSlotType: 'image',
    }),
    createRecipeEdge({
      id: 'edge-angle-video',
      source: 'multi-angle-image',
      target: 'character-video',
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      sourceSlotType: 'image',
      targetSlotType: 'image',
    }),
  ];

  return { nodes, edges, groups: [] };
}

function createStoryboardCreationRecipeSnapshot(): LinghuiSubgraphSnapshot {
  const nodes: LinghuiRFNodeSnapshot[] = [
    createRecipeNode({
      id: 'story-brief',
      type: 'linghui/text',
      label: '剧情梗概',
      x: 0,
      y: 0,
      properties: {
        mode: 'manual',
        content: '填写剧情梗概、人物关系、场景氛围与镜头目标。',
      },
    }),
    createRecipeNode({
      id: 'story-script',
      type: 'linghui/script',
      label: '分镜脚本',
      x: 280,
      y: 0,
      properties: {
        mode: 'generate',
        prompt: '将剧情梗概拆解为结构化分镜，强调镜头动作、环境和情绪推进。',
      },
    }),
    createRecipeNode({
      id: 'shot-image-1',
      type: 'linghui/image',
      label: '镜头 1 图',
      x: 600,
      y: -120,
      properties: {
        mode: 'generate',
        prompt: '根据上游分镜文本生成镜头 1 关键帧，突出主体动作和环境氛围。',
      },
    }),
    createRecipeNode({
      id: 'shot-image-2',
      type: 'linghui/image',
      label: '镜头 2 图',
      x: 600,
      y: 120,
      properties: {
        mode: 'generate',
        prompt: '根据上游分镜文本生成镜头 2 关键帧，保持角色与场景连续性。',
      },
    }),
    createRecipeNode({
      id: 'shot-video-1',
      type: 'linghui/video',
      label: '镜头 1 视频',
      x: 920,
      y: -120,
      properties: {
        prompt: '基于镜头 1 关键帧生成短视频，镜头语言紧贴分镜节奏。',
        videoCapability: 'video.image-to-video',
        aspectRatio: '16:9',
        resolution: '720p',
        duration: 5,
      },
    }),
    createRecipeNode({
      id: 'shot-video-2',
      type: 'linghui/video',
      label: '镜头 2 视频',
      x: 920,
      y: 120,
      properties: {
        prompt: '基于镜头 2 关键帧生成短视频，保持角色动作与情绪延续。',
        videoCapability: 'video.image-to-video',
        aspectRatio: '16:9',
        resolution: '720p',
        duration: 5,
      },
    }),
  ];

  const edges: LinghuiRFEdgeSnapshot[] = [
    createRecipeEdge({
      id: 'edge-brief-script',
      source: 'story-brief',
      target: 'story-script',
      sourceHandle: 'output-0',
      targetHandle: 'input-1',
      sourceSlotType: 'text',
      targetSlotType: 'text',
    }),
    createRecipeEdge({
      id: 'edge-script-image-1',
      source: 'story-script',
      target: 'shot-image-1',
      sourceHandle: 'output-0',
      targetHandle: 'input-1',
      sourceSlotType: 'text',
      targetSlotType: 'text',
    }),
    createRecipeEdge({
      id: 'edge-script-image-2',
      source: 'story-script',
      target: 'shot-image-2',
      sourceHandle: 'output-0',
      targetHandle: 'input-1',
      sourceSlotType: 'text',
      targetSlotType: 'text',
    }),
    createRecipeEdge({
      id: 'edge-image-video-1',
      source: 'shot-image-1',
      target: 'shot-video-1',
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      sourceSlotType: 'image',
      targetSlotType: 'image',
    }),
    createRecipeEdge({
      id: 'edge-image-video-2',
      source: 'shot-image-2',
      target: 'shot-video-2',
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      sourceSlotType: 'image',
      targetSlotType: 'image',
    }),
  ];

  return { nodes, edges, groups: [] };
}

function createVoiceoverWorkflowRecipeSnapshot(): LinghuiSubgraphSnapshot {
  const nodes: LinghuiRFNodeSnapshot[] = [
    createRecipeNode({
      id: 'voice-script',
      type: 'linghui/script',
      label: '脚本文案',
      x: 0,
      y: 0,
      properties: {
        mode: 'manual',
        content: '填写要拆分成多段配音的脚本文案。',
      },
    }),
    createRecipeNode({
      id: 'voice-line-1',
      type: 'linghui/text',
      label: '台词 1',
      x: 300,
      y: -100,
      properties: {
        mode: 'generate',
        prompt: '从上游脚本中提炼第一段适合配音的台词。',
      },
    }),
    createRecipeNode({
      id: 'voice-line-2',
      type: 'linghui/text',
      label: '台词 2',
      x: 300,
      y: 100,
      properties: {
        mode: 'generate',
        prompt: '从上游脚本中提炼第二段适合配音的台词。',
      },
    }),
    createRecipeNode({
      id: 'voice-audio-1',
      type: 'linghui/audio',
      label: '配音 1',
      x: 620,
      y: -100,
      properties: {
        prompt: '情绪稳定、节奏清晰、适合叙事旁白。',
      },
    }),
    createRecipeNode({
      id: 'voice-audio-2',
      type: 'linghui/audio',
      label: '配音 2',
      x: 620,
      y: 100,
      properties: {
        prompt: '延续前一段情绪，语气自然，适合连续配音。',
      },
    }),
  ];

  const edges: LinghuiRFEdgeSnapshot[] = [
    createRecipeEdge({
      id: 'edge-script-line-1',
      source: 'voice-script',
      target: 'voice-line-1',
      sourceHandle: 'output-0',
      targetHandle: 'input-1',
      sourceSlotType: 'text',
      targetSlotType: 'text',
    }),
    createRecipeEdge({
      id: 'edge-script-line-2',
      source: 'voice-script',
      target: 'voice-line-2',
      sourceHandle: 'output-0',
      targetHandle: 'input-1',
      sourceSlotType: 'text',
      targetSlotType: 'text',
    }),
    createRecipeEdge({
      id: 'edge-line-audio-1',
      source: 'voice-line-1',
      target: 'voice-audio-1',
      sourceHandle: 'output-0',
      targetHandle: 'input-1',
      sourceSlotType: 'text',
      targetSlotType: 'text',
    }),
    createRecipeEdge({
      id: 'edge-line-audio-2',
      source: 'voice-line-2',
      target: 'voice-audio-2',
      sourceHandle: 'output-0',
      targetHandle: 'input-1',
      sourceSlotType: 'text',
      targetSlotType: 'text',
    }),
  ];

  return { nodes, edges, groups: [] };
}

export function listBuiltinLinghuiRecipeTemplates(): LinghuiBuiltinRecipeTemplateDefinition[] {
  return [];
}

export function resolveLinghuiRecipeTemplateLabel(recipeKey?: LinghuiRecipeTemplateKey): string | null {
  switch (recipeKey) {
    case 'character-design-flow':
      return '角色设计流';
    case 'storyboard-creation-flow':
      return '分镜创作流';
    case 'voiceover-workflow':
      return '配音工作流';
    default:
      return null;
  }
}
