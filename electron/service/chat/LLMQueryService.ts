/**
 * LLM 无状态查询服务
 * 借鉴 Claude Code QueryEngine 模式，提供不依赖 Session 的轻量 LLM 调用
 * 供 workflow 服务（分镜生成、实体提取、剧本分析等）通过 IPC 调用
 *
 * 支持两种模式：
 * - llm:query — 请求-响应模式（短文本、快速任务）
 * - llm:queryStream — 流式模式（长文本、内容精炼等重量级任务）
 * 每次调用独立，无会话状态。
 */
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { createLLM } from './AgentGraph';
import type { SessionConfig } from './types';
import { llmProfileStore } from './LLMProfileStore';

export interface LLMQueryRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  config: {
    profileId?: string;
    modelProvider?: 'openai' | 'anthropic' | 'google';
    modelName?: string;
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
  };
  options?: {
    traceId?: string;
    source?: string;
    operation?: string;
    /** 超时毫秒数，默认 60000 */
    timeoutMs?: number;
  };
}

export interface LLMConnectionTestRequest {
  profileId?: string;
  modelProvider?: 'openai' | 'anthropic' | 'google';
  modelName?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMConnectionTestResponse {
  success: boolean;
  error?: {
    code: 'EMPTY_MESSAGES' | 'TIMEOUT' | 'ABORTED' | 'API_ERROR' | 'UNKNOWN';
    message: string;
  };
}

export interface LLMSaveProfileRequest {
  profileId: string;
  apiKey?: string;
}

function resolveConfig(requestConfig: LLMQueryRequest['config'] | LLMConnectionTestRequest): SessionConfig {
  const stored = requestConfig.profileId ? llmProfileStore.getProfile(requestConfig.profileId) : null;

  return {
    llmProfileId: requestConfig.profileId,
    modelProvider: requestConfig.modelProvider,
    modelName: requestConfig.modelName,
    apiKey: stored?.apiKey || requestConfig.apiKey,
    baseUrl: requestConfig.baseUrl,
    temperature: requestConfig.temperature,
    maxTokens: requestConfig.maxTokens,
  };
}

// NOTE: Keep in sync with LLMQueryResponse in frontend/src/chat/ipc/chatIPC.ts
export interface LLMQueryResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: {
    code: 'EMPTY_MESSAGES' | 'TIMEOUT' | 'ABORTED' | 'API_ERROR' | 'UNKNOWN';
    message: string;
  };
  retryCount?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

// ========== 长文本自动分段（后端侧处理，对前端透明） ==========
const CHUNK_CHAR_THRESHOLD = 50_000;  // 总 user 消息内容超过 50K 字符时触发分段
const CHUNK_TARGET_SIZE = 8_000;       // 每段目标 ~8K 字符
const CHUNK_OVERLAP_LINES = 3;         // 段间重叠行数，保持上下文衔接

/**
 * 在段落/换行边界切分长文本，保证每段不会从句子中间断开。
 * 段间保留 CHUNK_OVERLAP_LINES 行重叠以维持上下文连贯。
 */
function splitTextAtParagraphs(text: string, targetSize: number): string[] {
  // 按双换行（段落）或单换行切分
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    // 如果单个段落就超过 targetSize，按单行切分
    if (para.length > targetSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      const lines = para.split('\n');
      let lineChunk = '';
      for (const line of lines) {
        if (lineChunk.length + line.length + 1 > targetSize && lineChunk.trim()) {
          chunks.push(lineChunk.trim());
          lineChunk = '';
        }
        lineChunk += (lineChunk ? '\n' : '') + line;
      }
      if (lineChunk.trim()) {
        currentChunk = lineChunk;
      }
      continue;
    }

    const separator = '\n\n';
    if (currentChunk.length + separator.length + para.length > targetSize && currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += (currentChunk ? separator : '') + para;
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // 添加段间重叠：每段末尾几行作为下一段的开头
  if (chunks.length <= 1 || CHUNK_OVERLAP_LINES <= 0) return chunks;

  const overlapped: string[] = [chunks[0]];
  for (let i = 1; i < chunks.length; i++) {
    const prevLines = chunks[i - 1].split('\n');
    const overlapText = prevLines.slice(-CHUNK_OVERLAP_LINES).join('\n');
    overlapped.push(overlapText + '\n\n' + chunks[i]);
  }
  return overlapped;
}

/**
 * 计算 messages 中所有 user 消息的总字符数
 */
function totalUserContentLength(messages: LLMQueryRequest['messages']): number {
  return messages
    .filter(m => m.role === 'user')
    .reduce((sum, m) => sum + m.content.length, 0);
}

function toLangChainMessages(messages: LLMQueryRequest['messages']): BaseMessage[] {
  return messages.map(msg => {
    switch (msg.role) {
      case 'system': return new SystemMessage(msg.content);
      case 'assistant': return new AIMessage(msg.content);
      case 'user':
      default: return new HumanMessage(msg.content);
    }
  });
}

function isPrivateHost(baseUrl: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  if (hostname === 'localhost') return true;
  if (hostname === '0.0.0.0') return true;

  // IPv4 checks
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every(n => !Number.isNaN(n))) {
    const [a, b] = parts;
    if (a === 127) return true;                                          // 127.0.0.0/8
    if (a === 10) return true;                                           // 10.0.0.0/8
    if (a === 192 && b === 168) return true;                             // 192.168.0.0/16
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 169 && b === 254) return true;                             // 169.254.0.0/16 link-local
  }

  // IPv6 checks — URL 中 IPv6 地址被方括号包裹，new URL().hostname 会保留方括号
  const ipv6 = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  if (ipv6 === '::1') return true;                                      // IPv6 localhost
  if (ipv6 === '::') return true;                                       // IPv6 零地址
  if (/^fe80:/i.test(ipv6)) return true;                                // fe80::/10 link-local
  if (/^fc[0-9a-f]{2}:/i.test(ipv6)) return true;                      // fc00::/7 unique local (fc)
  if (/^fd[0-9a-f]{2}:/i.test(ipv6)) return true;                      // fc00::/7 unique local (fd)

  // IPv4-mapped IPv6: ::ffff:x.x.x.x 或 ::ffff:xxxx:xxxx
  if (/^::ffff:/i.test(ipv6)) {
    const mapped = ipv6.slice(7);
    const v4parts = mapped.split('.').map(Number);
    if (v4parts.length === 4 && v4parts.every(n => !Number.isNaN(n))) {
      const [a, b] = v4parts;
      if (a === 127 || a === 10 || (a === 192 && b === 168) ||
          (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return true;
    }
    // 保守策略：所有 ::ffff: 映射地址一律拦截
    return true;
  }

  return false;
}

const MAX_RETRIES = 2;

function isRetryableError(errMsg: string): boolean {
  const lower = errMsg.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('503') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('service unavailable')
  );
}

function retryDelayMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 8000);
}

export class LLMQueryService {
  async testConnection(request: LLMConnectionTestRequest): Promise<LLMConnectionTestResponse> {
    const result = await this.query({
      messages: [{ role: 'user', content: 'ping' }],
      config: {
        profileId: request.profileId,
        modelProvider: request.modelProvider,
        modelName: request.modelName,
        apiKey: request.apiKey,
        baseUrl: request.baseUrl,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
      },
      options: {
        source: 'config-test',
        operation: 'testConnection',
      },
    });

    return result.error
      ? { success: false, error: result.error }
      : { success: true };
  }

  /**
   * 执行无状态 LLM 查询。内部捕获所有异常，返回结构化错误而非抛出。
   */
  async query(request: LLMQueryRequest): Promise<LLMQueryResponse> {
    const traceId = request.options?.traceId || `llm-${Date.now()}`;
    const source = request.options?.source || 'unknown';
    const operation = request.options?.operation || 'query';
    const provider = request.config.modelProvider || 'unknown';
    const model = request.config.modelName || 'unknown';
    const msgCount = request.messages?.length ?? 0;

    const logCtx = { traceId, source, operation, provider, model, msgCount };

    if (!request.messages || request.messages.length === 0) {
      console.warn('[LLMQuery] 空消息数组', logCtx);
      return {
        content: '',
        error: { code: 'EMPTY_MESSAGES', message: 'messages array must not be empty' },
      };
    }

    const timeoutMs = request.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    console.info('[LLMQuery] 请求开始', { ...logCtx, timeoutMs });

    let retryCount = 0;

    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const sessionConfig = resolveConfig(request.config);

        if (sessionConfig.baseUrl && isPrivateHost(sessionConfig.baseUrl)) {
          console.warn('[LLMQuery] 拒绝私有地址', { ...logCtx, baseUrl: sessionConfig.baseUrl });
          return {
            content: '',
            error: { code: 'API_ERROR', message: 'baseUrl points to a private/internal address' },
          };
        }

        const llm = createLLM(sessionConfig);
        const messages = toLangChainMessages(request.messages);

        // 打印实际发送的参数，排查兼容性问题
        if (sessionConfig.baseUrl) {
          try {
            const SENSITIVE_KEYS = new Set(['apikey', 'api_key', 'authorization', 'token', 'secret']);
            const params = (llm as any).invocationParams?.() ?? {};
            console.debug('[LLMQuery] OpenAI-compatible 请求参数', {
              ...logCtx,
              baseUrl: sessionConfig.baseUrl,
              invocationParams: Object.fromEntries(
                Object.entries(params).filter(([k, v]) => v !== undefined && !SENSITIVE_KEYS.has(k.toLowerCase()))
              ),
            });
          } catch { /* ignore */ }
        }

        const response = await llm.invoke(messages, { signal: controller.signal });

        const content = typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

        const usage = response.usage_metadata
          ? {
              promptTokens: response.usage_metadata.input_tokens ?? 0,
              completionTokens: response.usage_metadata.output_tokens ?? 0,
              totalTokens: response.usage_metadata.total_tokens ?? 0,
            }
          : undefined;

        const durationMs = Date.now() - startTime;
        console.info('[LLMQuery] 请求完成', {
          ...logCtx,
          durationMs,
          contentLength: content.length,
          retryCount,
          ...(usage ? { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens } : {}),
        });

        return { content, usage, retryCount: retryCount > 0 ? retryCount : undefined };
      } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        const errMsg = err instanceof Error ? err.message : String(err);

        if (controller.signal.aborted) {
          // 超时：直接返回错误，不再重试（长文本重发相同请求必然再次超时）
          console.error('[LLMQuery] 请求超时', { ...logCtx, durationMs, timeoutMs });
          return {
            content: '',
            error: { code: 'TIMEOUT', message: `LLM query timed out after ${timeoutMs}ms` },
          };
        }
        if (err instanceof Error && err.name === 'AbortError') {
          console.warn('[LLMQuery] 请求被中止', { ...logCtx, durationMs });
          return {
            content: '',
            error: { code: 'ABORTED', message: 'LLM query was aborted' },
          };
        }

        // 对 429/503 等可重试错误进行指数退避重试
        if (retryCount < MAX_RETRIES && isRetryableError(errMsg)) {
          const delay = retryDelayMs(retryCount);
          retryCount++;
          console.warn('[LLMQuery] 可重试错误，等待后重试', { ...logCtx, durationMs, error: errMsg, retryCount, delay });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // 内部日志记录完整错误
        console.error('[LLMQuery] 请求异常', { ...logCtx, durationMs, error: errMsg, retryCount });
        // 返回给前端：保留 API 状态码和错误描述，但脱敏 API Key
        const safeMsg = errMsg
          .replace(/sk-[a-zA-Z0-9_-]{6,}/g, 'sk-***')
          .replace(/AIzaSy[a-zA-Z0-9_-]{20,}/g, 'AIza***')
          .replace(/xai-[a-zA-Z0-9_-]{6,}/g, 'xai-***')
          .replace(/(?:api[_-]?)?key[=:]\s*\S+/gi, 'key=***');
        return {
          content: '',
          error: { code: 'API_ERROR', message: safeMsg },
        };
      } finally {
        clearTimeout(timer);
      }
    }
  }

  /**
   * 流式 LLM 查询。通过回调逐 chunk 推送内容，无应用层超时。
   * 适用于长文本精炼等重量级任务。
   *
   * 当 user 消息总字符数超过 CHUNK_CHAR_THRESHOLD 时，自动拆段串行处理：
   * 1. 先用一次 LLM 调用生成全文结构摘要
   * 2. 按段落边界切分为多段，每段附带全文摘要 + 段间重叠
   * 3. 串行流式处理每段，合并结果推送给前端
   * 对前端完全透明——前端只看到一个连续的流。
   */
  async queryStream(
    request: LLMQueryRequest,
    onChunk: (delta: string) => void,
    onDone: (result: { content: string; usage?: LLMQueryResponse['usage'] }) => void,
    onError: (error: { code: string; message: string }) => void,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const traceId = request.options?.traceId || `llm-stream-${Date.now()}`;
    const source = request.options?.source || 'unknown';
    const operation = request.options?.operation || 'queryStream';
    const provider = request.config.modelProvider || 'unknown';
    const model = request.config.modelName || 'unknown';
    const msgCount = request.messages?.length ?? 0;

    const logCtx = { traceId, source, operation, provider, model, msgCount };

    if (!request.messages || request.messages.length === 0) {
      onError({ code: 'EMPTY_MESSAGES', message: 'messages array must not be empty' });
      return;
    }

    // 判断是否需要分段处理
    const userContentLen = totalUserContentLength(request.messages);
    if (userContentLen > CHUNK_CHAR_THRESHOLD) {
      console.info('[LLMQuery] 长文本触发自动分段', { ...logCtx, userContentLen, threshold: CHUNK_CHAR_THRESHOLD });
      return this.queryStreamChunked(request, onChunk, onDone, onError, abortSignal);
    }

    return this.queryStreamSingle(request, onChunk, onDone, onError, abortSignal);
  }

  /**
   * 单次流式查询（不分段），内部方法。
   */
  private async queryStreamSingle(
    request: LLMQueryRequest,
    onChunk: (delta: string) => void,
    onDone: (result: { content: string; usage?: LLMQueryResponse['usage'] }) => void,
    onError: (error: { code: string; message: string }) => void,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const traceId = request.options?.traceId || `llm-stream-${Date.now()}`;
    const source = request.options?.source || 'unknown';
    const operation = request.options?.operation || 'queryStream';
    const provider = request.config.modelProvider || 'unknown';
    const model = request.config.modelName || 'unknown';
    const msgCount = request.messages?.length ?? 0;

    const logCtx = { traceId, source, operation, provider, model, msgCount };
    const startTime = Date.now();
    console.info('[LLMQuery] 流式请求开始', logCtx);

    try {
      const sessionConfig = resolveConfig(request.config);

      if (sessionConfig.baseUrl && isPrivateHost(sessionConfig.baseUrl)) {
        onError({ code: 'API_ERROR', message: 'baseUrl points to a private/internal address' });
        return;
      }

      const llm = createLLM(sessionConfig);
      const messages = toLangChainMessages(request.messages);

      let fullContent = '';
      const stream = await llm.stream(messages, {
        signal: abortSignal,
      });

      for await (const chunk of stream) {
        if (abortSignal?.aborted) {
          console.warn('[LLMQuery] 流式请求被中止', { ...logCtx, durationMs: Date.now() - startTime });
          onError({ code: 'ABORTED', message: 'Stream aborted by client' });
          return;
        }

        const delta = typeof chunk.content === 'string'
          ? chunk.content
          : JSON.stringify(chunk.content);

        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
      }

      const durationMs = Date.now() - startTime;
      console.info('[LLMQuery] 流式请求完成', {
        ...logCtx,
        durationMs,
        contentLength: fullContent.length,
      });

      onDone({ content: fullContent });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);

      if (abortSignal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        console.warn('[LLMQuery] 流式请求被中止', { ...logCtx, durationMs });
        onError({ code: 'ABORTED', message: 'Stream aborted' });
        return;
      }

      console.error('[LLMQuery] 流式请求异常', { ...logCtx, durationMs, error: errMsg });
      const safeMsg = errMsg
        .replace(/sk-[a-zA-Z0-9_-]{6,}/g, 'sk-***')
        .replace(/AIzaSy[a-zA-Z0-9_-]{20,}/g, 'AIza***')
        .replace(/xai-[a-zA-Z0-9_-]{6,}/g, 'xai-***')
        .replace(/(?:api[_-]?)?key[=:]\s*\S+/gi, 'key=***');
      onError({ code: 'API_ERROR', message: safeMsg });
    }
  }

  /**
   * 长文本分段流式处理：
   * 1. 提取 system prompt 和最后一条 user 消息中的长文本
   * 2. 对长文本生成一次结构摘要（用普通 query，短超时即可）
   * 3. 按段落边界切分，每段附带摘要上下文
   * 4. 串行流式处理每段，合并推送
   */
  private async queryStreamChunked(
    request: LLMQueryRequest,
    onChunk: (delta: string) => void,
    onDone: (result: { content: string; usage?: LLMQueryResponse['usage'] }) => void,
    onError: (error: { code: string; message: string }) => void,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const traceId = request.options?.traceId || `llm-chunked-${Date.now()}`;
    const source = request.options?.source || 'unknown';
    const logCtx = { traceId, source, operation: 'queryStreamChunked' };
    const startTime = Date.now();

    try {
      // 分离 system 消息和 user 消息
      const systemMsgs = request.messages.filter(m => m.role === 'system');
      const userMsgs = request.messages.filter(m => m.role === 'user');

      if (userMsgs.length === 0) {
        onError({ code: 'EMPTY_MESSAGES', message: 'No user messages found' });
        return;
      }

      // 最后一条 user 消息通常包含长文本
      const lastUserMsg = userMsgs[userMsgs.length - 1];
      const longText = lastUserMsg.content;
      // user 消息中除了长文本之外的前置指令部分（如果有多条 user 消息）
      const prefixUserMsgs = userMsgs.slice(0, -1);

      // Step 1: 生成结构摘要
      console.info('[LLMQuery] 分段处理 Step 1: 生成全文摘要', { ...logCtx, textLen: longText.length });

      // 截取前 3000 + 后 2000 字符用于摘要（避免摘要本身也超时）
      const summaryInput = longText.length > 6000
        ? longText.slice(0, 3000) + '\n\n...[中间省略]...\n\n' + longText.slice(-2000)
        : longText;

      const summaryResult = await this.query({
        messages: [
          ...systemMsgs,
          {
            role: 'user',
            content: `请用 200 字以内简要概括以下文本的整体结构、主要人物和核心情节线索，不要展开细节：\n\n${summaryInput}`,
          },
        ],
        config: request.config,
        options: { traceId: `${traceId}-summary`, source, operation: 'chunk-summary', timeoutMs: 60_000 },
      });

      if (abortSignal?.aborted) {
        onError({ code: 'ABORTED', message: 'Aborted during summary generation' });
        return;
      }

      const summary = summaryResult.content || '（摘要生成失败）';
      console.info('[LLMQuery] 全文摘要完成', { ...logCtx, summaryLen: summary.length });

      // Step 2: 切分长文本
      const textChunks = splitTextAtParagraphs(longText, CHUNK_TARGET_SIZE);
      console.info('[LLMQuery] 文本已切分', { ...logCtx, chunkCount: textChunks.length, sizes: textChunks.map(c => c.length) });

      // Step 3: 串行流式处理每段
      let fullContent = '';
      const chunkSeparator = '\n\n';

      for (let i = 0; i < textChunks.length; i++) {
        if (abortSignal?.aborted) {
          onError({ code: 'ABORTED', message: 'Aborted during chunked processing' });
          return;
        }

        const chunkContent = textChunks[i];
        const chunkLabel = `[第 ${i + 1}/${textChunks.length} 段]`;

        // 段间分隔：从第二段开始先推送换行
        if (i > 0) {
          fullContent += chunkSeparator;
          onChunk(chunkSeparator);
        }

        // 构造带上下文的请求消息
        const contextPrefix =
          `【全文结构摘要】\n${summary}\n\n` +
          `【当前处理进度】${chunkLabel}，共 ${textChunks.length} 段\n\n` +
          (i > 0 ? '请保持与前文一致的风格和术语，延续上文的处理。\n\n' : '');

        // 将原始 user 消息中的长文本替换为当前段
        const chunkUserContent = lastUserMsg.content.replace(longText, contextPrefix + chunkContent);

        const chunkMessages: LLMQueryRequest['messages'] = [
          ...systemMsgs,
          ...prefixUserMsgs,
          { role: 'user', content: chunkUserContent },
        ];

        console.info('[LLMQuery] 处理分段', { ...logCtx, chunk: i + 1, total: textChunks.length, chunkLen: chunkContent.length });

        // 用单次流式处理当前段
        await new Promise<void>((resolve, reject) => {
          this.queryStreamSingle(
            { ...request, messages: chunkMessages, options: { ...request.options, traceId: `${traceId}-chunk${i + 1}` } },
            (delta) => {
              fullContent += delta;
              onChunk(delta);
            },
            () => resolve(),
            (error) => reject(new Error(`${chunkLabel} ${error.message}`)),
            abortSignal,
          );
        });
      }

      const durationMs = Date.now() - startTime;
      console.info('[LLMQuery] 分段流式处理全部完成', {
        ...logCtx,
        durationMs,
        chunkCount: textChunks.length,
        contentLength: fullContent.length,
      });

      onDone({ content: fullContent });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);

      if (abortSignal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        onError({ code: 'ABORTED', message: 'Chunked stream aborted' });
        return;
      }

      console.error('[LLMQuery] 分段流式处理异常', { ...logCtx, durationMs, error: errMsg });
      const safeMsg = errMsg
        .replace(/sk-[a-zA-Z0-9_-]{6,}/g, 'sk-***')
        .replace(/AIzaSy[a-zA-Z0-9_-]{20,}/g, 'AIza***')
        .replace(/xai-[a-zA-Z0-9_-]{6,}/g, 'xai-***')
        .replace(/(?:api[_-]?)?key[=:]\s*\S+/gi, 'key=***');
      onError({ code: 'API_ERROR', message: safeMsg });
    }
  }
}

export const llmQueryService = new LLMQueryService();
