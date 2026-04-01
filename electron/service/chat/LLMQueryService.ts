/**
 * LLM 无状态查询服务
 * 借鉴 Claude Code QueryEngine 模式，提供不依赖 Session 的轻量 LLM 调用
 * 供 workflow 服务（分镜生成、实体提取、剧本分析等）通过 IPC 调用
 *
 * 注意：llm:query 是请求-响应模式，不支持 streaming。
 * 每次调用独立，无会话状态，适合单次分析任务。
 */
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { createLLM } from './AgentGraph';
import type { SessionConfig } from './types';

export interface LLMQueryRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  config: {
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

const DEFAULT_TIMEOUT_MS = 60_000;

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

    if (request.config.baseUrl && isPrivateHost(request.config.baseUrl)) {
      console.warn('[LLMQuery] 拒绝私有地址', { ...logCtx, baseUrl: request.config.baseUrl });
      return {
        content: '',
        error: { code: 'API_ERROR', message: 'baseUrl points to a private/internal address' },
      };
    }

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
        const sessionConfig: SessionConfig = {
          modelProvider: request.config.modelProvider,
          modelName: request.config.modelName,
          apiKey: request.config.apiKey,
          baseUrl: request.config.baseUrl,
          temperature: request.config.temperature,
          maxTokens: request.config.maxTokens,
        };

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
          // 超时：重试一次
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.warn('[LLMQuery] 请求超时，准备重试', { ...logCtx, durationMs, timeoutMs, retryCount });
            continue;
          }
          console.error('[LLMQuery] 请求超时（已达重试上限）', { ...logCtx, durationMs, timeoutMs });
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
}

export const llmQueryService = new LLMQueryService();
