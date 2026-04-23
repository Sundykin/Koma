import type { AppSettings } from '../../../../../types';
import { buildLLMConfigFromContext, resolveConfiguredChannelModel } from '../../../../../providers/channel/resolver';
import {
  cancelStream,
  createSession,
  createUserInput,
  disposeSession,
  onStreamChunk,
  onStreamDone,
  onStreamError,
  onStreamTool,
  sendMessageStream,
  type ContentPart,
} from '../../../../../chat/ipc';
import { resolveProviderAssetInput } from '../../../../../services/mediaAssetResolver';
import { createLogger } from '../../../../../store/logger';
import type {
  LinghuiAgentExecutionMetadata,
  LinghuiAgentToolTraceEntry,
} from '../../../../../types/linghui';
import { throwIfExecutionAborted } from '../linghuiExecutionShared';
import { resolveExecutionSettings } from './shared';

const agentLogger = createLogger('LinghuiAgentExecution');

function mapLLMProviderToChatProvider(provider: string): 'openai' | 'anthropic' | 'google' | null {
  switch (provider) {
    case 'openai-compatible':
      return 'openai';
    case 'claude':
      return 'anthropic';
    case 'gemini':
      return 'google';
    default:
      return null;
  }
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  const binary = Array.from(bytes)
    .map(byte => String.fromCharCode(byte))
    .join('');
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function resolveAgentImageParts(imageSources: string[]): Promise<ContentPart[]> {
  const parts: ContentPart[] = [];

  for (const source of imageSources) {
    const resolved = await resolveProviderAssetInput(source);
    if (!resolved) {
      throw new Error('Agent 节点无法读取上游图片参考，请确认图片文件仍可访问');
    }

    let imageUrl = resolved.value;
    if (resolved.transport === 'remote-url') {
      const response = await fetch(resolved.value);
      if (!response.ok) {
        throw new Error('Agent 节点无法下载远程图片参考，请稍后重试');
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const mimeType = response.headers.get('content-type') || resolved.mimeType || 'image/png';
      imageUrl = bytesToDataUrl(bytes, mimeType);
    }

    parts.push({
      type: 'image',
      imageUrl,
      mimeType: resolved.mimeType,
    });
  }

  return parts;
}

export async function runAgentWithProvider(params: {
  prompt: string;
  systemPrompt?: string;
  llmSelection?: string;
  enabledTools?: string[];
  maxIterations?: number;
  imageSources?: string[];
  inputTextCount?: number;
  settingsSnapshot?: AppSettings;
  onChunk?: (delta: string, accumulated: string) => void;
  onProgress?: (progress: number, message?: string, partialResult?: unknown) => void;
  signal?: AbortSignal;
}): Promise<{ text: string; metadata: LinghuiAgentExecutionMetadata }> {
  throwIfExecutionAborted(params.signal);

  const prompt = String(params.prompt ?? '').trim();
  if (!prompt) {
    throw new Error('请先输入 Agent 提示词');
  }

  const settings = await resolveExecutionSettings(params.settingsSnapshot);
  const context = resolveConfiguredChannelModel(settings, 'llm', params.llmSelection || undefined, 'llm.chat');
  if (!context) {
    throw new Error('请先选择支持对话能力的 LLM 渠道');
  }

  const llmConfig = buildLLMConfigFromContext(context);
  const modelProvider = mapLLMProviderToChatProvider(llmConfig.provider);
  if (!modelProvider) {
    throw new Error('当前 LLM 渠道暂时无法用于 Agent 节点，请切换到 OpenAI 兼容、Claude 或 Gemini 渠道');
  }

  const enabledTools = Array.isArray(params.enabledTools)
    ? params.enabledTools.map(tool => String(tool).trim()).filter(Boolean)
    : [];
  const maxIterations = Math.max(1, Number(params.maxIterations ?? 6));
  const imageSources = Array.isArray(params.imageSources)
    ? params.imageSources.map(source => String(source).trim()).filter(Boolean)
    : [];
  const imageParts = await resolveAgentImageParts(imageSources);
  const inputContent: string | ContentPart[] = imageParts.length > 0
    ? [{ type: 'text', text: prompt }, ...imageParts]
    : prompt;

  const session = await createSession({
    systemPrompt: String(params.systemPrompt ?? '').trim() || undefined,
    enabledTools,
    llmProfileId: llmConfig.profileId,
    modelProvider,
    modelName: llmConfig.modelName,
    apiKey: llmConfig.apiKey || undefined,
    baseUrl: llmConfig.baseUrl,
    agentMode: 'single',
  });

  let fullContent = '';
  let fullReasoning = '';
  let finishReason: string | undefined;
  let observedToolRounds = 0;
  const toolTrace: LinghuiAgentToolTraceEntry[] = [];
  const toolCallNames = new Map<string, string>();
  let settled = false;

  const cleanupCallbacks: Array<() => void> = [];

  try {
    params.onProgress?.(8, '启动 Agent');

    const result = await new Promise<{ text: string; finishReason?: string }>((resolve, reject) => {
      const settle = (finalizer: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupCallbacks.splice(0).forEach(callback => {
          try {
            callback();
          } catch {
            // noop
          }
        });
        finalizer();
      };

      const handleAbort = () => {
        void cancelStream(session.id);
        settle(() => reject(new Error(typeof params.signal?.reason === 'string' ? params.signal.reason : '执行已取消')));
      };

      if (params.signal) {
        params.signal.addEventListener('abort', handleAbort, { once: true });
        cleanupCallbacks.push(() => params.signal?.removeEventListener('abort', handleAbort));
      }

      cleanupCallbacks.push(onStreamChunk((_, event) => {
        if (event.sessionId !== session.id || settled) {
          return;
        }
        fullContent += event.delta || '';
        params.onChunk?.(event.delta || '', fullContent);
        if (event.reasoning) {
          fullReasoning += event.reasoning;
        }
        params.onProgress?.(
          Math.min(92, 20 + observedToolRounds * 12),
          observedToolRounds > 0 ? 'Agent 推理与调用工具中' : 'Agent 推理中',
        );
      }));

      cleanupCallbacks.push(onStreamTool((_, event) => {
        if (event.sessionId !== session.id || settled) {
          return;
        }

        const toolCallId = String(event.toolCall?.id ?? '');
        const isToolCallEvent = event.result === undefined && event.error === undefined;

        if (toolCallId && event.toolCall && isToolCallEvent) {
          observedToolRounds += 1;
          toolCallNames.set(toolCallId, String(event.toolCall.name ?? ''));
          toolTrace.push({
            kind: 'tool-call',
            toolCallId,
            name: String(event.toolCall.name ?? ''),
            arguments: event.toolCall.arguments ?? {},
          });

          if (observedToolRounds > maxIterations) {
            void cancelStream(session.id);
            settle(() => reject(new Error(`Agent 节点超过最大迭代上限（${maxIterations}）`)));
            return;
          }
        }

        if ('result' in event) {
          toolTrace.push({
            kind: 'tool-result',
            toolCallId,
            name: toolCallNames.get(toolCallId) || String(event.toolCall?.name ?? ''),
            result: event.result,
            error: event.error,
          });
        }
      }));

      cleanupCallbacks.push(onStreamDone((_, event) => {
        if (event.sessionId !== session.id || settled) {
          return;
        }
        finishReason = event.finishReason;
        const messageContent = event.message?.content;
        const finalText = typeof messageContent === 'string' && messageContent.trim()
          ? messageContent.trim()
          : fullContent.trim();
        settle(() => resolve({ text: finalText, finishReason: event.finishReason }));
      }));

      cleanupCallbacks.push(onStreamError((_, event) => {
        if (event.sessionId !== session.id || settled) {
          return;
        }
        settle(() => reject(new Error(event.error?.message || 'Agent 执行失败')));
      }));

      sendMessageStream(session.id, createUserInput(inputContent))
        .then(response => {
          if (!response.accepted) {
            settle(() => reject(new Error('Agent 执行请求未被接受')));
            return;
          }
          params.onProgress?.(16, 'Agent 请求已发送');
        })
        .catch(error => {
          settle(() => reject(error instanceof Error ? error : new Error(String(error))));
        });
    });

    throwIfExecutionAborted(params.signal);
    params.onProgress?.(100, 'Agent 执行完成');

    agentLogger.info('灵绘 Agent 执行完成', {
      selectionKey: params.llmSelection,
      provider: llmConfig.provider,
      modelName: llmConfig.modelName,
      enabledTools,
      maxIterations,
      observedToolRounds,
      finishReason: result.finishReason,
      imageCount: imageSources.length,
      promptLength: prompt.length,
    });

    return {
      text: result.text.trim(),
      metadata: {
        mode: 'agent',
        prompt,
        systemPrompt: String(params.systemPrompt ?? '').trim(),
        llmSelection: String(params.llmSelection ?? ''),
        enabledTools,
        maxIterations,
        observedToolRounds,
        finishReason: result.finishReason ?? finishReason,
        reasoning: fullReasoning.trim() || undefined,
        toolTrace,
        inputTextCount: Math.max(0, Number(params.inputTextCount ?? 0)),
        inputImageCount: imageSources.length,
      },
    };
  } finally {
    cleanupCallbacks.splice(0).forEach(callback => {
      try {
        callback();
      } catch {
        // noop
      }
    });
    await disposeSession(session.id).catch(() => false);
  }
}
