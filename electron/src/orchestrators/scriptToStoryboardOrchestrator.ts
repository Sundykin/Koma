/**
 * Script-to-Storyboard Orchestrator
 * 剧本 → 分镜图的编排器
 */

import { GraphExecutor } from './graphExecutor';
import type { OrchestratorContext } from './types';

export interface ScriptToStoryboardInput {
  clipId: string;
  clipContent: string;
  characters: Array<{ name: string; description: string }>;
  location: string;
  promptTemplate: string;
  runStep: (
    meta: { stepId: string; stepTitle: string; stepIndex: number; stepTotal: number },
    prompt: string,
    action: string,
    maxOutputTokens: number
  ) => Promise<{ text: string; reasoning: string }>;
}

export interface StoryboardPanelResult {
  panelNumber: number;
  description: string;
  location: string;
  characters: string[];
  photographyPlan?: {
    shotType: string;
    cameraAngle: string;
    cameraMovement: string;
    lighting: string;
  };
  actingNotes?: Array<{
    character: string;
    action: string;
    emotion: string;
  }>;
}

export interface ScriptToStoryboardResult {
  clipId: string;
  panels: StoryboardPanelResult[];
  summary: {
    panelCount: number;
  };
}

/**
 * 解析分镜面板数组
 */
function parsePanelArray(responseText: string): Record<string, unknown>[] {
  let cleaned = responseText.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/g, '')
    .trim();

  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1) {
    const arrayStr = cleaned.slice(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(arrayStr);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is Record<string, unknown> => !!item && typeof item === 'object'
        );
      }
    } catch {
      // 继续
    }
  }

  throw new Error('Invalid panel JSON format');
}

/**
 * Script-to-Storyboard Orchestrator
 */
export async function scriptToStoryboardOrchestrator(
  input: ScriptToStoryboardInput,
  context: OrchestratorContext
): Promise<ScriptToStoryboardResult> {
  const executor = new GraphExecutor();

  // ============ Node: 生成分镜 ============
  executor.registerNode({
    id: 'generate_storyboard',
    type: 'storyboard_generation',
    name: '生成分镜',
    dependencies: [],
    execute: async (_, ctx) => {
      const prompt = input.promptTemplate
        .replace('{clipContent}', input.clipContent)
        .replace('{characters}', JSON.stringify(input.characters))
        .replace('{location}', input.location);

      const output = await input.runStep(
        {
          stepId: 'generate_storyboard',
          stepTitle: '生成分镜',
          stepIndex: 0,
          stepTotal: 1,
        },
        prompt,
        'generate_storyboard',
        8000
      );

      const panelArray = parsePanelArray(output.text);
      const panels: StoryboardPanelResult[] = panelArray.map((panel, index) => ({
        panelNumber: index + 1,
        description: String(panel.description || ''),
        location: String(panel.location || input.location),
        characters: Array.isArray(panel.characters)
          ? panel.characters.map(String)
          : [],
        photographyPlan: panel.photographyPlan
          ? {
              shotType: String((panel.photographyPlan as any).shotType || ''),
              cameraAngle: String((panel.photographyPlan as any).cameraAngle || ''),
              cameraMovement: String((panel.photographyPlan as any).cameraMovement || ''),
              lighting: String((panel.photographyPlan as any).lighting || ''),
            }
          : undefined,
        actingNotes: Array.isArray(panel.actingNotes)
          ? (panel.actingNotes as any[]).map((note) => ({
              character: String(note.character || ''),
              action: String(note.action || ''),
              emotion: String(note.emotion || ''),
            }))
          : undefined,
      }));

      return { panels };
    },
  });

  // 执行图
  const outputs = await executor.execute(context);

  // 提取结果
  const result: any = outputs.get('generate_storyboard');

  return {
    clipId: input.clipId,
    panels: result.panels,
    summary: {
      panelCount: result.panels.length,
    },
  };
}
