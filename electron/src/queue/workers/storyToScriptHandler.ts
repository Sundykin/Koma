/**
 * Story-to-Script Worker Handler
 * 处理小说文本 → 剧本分镜的任务
 */

import { storyToScriptOrchestrator } from '../../orchestrators/storyToScriptOrchestrator';
import type {
  OrchestratorContext,
  StoryToScriptOrchestratorInput,
  StoryToScriptOrchestratorResult,
} from '../../orchestrators/types';
import type { RendererDelegate } from './rendererDelegate';

export const TASK_CANCELLED_ERROR = 'TASK_CANCELLED';

export interface StoryToScriptTaskPayload {
  projectId: string;
  episodeId: string;
  novelText: string;
  theme?: string;
  videoRatio?: string;
}

export interface StoryToScriptTaskResult {
  characters: Array<{
    name: string;
    description: string;
    appearance: string;
    personality: string;
  }>;
  locations: Array<{
    name: string;
    description: string;
  }>;
  clips: Array<{
    id: string;
    summary: string;
    content: string;
    characters: string[];
    location: string | null;
  }>;
  summary: {
    characterCount: number;
    locationCount: number;
    clipCount: number;
  };
}

export interface StoryToScriptHandlerOptions {
  taskId: string;
  payload: StoryToScriptTaskPayload;
  delegate: RendererDelegate;
  onProgress: (progress: number, phase: string, message: string) => void | Promise<void>;
  isCancelled?: () => boolean;
}

function ensureNotCancelled(isCancelled?: () => boolean): void {
  if (isCancelled?.()) {
    throw new Error(TASK_CANCELLED_ERROR);
  }
}

/**
 * 默认 Prompt 模板
 */
const DEFAULT_PROMPT_TEMPLATES = {
  characterPromptTemplate: `分析以下小说文本中的角色：

{content}

已知角色：{baseCharacters}

请以 JSON 格式返回所有角色的详细信息，包括：
- name: 角色名称
- description: 角色描述
- appearance: 外貌特征
- personality: 性格特点

返回格式：
{
  "角色1": { "name": "...", "description": "...", "appearance": "...", "personality": "..." },
  "角色2": { ... }
}`,

  locationPromptTemplate: `分析以下小说文本中的场景：

{content}

已知场景：{baseLocations}

请以 JSON 格式返回所有场景的详细信息，包括：
- name: 场景名称
- description: 场景描述

返回格式：
{
  "场景1": { "name": "...", "description": "..." },
  "场景2": { ... }
}`,

  clipPromptTemplate: `将以下小说文本拆分为分镜片段：

{content}

角色信息：{characters}
场景信息：{locations}

请以 JSON 数组格式返回所有分镜片段，每个片段包括：
- startText: 片段开始文本（前10个字）
- endText: 片段结束文本（后10个字）
- summary: 片段摘要
- content: 片段完整内容
- characters: 出现的角色列表
- location: 场景名称

返回格式：
[
  {
    "startText": "...",
    "endText": "...",
    "summary": "...",
    "content": "...",
    "characters": ["角色1", "角色2"],
    "location": "场景1"
  }
]`,

  screenplayPromptTemplate: `为以下分镜片段生成剧本：

{clipContent}

角色：{characters}
场景：{location}

请生成详细的剧本内容。`,
};

/**
 * 执行 Story-to-Script 任务
 */
export async function runStoryToScriptTask(
  options: StoryToScriptHandlerOptions
): Promise<StoryToScriptTaskResult> {
  const { taskId, payload, delegate, onProgress, isCancelled } = options;

  ensureNotCancelled(isCancelled);
  await onProgress(0, 'initialize', '初始化任务');

  // 构建 Orchestrator 输入
  const orchestratorInput: StoryToScriptOrchestratorInput = {
    content: payload.novelText,
    baseCharacters: [],
    baseLocations: [],
    baseCharacterIntroductions: [],
    promptTemplates: DEFAULT_PROMPT_TEMPLATES,
    runStep: async (meta, prompt, action, maxOutputTokens) => {
      ensureNotCancelled(isCancelled);

      // 通过 delegate 调用 AI 服务
      const result = await delegate.execute('runAIStep', taskId, {
        prompt,
        action,
        maxOutputTokens,
        meta,
      });

      return {
        text: String((result as any).text || ''),
        reasoning: String((result as any).reasoning || ''),
      };
    },
    onStepError: (meta, message) => {
      console.error(`Step ${meta.stepId} error:`, message);
    },
    onLog: (message, details) => {
      console.log(message, details);
    },
  };

  // 构建 Orchestrator Context
  const context: OrchestratorContext = {
    taskId,
    projectId: payload.projectId,
    episodeId: payload.episodeId,
    delegate,
    onProgress: async (progress, phase, message) => {
      await onProgress(progress, phase, message);
    },
    isCancelled,
  };

  ensureNotCancelled(isCancelled);
  await onProgress(10, 'orchestrator', '开始编排执行');

  // 执行 Orchestrator
  const orchestratorResult = await storyToScriptOrchestrator(orchestratorInput, context);

  ensureNotCancelled(isCancelled);
  await onProgress(90, 'finalize', '整理结果');

  // 转换结果格式
  const characters = orchestratorResult.analyzedCharacters.map((char: any) => ({
    name: String(char.name || ''),
    description: String(char.description || ''),
    appearance: String(char.appearance || ''),
    personality: String(char.personality || ''),
  }));

  const locations = orchestratorResult.analyzedLocations.map((loc: any) => ({
    name: String(loc.name || ''),
    description: String(loc.description || ''),
  }));

  const clips = orchestratorResult.clipList.map((clip) => ({
    id: clip.id,
    summary: clip.summary,
    content: clip.content,
    characters: clip.characters,
    location: clip.location,
  }));

  ensureNotCancelled(isCancelled);
  await onProgress(100, 'complete', '任务完成');

  return {
    characters,
    locations,
    clips,
    summary: orchestratorResult.summary,
  };
}
