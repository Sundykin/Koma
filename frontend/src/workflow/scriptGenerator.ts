/**
 * AI 剧本生成器
 * 使用 LLM 生成完整剧本
 */
import type { AppSettings } from '../types';
import { getProjectLLMProvider } from '../providers';
import type { LLMCallOptions, LLMStreamChunkHandler } from '../providers/llm/types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { logLLMCall } from '../store/aiCallLogger';
import { createLogger } from '../store/logger';
import { createAITraceId, describeLLMProviderTransport } from '../utils/aiTrace';
import type { StyleSnapshotLike } from '../utils/promptNormalize';

const logger = createLogger('ScriptGenerator');

interface StyleContext {
  styleSnapshot?: StyleSnapshotLike;
  project?: { styleSnapshot?: StyleSnapshotLike };
}

type ScriptLLMCallOptions = LLMCallOptions & StyleContext & {
  onChunk?: LLMStreamChunkHandler;
};

// 随机创意接口（保留兼容）
interface RandomIdea {
  topic: string;
  style: string;
  keyElements: string[];
  logline: string;
}

// 随机剧本生成结果
export interface RandomScriptResult {
  script: string;
  metadata: RandomIdea;
}

function getResolvedLLMStyleSuffix(context?: StyleContext): string {
  return context?.styleSnapshot?.llmPromptSuffix
    || context?.project?.styleSnapshot?.llmPromptSuffix
    || '';
}

function appendStyleRequirement(prompt: string, context?: StyleContext): string {
  const styleSuffix = getResolvedLLMStyleSuffix(context)?.trim();
  if (!styleSuffix) {
    return prompt;
  }
  return `${prompt}\n\n【项目风格要求】\n${styleSuffix}`;
}

/**
 * 从剧本文本中解析元数据注释
 */
function parseScriptMetadata(script: string): RandomIdea {
  const metadataMatch = script.match(/<!--\s*([\s\S]*?)\s*-->/);
  if (!metadataMatch) {
    return {
      topic: '未知主题',
      style: '未知风格',
      keyElements: [],
      logline: '',
    };
  }

  const metadataText = metadataMatch[1];
  const topicMatch = metadataText.match(/主题[：:]\s*(.+)/);
  const styleMatch = metadataText.match(/风格[：:]\s*(.+)/);
  const elementsMatch = metadataText.match(/关键元素[：:]\s*(.+)/);
  const loglineMatch = metadataText.match(/一句话简介[：:]\s*(.+)/);

  return {
    topic: topicMatch?.[1]?.trim() || '未知主题',
    style: styleMatch?.[1]?.trim() || '未知风格',
    keyElements: elementsMatch?.[1]?.split(/[,，]/).map(s => s.trim()).filter(Boolean) || [],
    logline: loglineMatch?.[1]?.trim() || '',
  };
}

/**
 * 生成随机创意（已废弃，保留兼容）
 * @deprecated 请使用 generateRandomScript
 */
export async function generateRandomIdea(
  onProgress?: (progress: number, step?: string) => void
): Promise<RandomIdea> {
  onProgress?.(5, '生成随机剧本...');
  const { metadata } = await generateRandomScriptWithMetadata('3', progress => {
    onProgress?.(Math.min(progress, 90), progress < 100 ? '生成随机剧本...' : '解析创意...');
  });
  onProgress?.(100, '创意生成完成');
  return metadata;
}

/**
 * 随机生成剧本（一步完成）
 */
export async function generateRandomScript(
  duration: string = '3',
  onProgress?: (progress: number, step?: string) => void,
  traceContext?: ScriptLLMCallOptions
): Promise<string> {
  const provider = await getProjectLLMProvider();
  if (!provider) {
    throw new Error('未配置 LLM 模型');
  }

  const finalTraceContext: LLMCallOptions = {
    traceId: traceContext?.traceId || createAITraceId('random-script'),
    source: traceContext?.source || 'scriptGenerator.generateRandomScript',
    operation: traceContext?.operation || 'random_script_generation',
    projectId: traceContext?.projectId,
    targetId: traceContext?.targetId,
    targetName: traceContext?.targetName || '随机生成剧本',
  };
  const providerLabel = `${provider.type}:${provider.config.modelName || 'default'}`;

  onProgress?.(5, '加载 Prompt 模板...');
  const styleContext: StyleContext = {
    styleSnapshot: traceContext?.styleSnapshot,
    project: traceContext?.project,
  };
  const resolvedPrompt = await resolvePromptTemplate('random_script_generation', {
    duration,
  });
  const finalPrompt = appendStyleRequirement(resolvedPrompt.prompt, styleContext);

  logger.info('开始随机生成剧本', {
    traceId: finalTraceContext.traceId,
    duration,
    provider: providerLabel,
    transport: describeLLMProviderTransport(provider.type),
  });
  logLLMCall(providerLabel, finalPrompt, undefined, {
    ...finalTraceContext,
    templateId: resolvedPrompt.template.id,
    promptSource: resolvedPrompt.source,
  });

  onProgress?.(15, '正在生成随机剧本...');
  const response = await provider.chat([
    { role: 'user', content: finalPrompt },
  ], {
    ...finalTraceContext,
    stream: typeof traceContext?.onChunk === 'function',
  }, traceContext?.onChunk);

  onProgress?.(100, '剧本生成完成');
  logger.info('随机生成剧本完成', {
    traceId: finalTraceContext.traceId,
    provider: providerLabel,
    responseLength: response.length,
  });
  return response;
}

/**
 * 随机生成剧本（带元数据）
 */
export async function generateRandomScriptWithMetadata(
  duration: string = '3',
  onProgress?: (progress: number, step?: string) => void,
  styleContext?: StyleContext
): Promise<RandomScriptResult> {
  const script = await generateRandomScript(duration, onProgress, styleContext);
  const metadata = parseScriptMetadata(script);
  return { script, metadata };
}

/**
 * 润色剧本（使用 Prompt 模板）
 */
export async function polishScript(
  settings: AppSettings,
  script: string,
  requirements: string = '使语言更加生动，对话更自然',
  onProgress: (progress: number, step?: string) => void,
  styleContext?: StyleContext,
  onChunk?: LLMStreamChunkHandler,
): Promise<string> {
  const provider = await getProjectLLMProvider();
  if (!provider) {
    throw new Error('未配置 LLM 模型');
  }

  onProgress(5, '加载 Prompt 模板...');
  const resolvedPrompt = await resolvePromptTemplate('script_polish', {
    script,
    requirements,
  });
  const finalPrompt = appendStyleRequirement(resolvedPrompt.prompt, styleContext);

  onProgress(10, '正在润色剧本...');
  const response = await provider.chat([
    { role: 'user', content: finalPrompt },
  ], {
    source: 'scriptGenerator.polishScript',
    operation: 'script_polish_stream',
    taskKind: 'rewrite',
    taskProfileId: 'script-polish-stream',
    targetName: '剧本润色',
    stream: true,
  }, onChunk);

  onProgress(100, '润色完成');
  return response;
}

export default {
  generateRandomIdea,
  generateRandomScript,
  generateRandomScriptWithMetadata,
  polishScript,
};
