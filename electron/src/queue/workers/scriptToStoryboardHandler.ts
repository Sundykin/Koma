/**
 * Script-to-Storyboard Worker Handler
 * 处理剧本 → 分镜图的任务
 */

import { scriptToStoryboardOrchestrator } from '../../orchestrators/scriptToStoryboardOrchestrator';
import type { OrchestratorContext } from '../../orchestrators/types';
import type { RendererDelegate } from './rendererDelegate';

export const TASK_CANCELLED_ERROR = 'TASK_CANCELLED';

export interface ScriptToStoryboardTaskPayload {
  projectId: string;
  episodeId: string;
  clipId: string;
  clipContent: string;
  characters: Array<{ name: string; description: string }>;
  location: string;
}

export interface ScriptToStoryboardTaskResult {
  clipId: string;
  panels: Array<{
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
  }>;
  summary: {
    panelCount: number;
  };
}

export interface ScriptToStoryboardHandlerOptions {
  taskId: string;
  payload: ScriptToStoryboardTaskPayload;
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
const DEFAULT_PROMPT_TEMPLATE = `为以下剧本片段生成分镜面板：

剧本内容：
{clipContent}

角色信息：
{characters}

场景：{location}

请以 JSON 数组格式返回所有分镜面板，每个面板包括：
- panelNumber: 面板编号
- description: 画面描述
- location: 场景
- characters: 出现的角色列表
- photographyPlan: 摄影计划
  - shotType: 镜头类型（特写/中景/全景等）
  - cameraAngle: 机位角度（平视/俯视/仰视等）
  - cameraMovement: 运镜方式（固定/推拉/摇移等）
  - lighting: 光线描述
- actingNotes: 表演注释（可选）
  - character: 角色名称
  - action: 动作描述
  - emotion: 情绪状态

返回格式：
[
  {
    "panelNumber": 1,
    "description": "...",
    "location": "...",
    "characters": ["角色1"],
    "photographyPlan": {
      "shotType": "中景",
      "cameraAngle": "平视",
      "cameraMovement": "固定",
      "lighting": "自然光"
    },
    "actingNotes": [
      {
        "character": "角色1",
        "action": "...",
        "emotion": "..."
      }
    ]
  }
]`;

/**
 * 执行 Script-to-Storyboard 任务
 */
export async function runScriptToStoryboardTask(
  options: ScriptToStoryboardHandlerOptions
): Promise<ScriptToStoryboardTaskResult> {
  const { taskId, payload, delegate, onProgress, isCancelled } = options;

  ensureNotCancelled(isCancelled);
  await onProgress(0, 'initialize', '初始化任务');

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
  await onProgress(10, 'orchestrator', '开始生成分镜');

  // 执行 Orchestrator
  const orchestratorResult = await scriptToStoryboardOrchestrator(
    {
      clipId: payload.clipId,
      clipContent: payload.clipContent,
      characters: payload.characters,
      location: payload.location,
      promptTemplate: DEFAULT_PROMPT_TEMPLATE,
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
    },
    context
  );

  ensureNotCancelled(isCancelled);
  await onProgress(90, 'finalize', '整理结果');

  // 转换结果格式
  const result: ScriptToStoryboardTaskResult = {
    clipId: orchestratorResult.clipId,
    panels: orchestratorResult.panels,
    summary: orchestratorResult.summary,
  };

  ensureNotCancelled(isCancelled);
  await onProgress(100, 'complete', '任务完成');

  return result;
}
