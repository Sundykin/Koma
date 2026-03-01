/**
 * Story-to-Script Orchestrator
 * 小说文本 → 剧本分镜的编排器
 */

import { GraphExecutor, type GraphNode } from './graphExecutor';
import type {
  OrchestratorContext,
  StoryToScriptOrchestratorInput,
  StoryToScriptOrchestratorResult,
  StoryToScriptClipCandidate,
  StoryToScriptScreenplayResult,
} from './types';

/**
 * 解析 JSON 对象（容错处理）
 */
function parseJSONObject(responseText: string): Record<string, unknown> {
  let cleaned = responseText.trim();

  // 移除 markdown 代码块标记
  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/g, '')
    .trim();

  // 提取 JSON 对象
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error}`);
  }
}

/**
 * 解析 Clip 数组
 */
function parseClipArray(responseText: string): Record<string, unknown>[] {
  let cleaned = responseText.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/g, '')
    .trim();

  // 尝试解析为数组
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const arrayStr = cleaned.slice(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(arrayStr);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is Record<string, unknown> => !!item && typeof item === 'object'
        );
      }
    } catch {
      // 继续尝试其他方法
    }
  }

  // 尝试解析为对象，提取 clips 字段
  const obj = parseJSONObject(cleaned);
  const clips = obj.clips;
  if (Array.isArray(clips)) {
    return clips.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object'
    );
  }

  throw new Error('Invalid clip JSON format');
}

/**
 * 应用模板
 */
function applyTemplate(template: string, replacements: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Story-to-Script Orchestrator
 */
export async function storyToScriptOrchestrator(
  input: StoryToScriptOrchestratorInput,
  context: OrchestratorContext
): Promise<StoryToScriptOrchestratorResult> {
  const executor = new GraphExecutor();

  let stepIndex = 0;
  const totalSteps = 4; // Character, Location, Split, Screenplay

  // ============ Node 1: 角色分析 ============
  executor.registerNode({
    id: 'analyze_characters',
    type: 'character_analysis',
    name: '分析角色',
    dependencies: [],
    execute: async (_, ctx) => {
      const prompt = applyTemplate(input.promptTemplates.characterPromptTemplate, {
        content: input.content,
        baseCharacters: input.baseCharacters.join(', '),
      });

      const output = await input.runStep(
        {
          stepId: 'analyze_characters',
          stepTitle: '分析角色',
          stepIndex: stepIndex++,
          stepTotal: totalSteps,
        },
        prompt,
        'analyze_characters',
        4000
      );

      const charactersObject = parseJSONObject(output.text);
      const analyzedCharacters = Object.values(charactersObject).filter(
        (item): item is Record<string, unknown> => !!item && typeof item === 'object'
      );

      return {
        stepOutput: output,
        charactersObject,
        analyzedCharacters,
      };
    },
  });

  // ============ Node 2: 场景分析 ============
  executor.registerNode({
    id: 'analyze_locations',
    type: 'location_analysis',
    name: '分析场景',
    dependencies: [],
    execute: async (_, ctx) => {
      const prompt = applyTemplate(input.promptTemplates.locationPromptTemplate, {
        content: input.content,
        baseLocations: input.baseLocations.join(', '),
      });

      const output = await input.runStep(
        {
          stepId: 'analyze_locations',
          stepTitle: '分析场景',
          stepIndex: stepIndex++,
          stepTotal: totalSteps,
        },
        prompt,
        'analyze_locations',
        4000
      );

      const locationsObject = parseJSONObject(output.text);
      const analyzedLocations = Object.values(locationsObject).filter(
        (item): item is Record<string, unknown> => !!item && typeof item === 'object'
      );

      return {
        stepOutput: output,
        locationsObject,
        analyzedLocations,
      };
    },
  });

  // ============ Node 3: 分镜拆分 ============
  executor.registerNode({
    id: 'split_clips',
    type: 'clip_splitting',
    name: '拆分分镜',
    dependencies: ['analyze_characters', 'analyze_locations'],
    execute: async (inputs: any, ctx) => {
      const characterResult = inputs.analyze_characters;
      const locationResult = inputs.analyze_locations;

      const prompt = applyTemplate(input.promptTemplates.clipPromptTemplate, {
        content: input.content,
        characters: JSON.stringify(characterResult.analyzedCharacters),
        locations: JSON.stringify(locationResult.analyzedLocations),
      });

      const output = await input.runStep(
        {
          stepId: 'split_clips',
          stepTitle: '拆分分镜',
          stepIndex: stepIndex++,
          stepTotal: totalSteps,
        },
        prompt,
        'split_clips',
        8000
      );

      const clipArray = parseClipArray(output.text);
      const clipList: StoryToScriptClipCandidate[] = clipArray.map((clip, index) => ({
        id: `clip_${index + 1}`,
        startText: String(clip.startText || ''),
        endText: String(clip.endText || ''),
        summary: String(clip.summary || ''),
        location: clip.location ? String(clip.location) : null,
        characters: Array.isArray(clip.characters) ? clip.characters.map(String) : [],
        content: String(clip.content || ''),
        matchLevel: 'L1' as const,
        matchConfidence: 1.0,
      }));

      return {
        stepOutput: output,
        clipList,
      };
    },
  });

  // 执行图
  const outputs = await executor.execute(context);

  // 提取结果
  const characterResult: any = outputs.get('analyze_characters');
  const locationResult: any = outputs.get('analyze_locations');
  const clipResult: any = outputs.get('split_clips');

  return {
    characterStep: characterResult.stepOutput,
    locationStep: locationResult.stepOutput,
    splitStep: clipResult.stepOutput,
    charactersObject: characterResult.charactersObject,
    locationsObject: locationResult.locationsObject,
    analyzedCharacters: characterResult.analyzedCharacters,
    analyzedLocations: locationResult.analyzedLocations,
    charactersLibName: 'characters',
    locationsLibName: 'locations',
    charactersIntroduction: '',
    clipList: clipResult.clipList,
    screenplayResults: [],
    summary: {
      characterCount: characterResult.analyzedCharacters.length,
      locationCount: locationResult.analyzedLocations.length,
      clipCount: clipResult.clipList.length,
      screenplaySuccessCount: 0,
      screenplayFailedCount: 0,
      totalScenes: 0,
    },
  };
}
