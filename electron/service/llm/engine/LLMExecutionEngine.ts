import { createLLM } from '../../chat/AgentGraph';
import { llmProviderRegistry } from '../../chat/providers';
import { getDecryptedApiKey } from '../../settings/ChannelConfigService';
import { contextManager } from '../context/ContextManager';
import { logLongTextStrategy, logQueryCompletion } from '../observability/LLMMetrics';
import { strategyPlanner } from '../strategy/StrategyPlanner';
import { mergeChunkResults } from '../strategy/StructuredMerge';
import type {
  LLMConnectionTestRequest,
  LLMConnectionTestResponse,
  LLMQueryRequest,
  LLMQueryResponse,
  QueryLogContext,
  ResolvedExecutionConfig,
  StreamCallbacks,
} from '../types';

const DEFAULT_TIMEOUT_MS = 120_000;
const SUMMARY_SKIP_CHUNK_COUNT = 2;
const MAX_RETRIES = 2;

/**
 * 流式请求的总时长硬顶。
 *
 * 流式的 timeoutMs 是**空闲**预算（首字节前 + 相邻两个分片之间的最大间隔），只要模型还在
 * 吐字就不该判超时——否则长输出的推理任务会在正常出字的过程中被掐掉。这个硬顶兜住另一种
 * 病态：上游一直滴水但永远不结束，空闲计时被无限重置。
 */
const STREAM_TOTAL_CAP_MS = 1_800_000;

function resolveApiKeyForProfile(profileId?: string): string | null {
  if (!profileId) return null;
  try {
    return getDecryptedApiKey(profileId) ?? null;
  } catch {
    return null;
  }
}

/**
 * 从流式分片里取"推理过程"增量。
 *
 * 各家把思维链放在不同字段，而且都不在 `content` 里：
 *   - DeepSeek / 多数 OpenAI 兼容网关：`additional_kwargs.reasoning_content`
 *   - 部分网关：`additional_kwargs.reasoning`
 *   - Anthropic extended thinking：content 数组里 type='thinking' 的块
 * 取不到就返回空串——拿不到思维链不影响正文，UI 那边还有计时兜底。
 */
function extractReasoningDelta(chunk: unknown): string {
  const record = chunk as { additional_kwargs?: Record<string, unknown>; content?: unknown } | undefined;
  const kwargs = record?.additional_kwargs;
  const candidate = kwargs?.reasoning_content ?? kwargs?.reasoning;
  if (typeof candidate === 'string' && candidate) return candidate;
  if (Array.isArray(record?.content)) {
    return record.content
      .map((part) => {
        const block = part as { type?: string; thinking?: unknown; text?: unknown };
        if (block?.type !== 'thinking') return '';
        const value = typeof block.thinking === 'string' ? block.thinking : block.text;
        return typeof value === 'string' ? value : '';
      })
      .join('');
  }
  return '';
}

function normalizeProvider(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveConfig(requestConfig: LLMQueryRequest['config'] | LLMConnectionTestRequest): ResolvedExecutionConfig {
  const storedApiKey = resolveApiKeyForProfile(requestConfig.profileId);
  return {
    llmProfileId: requestConfig.profileId,
    modelProvider: normalizeProvider(requestConfig.modelProvider),
    modelName: requestConfig.modelName,
    apiKey: storedApiKey || requestConfig.apiKey,
    baseUrl: requestConfig.baseUrl,
    temperature: requestConfig.temperature,
    maxTokens: requestConfig.maxTokens,
  };
}

function isPrivateHost(baseUrl: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  if (hostname === 'localhost' || hostname === '0.0.0.0') return true;

  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every(n => !Number.isNaN(n))) {
    const [a, b] = parts;
    if (a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) {
      return true;
    }
  }

  const ipv6 = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (ipv6 === '::1' || ipv6 === '::' || /^fe80:/i.test(ipv6) || /^fc[0-9a-f]{2}:/i.test(ipv6) || /^fd[0-9a-f]{2}:/i.test(ipv6)) {
    return true;
  }
  if (/^::ffff:/i.test(ipv6)) return true;
  return false;
}

function isRetryableError(errMsg: string): boolean {
  const lower = errMsg.toLowerCase();
  return lower.includes('429') || lower.includes('503') || lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('service unavailable');
}

function retryDelayMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 8000);
}

function sanitizeErrorMessage(errMsg: string): string {
  return errMsg
    .replace(/sk-[a-zA-Z0-9_-]{6,}/g, 'sk-***')
    .replace(/AIzaSy[a-zA-Z0-9_-]{20,}/g, 'AIza***')
    .replace(/xai-[a-zA-Z0-9_-]{6,}/g, 'xai-***')
    .replace(/(?:api[_-]?)?key[=:]\s*\S+/gi, 'key=***');
}

export class LLMExecutionEngine {
  async testConnection(request: LLMConnectionTestRequest): Promise<LLMConnectionTestResponse> {
    const result = await this.query({
      messages: [{ role: 'user', content: 'ping' }],
      config: request,
      options: { source: 'config-test', operation: 'testConnection' },
    });
    return result.error ? { success: false, error: result.error } : { success: true };
  }

  async query(request: LLMQueryRequest): Promise<LLMQueryResponse> {
    const logCtx = this.createLogContext(request, 'query', `llm-${Date.now()}`);
    if (!request.messages || request.messages.length === 0) {
      console.warn('[LLMQuery] 空消息数组', logCtx);
      return { content: '', error: { code: 'EMPTY_MESSAGES', message: 'messages array must not be empty' } };
    }

    let effectiveRequest = request;
    const timeoutMs = request.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();
    const decision = strategyPlanner.plan(request);

    console.info('[LLMQuery] 请求开始', { ...logCtx, timeoutMs, ...decision.budget });
    logLongTextStrategy('query', decision.strategy === 'compact-first' ? 'direct' : decision.strategy, {
      ...logCtx,
      taskKind: decision.taskKind,
      taskProfileMatched: decision.taskProfileMatched,
      taskClassificationSource: decision.taskClassificationSource,
      providerCapability: decision.capability,
      collapseApplied: decision.collapseApplied,
      ...decision.budget,
      compactedEstimatedTokens: decision.compactedEstimatedTokens,
      disableChunking: Boolean(request.options?.disableChunking),
    });

    if (decision.strategy === 'compact-first' && decision.compactedRequest) {
      effectiveRequest = decision.compactedRequest;
      logLongTextStrategy('query', 'compact-first', {
        ...logCtx,
        taskKind: decision.taskKind,
        taskProfileMatched: decision.taskProfileMatched,
        taskClassificationSource: decision.taskClassificationSource,
        providerCapability: decision.capability,
        collapseApplied: decision.collapseApplied,
        ...decision.budget,
        compactedEstimatedTokens: decision.compactedEstimatedTokens,
      });
    }
    if (decision.strategy === 'chunked' && decision.compactedRequest) {
      logLongTextStrategy('query', 'chunked', {
        ...logCtx,
        taskKind: decision.taskKind,
        taskProfileMatched: decision.taskProfileMatched,
        taskClassificationSource: decision.taskClassificationSource,
        providerCapability: decision.capability,
        collapseApplied: decision.collapseApplied,
        ...decision.budget,
        compactedEstimatedTokens: decision.compactedEstimatedTokens,
      });
      return this.queryChunked(decision.compactedRequest, decision.taskKind, logCtx, startTime);
    }

    let retryCount = 0;
    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.invokeOnce(effectiveRequest, controller.signal, logCtx);
        const durationMs = Date.now() - startTime;
        // 上游 200 但 content 为空 — 与流式分支同口径，转成 EMPTY_RESPONSE 让上层拿到清晰错误
        if (typeof response.content === 'string' && response.content.trim().length === 0) {
          console.error('[LLMQuery] 请求返回为空', { ...logCtx, durationMs, contentLength: 0, retryCount });
          return {
            content: '',
            error: {
              code: 'EMPTY_RESPONSE',
              message: 'LLM 返回内容为空，请检查所选 LLM 渠道的模型名 / 接口路径 / 配额是否可用',
            },
          };
        }
        console.info('[LLMQuery] 请求完成', { ...logCtx, durationMs, contentLength: response.content.length, retryCount, ...(response.usage ? { inputTokens: response.usage.promptTokens, outputTokens: response.usage.completionTokens } : {}) });
        logQueryCompletion('query', effectiveRequest === request ? 'direct' : 'compact-first', {
          ...logCtx,
          taskKind: decision.taskKind,
          taskProfileMatched: decision.taskProfileMatched,
          taskClassificationSource: decision.taskClassificationSource,
          providerCapability: decision.capability.provider,
          collapseApplied: decision.collapseApplied,
          durationMs,
          contentLength: response.content.length,
          retryCount,
          estimatedInputTokens: decision.budget.estimatedInputTokens,
          inputBudget: decision.budget.inputBudget,
          actualPromptTokens: response.usage?.promptTokens,
          actualCompletionTokens: response.usage?.completionTokens,
        });
        return { ...response, retryCount: retryCount > 0 ? retryCount : undefined };
      } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        const errMsg = err instanceof Error ? err.message : String(err);
        if (controller.signal.aborted) {
          console.error('[LLMQuery] 请求超时', { ...logCtx, durationMs, timeoutMs });
          return { content: '', error: { code: 'TIMEOUT', message: `LLM query timed out after ${timeoutMs}ms` } };
        }
        if (err instanceof Error && err.name === 'AbortError') {
          console.warn('[LLMQuery] 请求被中止', { ...logCtx, durationMs });
          return { content: '', error: { code: 'ABORTED', message: 'LLM query was aborted' } };
        }
        if (retryCount < MAX_RETRIES && isRetryableError(errMsg)) {
          const delay = retryDelayMs(retryCount);
          retryCount++;
          console.warn('[LLMQuery] 可重试错误，等待后重试', { ...logCtx, durationMs, error: errMsg, retryCount, delay });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        console.error('[LLMQuery] 请求异常', { ...logCtx, durationMs, error: errMsg, retryCount });
        return { content: '', error: { code: 'API_ERROR', message: sanitizeErrorMessage(errMsg) } };
      } finally {
        clearTimeout(timer);
      }
    }
  }

  async queryStream(request: LLMQueryRequest, callbacks: StreamCallbacks): Promise<void> {
    const logCtx = this.createLogContext(request, 'queryStream', `llm-stream-${Date.now()}`);
    if (!request.messages || request.messages.length === 0) {
      callbacks.onError({ code: 'EMPTY_MESSAGES', message: 'messages array must not be empty' });
      return;
    }

    const decision = strategyPlanner.plan(request);
    console.info('[LLMQuery] 流式预算评估', {
      ...logCtx,
      ...decision.budget,
      userContentLen: contextManager.totalUserContentLength(request.messages),
    });
    logLongTextStrategy('stream', decision.strategy === 'compact-first' ? 'direct' : decision.strategy, {
      ...logCtx,
      taskKind: decision.taskKind,
      taskProfileMatched: decision.taskProfileMatched,
      taskClassificationSource: decision.taskClassificationSource,
      providerCapability: decision.capability,
      collapseApplied: decision.collapseApplied,
      ...decision.budget,
      compactedEstimatedTokens: decision.compactedEstimatedTokens,
      disableChunking: Boolean(request.options?.disableChunking),
    });

    if (decision.strategy === 'compact-first' && decision.compactedRequest) {
      logLongTextStrategy('stream', 'compact-first', {
        ...logCtx,
        taskKind: decision.taskKind,
        taskProfileMatched: decision.taskProfileMatched,
        taskClassificationSource: decision.taskClassificationSource,
        providerCapability: decision.capability,
        collapseApplied: decision.collapseApplied,
        ...decision.budget,
        compactedEstimatedTokens: decision.compactedEstimatedTokens,
      });
      return this.queryStreamSingle(decision.compactedRequest, callbacks, logCtx);
    }
    if (decision.strategy === 'chunked' && decision.compactedRequest) {
      logLongTextStrategy('stream', 'chunked', {
        ...logCtx,
        taskKind: decision.taskKind,
        taskProfileMatched: decision.taskProfileMatched,
        taskClassificationSource: decision.taskClassificationSource,
        providerCapability: decision.capability,
        collapseApplied: decision.collapseApplied,
        ...decision.budget,
        compactedEstimatedTokens: decision.compactedEstimatedTokens,
      });
      return this.queryStreamChunked(decision.compactedRequest, callbacks, logCtx);
    }
    return this.queryStreamSingle(request, callbacks, logCtx);
  }

  private createLogContext(request: LLMQueryRequest, fallbackOperation: string, fallbackTraceId: string): QueryLogContext {
    return {
      traceId: request.options?.traceId || fallbackTraceId,
      source: request.options?.source || 'unknown',
      operation: request.options?.operation || fallbackOperation,
      provider: request.config.modelProvider || 'unknown',
      model: request.config.modelName || 'unknown',
      msgCount: request.messages?.length ?? 0,
    };
  }

  private async invokeOnce(request: LLMQueryRequest, signal: AbortSignal, logCtx: QueryLogContext): Promise<LLMQueryResponse> {
    const sessionConfig = resolveConfig(request.config);
    if (sessionConfig.baseUrl && isPrivateHost(sessionConfig.baseUrl)) {
      throw new Error('baseUrl points to a private/internal address');
    }

    const messages = contextManager.toLangChainMessages(request.messages);
    const wantsJsonObject = request.options?.responseFormat === 'json_object';
    const isNativeOpenAI = sessionConfig.modelProvider === 'openai' && (!sessionConfig.baseUrl || /\bopenai\.com\b/i.test(sessionConfig.baseUrl));
    const canUseResponseFormat = wantsJsonObject && isNativeOpenAI;

    let llm;
    if (canUseResponseFormat) {
      const storedApiKey = resolveApiKeyForProfile(sessionConfig.llmProfileId);
      const providerType = sessionConfig.modelProvider || 'openai';
      const resolvedType = llmProviderRegistry.has(providerType) ? providerType : 'openai-compatible';
      llm = llmProviderRegistry.create(resolvedType, {
        modelName: sessionConfig.modelName,
        apiKey: storedApiKey || sessionConfig.apiKey || undefined,
        baseUrl: sessionConfig.baseUrl,
        temperature: sessionConfig.temperature,
        maxTokens: sessionConfig.maxTokens,
        modelKwargs: { response_format: { type: 'json_object' } },
      });
      console.info('[LLMQuery] 启用 response_format=json_object', logCtx);
    } else {
      llm = createLLM(sessionConfig as any);
      if (wantsJsonObject) {
        console.info('[LLMQuery] responseFormat=json_object 已忽略（provider 不支持）', logCtx);
      }
    }

    if (sessionConfig.baseUrl) {
      try {
        const sensitiveKeys = new Set(['apikey', 'api_key', 'authorization', 'token', 'secret']);
        const params = (llm as any).invocationParams?.() ?? {};
        console.debug('[LLMQuery] OpenAI-compatible 请求参数', {
          ...logCtx,
          baseUrl: sessionConfig.baseUrl,
          invocationParams: Object.fromEntries(Object.entries(params).filter(([key, value]) => value !== undefined && !sensitiveKeys.has(key.toLowerCase()))),
          responseFormat: canUseResponseFormat ? 'json_object' : undefined,
        });
      } catch {
        // ignore
      }
    }

    const response = await llm.invoke(messages, { signal });
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    const usage = response.usage_metadata
      ? {
          promptTokens: response.usage_metadata.input_tokens ?? 0,
          completionTokens: response.usage_metadata.output_tokens ?? 0,
          totalTokens: response.usage_metadata.total_tokens ?? 0,
        }
      : undefined;
    return { content, usage };
  }

  private async queryChunked(request: LLMQueryRequest, taskKind: import('../types').LLMTaskKind, logCtx: QueryLogContext, startTime: number): Promise<LLMQueryResponse> {
    const plan = contextManager.createChunkPlan(request);
    if (!plan) {
      return { content: '', error: { code: 'EMPTY_MESSAGES', message: 'No user messages found' } };
    }
    console.info('[LLMQuery] 非流式分段计划', { ...logCtx, chunkCount: plan.chunks.length, chunkSizes: plan.chunks.map(chunk => chunk.length) });

    let summary = '';
    if (plan.chunks.length > SUMMARY_SKIP_CHUNK_COUNT) {
      const summaryInput = plan.longText.length > 6000 ? `${plan.longText.slice(0, 3000)}\n\n...[中间省略]...\n\n${plan.longText.slice(-2000)}` : plan.longText;
      const summaryResult = await this.query({
        messages: [...plan.systemMessages, { role: 'user', content: `请用 200 字以内简要概括以下文本的整体结构、主要人物和核心情节线索，不要展开细节：\n\n${summaryInput}` }],
        config: request.config,
        options: { ...request.options, traceId: `${logCtx.traceId}-summary`, operation: 'query-chunk-summary', timeoutMs: 45_000, disableChunking: true },
      });
      summary = summaryResult.content || '';
    }
    console.info('[LLMQuery] 非流式分段摘要决策', { ...logCtx, chunkCount: plan.chunks.length, summaryGenerated: Boolean(summary) });

    const parts: string[] = [];
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    for (let index = 0; index < plan.chunks.length; index++) {
      const chunkContent = plan.chunks[index];
      const chunkLabel = `[第 ${index + 1}/${plan.chunks.length} 段]`;
      const contextPrefix = `${summary ? `【全文结构摘要】\n${summary}\n\n` : ''}【当前处理进度】${chunkLabel}，共 ${plan.chunks.length} 段\n\n${index > 0 ? '请保持与前文一致的风格和术语，延续上文的处理。\n\n' : ''}`;
      const chunkUserContent = plan.lastUserMessage.content.replace(plan.longText, contextPrefix + chunkContent);
      const result = await this.query({
        ...request,
        messages: [...plan.systemMessages, ...plan.prefixUserMessages, { role: 'user', content: chunkUserContent }],
        options: { ...request.options, traceId: `${logCtx.traceId}-chunk${index + 1}`, operation: 'query-chunk', disableChunking: true },
      });
      if (result.error) {
        console.warn('[LLMQuery] 非流式分段失败', { ...logCtx, chunk: index + 1, total: plan.chunks.length, error: result.error });
        return { content: parts.join('\n\n'), error: { code: result.error.code, message: `${chunkLabel} ${result.error.message}` } };
      }
      parts.push(result.content);
      promptTokens += result.usage?.promptTokens ?? 0;
      completionTokens += result.usage?.completionTokens ?? 0;
      totalTokens += result.usage?.totalTokens ?? 0;
    }

    const mergedResult = mergeChunkResults(taskKind, parts);
    const fullContent = mergedResult.content;

    const durationMs = Date.now() - startTime;
    console.info('[LLMQuery] 非流式分段处理完成', { ...logCtx, durationMs, chunkCount: plan.chunks.length, contentLength: fullContent.length });
    logQueryCompletion('query', 'chunked', { ...logCtx, taskKind, durationMs, chunkCount: plan.chunks.length, summaryGenerated: Boolean(summary), mergedStructuredResult: mergedResult.merged, contentLength: fullContent.length, promptTokens, completionTokens, totalTokens });
    return { content: fullContent, usage: totalTokens > 0 ? { promptTokens, completionTokens, totalTokens } : undefined };
  }

  private async queryStreamSingle(request: LLMQueryRequest, callbacks: StreamCallbacks, logCtx: QueryLogContext): Promise<void> {
    const startTime = Date.now();
    // 流式语义：timeoutMs = 空闲预算（等首字节 + 分片间隔），收到分片就重置；
    // 总时长另有硬顶 STREAM_TOTAL_CAP_MS，避免"一直滴水不结束"的流永远不超时。
    const idleTimeoutMs = request.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const totalCapMs = Math.max(idleTimeoutMs, STREAM_TOTAL_CAP_MS);
    const controller = new AbortController();
    let timedOut = false;
    let timeoutKind: 'idle' | 'total' = 'idle';
    const timeoutMessage = () => (timeoutKind === 'idle'
      ? `LLM stream idle for ${idleTimeoutMs}ms (no output from upstream)`
      : `LLM stream exceeded total budget ${totalCapMs}ms`);

    let idleTimer = setTimeout(() => {
      timedOut = true;
      timeoutKind = 'idle';
      controller.abort();
    }, idleTimeoutMs);
    const totalTimer = setTimeout(() => {
      timedOut = true;
      timeoutKind = 'total';
      controller.abort();
    }, totalCapMs);
    const clearTimers = () => {
      clearTimeout(idleTimer);
      clearTimeout(totalTimer);
    };
    /** 每收到一个分片重置空闲计时：只要还在出字就不算超时。 */
    const touchIdleTimer = () => {
      if (timedOut) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        timeoutKind = 'idle';
        controller.abort();
      }, idleTimeoutMs);
    };
    const abortFromClient = () => {
      clearTimers();
      if (!controller.signal.aborted) {
        controller.abort();
      }
    };

    console.info('[LLMQuery] 流式请求开始', { ...logCtx, idleTimeoutMs, totalCapMs });

    if (callbacks.abortSignal?.aborted) {
      clearTimers();
      console.warn('[LLMQuery] 流式请求被中止', { ...logCtx, durationMs: Date.now() - startTime });
      callbacks.onError({ code: 'ABORTED', message: 'Stream aborted by client' });
      return;
    }

    callbacks.abortSignal?.addEventListener('abort', abortFromClient, { once: true });

    try {
      const sessionConfig = resolveConfig(request.config);
      if (sessionConfig.baseUrl && isPrivateHost(sessionConfig.baseUrl)) {
        callbacks.onError({ code: 'API_ERROR', message: 'baseUrl points to a private/internal address' });
        return;
      }
      const llm = createLLM(sessionConfig as any);
      const messages = contextManager.toLangChainMessages(request.messages);
      let fullContent = '';
      const stream = await llm.stream(messages, { signal: controller.signal });
      for await (const chunk of stream) {
        if (timedOut) {
          const durationMs = Date.now() - startTime;
          console.error('[LLMQuery] 流式请求超时', { ...logCtx, durationMs, timeoutKind, idleTimeoutMs, totalCapMs });
          callbacks.onError({ code: 'TIMEOUT', message: timeoutMessage() });
          return;
        }
        if (callbacks.abortSignal?.aborted) {
          console.warn('[LLMQuery] 流式请求被中止', { ...logCtx, durationMs: Date.now() - startTime });
          callbacks.onError({ code: 'ABORTED', message: 'Stream aborted by client' });
          return;
        }
        // 推理增量：思考阶段 content 恒为空，只有 reasoning 在动。它同样算"上游还活着"，
        // 要重置空闲计时；但绝不累进 fullContent——那是要写回提示词的正文。
        const reasoningDelta = extractReasoningDelta(chunk);
        if (reasoningDelta) {
          touchIdleTimer();
          callbacks.onChunk(reasoningDelta, 'reasoning');
        }
        const delta = typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
        if (delta) {
          // 先重置空闲计时再回调：onChunk 里的下游处理（IPC 转发等）不该占用空闲预算
          touchIdleTimer();
          fullContent += delta;
          callbacks.onChunk(delta, 'content');
        }
      }
      const durationMs = Date.now() - startTime;
      if (timedOut) {
        console.error('[LLMQuery] 流式请求超时', { ...logCtx, durationMs, timeoutKind, idleTimeoutMs, totalCapMs });
        callbacks.onError({ code: 'TIMEOUT', message: timeoutMessage() });
        return;
      }
      if (callbacks.abortSignal?.aborted) {
        console.warn('[LLMQuery] 流式请求被中止', { ...logCtx, durationMs });
        callbacks.onError({ code: 'ABORTED', message: 'Stream aborted by client' });
        return;
      }
      // 流结束但 0 字节 — 上游 200 但实际无内容（模型名错误 / response_format 不被支持后空返回 / 上游路由失败 / 内容过滤）
      // 直接当作失败上抛，避免下游把空字符串当成功 resolve、再死在 JSON 解析"返回为空"分支
      if (fullContent.trim().length === 0) {
        console.error('[LLMQuery] 流式请求返回为空', { ...logCtx, durationMs, contentLength: 0 });
        callbacks.onError({
          code: 'EMPTY_RESPONSE',
          message: 'LLM 返回内容为空，请检查所选 LLM 渠道的模型名 / 接口路径 / 配额是否可用',
        });
        return;
      }
      console.info('[LLMQuery] 流式请求完成', { ...logCtx, durationMs, contentLength: fullContent.length });
      logQueryCompletion('stream', 'direct', { ...logCtx, durationMs, contentLength: fullContent.length });
      callbacks.onDone({ content: fullContent });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (timedOut) {
        console.error('[LLMQuery] 流式请求超时', { ...logCtx, durationMs, timeoutKind, idleTimeoutMs, totalCapMs, error: errMsg });
        callbacks.onError({ code: 'TIMEOUT', message: timeoutMessage() });
        return;
      }
      if (callbacks.abortSignal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        console.warn('[LLMQuery] 流式请求被中止', { ...logCtx, durationMs });
        callbacks.onError({ code: 'ABORTED', message: 'Stream aborted' });
        return;
      }
      console.error('[LLMQuery] 流式请求异常', { ...logCtx, durationMs, error: errMsg });
      callbacks.onError({ code: 'API_ERROR', message: sanitizeErrorMessage(errMsg) });
    } finally {
      clearTimers();
      callbacks.abortSignal?.removeEventListener('abort', abortFromClient);
    }
  }

  private async queryStreamChunked(request: LLMQueryRequest, callbacks: StreamCallbacks, logCtx: QueryLogContext): Promise<void> {
    const startTime = Date.now();
    const plan = contextManager.createChunkPlan(request);
    if (!plan) {
      callbacks.onError({ code: 'EMPTY_MESSAGES', message: 'No user messages found' });
      return;
    }
    console.info('[LLMQuery] 文本已切分', { ...logCtx, chunkCount: plan.chunks.length, sizes: plan.chunks.map(chunk => chunk.length) });

    let summary = '';
    if (plan.chunks.length > SUMMARY_SKIP_CHUNK_COUNT) {
      console.info('[LLMQuery] 分段处理 Step 2: 生成全文摘要', { ...logCtx, textLen: plan.longText.length, chunkCount: plan.chunks.length });
      const summaryInput = plan.longText.length > 6000 ? `${plan.longText.slice(0, 3000)}\n\n...[中间省略]...\n\n${plan.longText.slice(-2000)}` : plan.longText;
      const summaryResult = await this.query({
        messages: [...plan.systemMessages, { role: 'user', content: `请用 200 字以内简要概括以下文本的整体结构、主要人物和核心情节线索，不要展开细节：\n\n${summaryInput}` }],
        config: request.config,
        options: { traceId: `${logCtx.traceId}-summary`, source: logCtx.source, operation: 'chunk-summary', timeoutMs: 45_000 },
      });
      if (callbacks.abortSignal?.aborted) {
        callbacks.onError({ code: 'ABORTED', message: 'Aborted during summary generation' });
        return;
      }
      summary = summaryResult.content || '（摘要生成失败）';
      console.info('[LLMQuery] 全文摘要完成', { ...logCtx, summaryLen: summary.length });
    } else {
      console.info('[LLMQuery] 分段数较少，跳过全文摘要以缩短首 token 时间', { ...logCtx, chunkCount: plan.chunks.length });
    }
    console.info('[LLMQuery] 流式分段摘要决策', { ...logCtx, chunkCount: plan.chunks.length, summaryGenerated: Boolean(summary) });

    let fullContent = '';
    for (let index = 0; index < plan.chunks.length; index++) {
      if (callbacks.abortSignal?.aborted) {
        callbacks.onError({ code: 'ABORTED', message: 'Aborted during chunked processing' });
        return;
      }
      const chunkContent = plan.chunks[index];
      const chunkLabel = `[第 ${index + 1}/${plan.chunks.length} 段]`;
      if (index > 0) {
        fullContent += '\n\n';
        callbacks.onChunk('\n\n');
      }
      const contextPrefix = `${summary ? `【全文结构摘要】\n${summary}\n\n` : ''}【当前处理进度】${chunkLabel}，共 ${plan.chunks.length} 段\n\n${index > 0 ? '请保持与前文一致的风格和术语，延续上文的处理。\n\n' : ''}`;
      const chunkUserContent = plan.lastUserMessage.content.replace(plan.longText, contextPrefix + chunkContent);
      console.info('[LLMQuery] 处理分段', { ...logCtx, chunk: index + 1, total: plan.chunks.length, chunkLen: chunkContent.length });
      const chunkResult = await new Promise<{ ok: true } | { ok: false; error: { code: string; message: string } }>((resolve) => {
        void this.queryStreamSingle({ ...request, messages: [...plan.systemMessages, ...plan.prefixUserMessages, { role: 'user', content: chunkUserContent }], options: { ...request.options, traceId: `${logCtx.traceId}-chunk${index + 1}` } }, {
          onChunk: (delta, kind) => {
            // 推理增量只透传给 UI，不进 fullContent（分段模式同样）
            if (kind !== 'reasoning') fullContent += delta;
            callbacks.onChunk(delta, kind);
          },
          onDone: () => resolve({ ok: true }),
          onError: (error) => resolve({ ok: false, error: { code: error.code, message: `${chunkLabel} ${error.message}` } }),
          abortSignal: callbacks.abortSignal,
        }, logCtx).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          resolve({ ok: false, error: { code: 'UNKNOWN', message: `${chunkLabel} ${message}` } });
        });
      });
      if (!chunkResult.ok) {
        callbacks.onError(chunkResult.error);
        return;
      }
    }

    const durationMs = Date.now() - startTime;
    if (fullContent.trim().length === 0) {
      console.error('[LLMQuery] 分段流式请求返回为空', { ...logCtx, durationMs, chunkCount: plan.chunks.length, contentLength: 0 });
      callbacks.onError({
        code: 'EMPTY_RESPONSE',
        message: 'LLM 返回内容为空，请检查所选 LLM 渠道的模型名 / 接口路径 / 配额是否可用',
      });
      return;
    }
    console.info('[LLMQuery] 分段流式处理全部完成', { ...logCtx, durationMs, chunkCount: plan.chunks.length, contentLength: fullContent.length });
    logQueryCompletion('stream', 'chunked', { ...logCtx, durationMs, chunkCount: plan.chunks.length, summaryGenerated: Boolean(summary), contentLength: fullContent.length });
    callbacks.onDone({ content: fullContent });
  }
}

export const llmExecutionEngine = new LLMExecutionEngine();
