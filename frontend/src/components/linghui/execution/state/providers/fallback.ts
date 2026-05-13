import type { AppSettings } from '../../../../../types';
import { listCapabilityFallbackCandidates } from '../../../../../providers/channel/resolver';
import { getRegistry } from '../../../../../providers/registry';
import { isLinghuiExecutionCancelledError, throwIfExecutionAborted } from '../linghuiExecutionShared';
import { getExecutionErrorMessage } from './shared';

const MAX_PROVIDER_FALLBACK_ATTEMPTS = 3;

// 视频「单 provider + 重试」专用：同一渠道最多重试 N 次，每次间隔指数退避。
// 视频生成 4-15s 计费，重试代价高，给 2 次重试已经覆盖瞬时网络抖动。
const SINGLE_PROVIDER_RETRY_MAX = 2;
const SINGLE_PROVIDER_RETRY_BASE_MS = 1500;

/**
 * 按 preferred provider 的 fallbackPolicy 过滤候选清单。
 *
 *  - 'lock-to-selection'：只保留首位（用户原选），失败就抛错
 *  - 'lock-to-provider-type'：保留与 preferred 同 providerType 的候选
 *  - 'cross-provider'（缺省）：保留全部
 */
function applyFallbackPolicy<C extends { providerType: string }>(
  candidates: ReadonlyArray<C>,
  category: 'tti' | 'itv',
): C[] {
  if (candidates.length === 0) return [];
  const preferred = candidates[0];
  const def = getRegistry(category).get(preferred.providerType);
  const policy = def?.fallbackPolicy ?? 'cross-provider';

  if (policy === 'lock-to-selection') {
    return [preferred];
  }
  if (policy === 'lock-to-provider-type') {
    return candidates.filter(c => c.providerType === preferred.providerType);
  }
  return [...candidates];
}

export type LinghuiProviderFallbackCandidate = ReturnType<typeof listCapabilityFallbackCandidates>[number];

export interface LinghuiProviderAttemptSummary {
  selectionKey: string;
  channelId: string;
  modelId: string;
  channelLabel: string;
  modelLabel: string;
  providerType: string;
  outcome: 'succeeded' | 'failed';
  error?: string;
}

export interface CompletedFallbackExecution<T> {
  result: T;
  attempts: LinghuiProviderAttemptSummary[];
  finalCandidate: LinghuiProviderFallbackCandidate;
}

function cloneFallbackAttempt(
  candidate: LinghuiProviderFallbackCandidate,
): Omit<LinghuiProviderAttemptSummary, 'outcome' | 'error'> {
  return {
    selectionKey: candidate.selectionKey,
    channelId: candidate.channelId,
    modelId: candidate.modelId,
    channelLabel: candidate.channelLabel,
    modelLabel: candidate.modelLabel,
    providerType: candidate.providerType,
  };
}

export function summarizeProviderFallbackMetadata(
  category: 'tti' | 'itv',
  capability: string,
  attempts: LinghuiProviderAttemptSummary[],
  finalCandidate: LinghuiProviderFallbackCandidate,
): Record<string, unknown> {
  return {
    category,
    capability,
    finalSelectionKey: finalCandidate.selectionKey,
    finalProviderType: finalCandidate.providerType,
    finalLabel: `${finalCandidate.channelLabel} / ${finalCandidate.modelLabel}`,
    usedFallback: attempts.some(item => item.outcome === 'failed'),
    attempts: attempts.map(item => ({
      selectionKey: item.selectionKey,
      channelId: item.channelId,
      modelId: item.modelId,
      channelLabel: item.channelLabel,
      modelLabel: item.modelLabel,
      providerType: item.providerType,
      outcome: item.outcome,
      error: item.error,
    })),
  };
}

export function withProviderFallbackMetadata<T extends { metadata?: Record<string, unknown> }>(
  item: T,
  providerFallback: Record<string, unknown>,
): T {
  return {
    ...item,
    metadata: {
      ...(item.metadata ?? {}),
      providerFallback,
    },
  };
}

function buildProviderFallbackError(
  mediaLabel: string,
  attempts: LinghuiProviderAttemptSummary[],
  lastError?: unknown,
): Error {
  const summary = attempts.map(item => {
    const base = `${item.channelLabel} / ${item.modelLabel}`;
    return item.error ? `${base}（${item.error}）` : base;
  }).join('；');
  const lastMessage = lastError ? getExecutionErrorMessage(lastError) : '未知错误';
  return new Error(`${mediaLabel}执行失败，已尝试 ${attempts.length} 个 Provider：${summary}。最后错误：${lastMessage}`);
}

export async function executeWithProviderFallback<TProvider, TResult>(params: {
  mediaLabel: string;
  category: 'tti' | 'itv';
  capability: string;
  settings: AppSettings;
  preferredSelection?: string;
  signal?: AbortSignal;
  loadProvider: (selectionKey: string) => Promise<TProvider | null>;
  validateProvider: (provider: TProvider) => boolean;
  execute: (provider: TProvider, candidate: LinghuiProviderFallbackCandidate) => Promise<TResult>;
}): Promise<CompletedFallbackExecution<TResult>> {
  const allCandidates = listCapabilityFallbackCandidates(
    params.settings,
    params.category,
    params.capability as never,
    params.preferredSelection,
  );
  const policyFiltered = applyFallbackPolicy(allCandidates, params.category);
  const candidates = policyFiltered.slice(0, MAX_PROVIDER_FALLBACK_ATTEMPTS);

  const attempts: LinghuiProviderAttemptSummary[] = [];
  let lastError: unknown;

  for (const candidate of candidates) {
    throwIfExecutionAborted(params.signal);
    const baseAttempt = cloneFallbackAttempt(candidate);

    let provider: TProvider | null;
    try {
      provider = await params.loadProvider(candidate.selectionKey);
    } catch (error) {
      if (isLinghuiExecutionCancelledError(error)) {
        throw error;
      }
      lastError = error;
      attempts.push({
        ...baseAttempt,
        outcome: 'failed',
        error: getExecutionErrorMessage(error),
      });
      continue;
    }

    if (!provider) {
      const error = new Error('当前 Provider 不可用');
      lastError = error;
      attempts.push({
        ...baseAttempt,
        outcome: 'failed',
        error: error.message,
      });
      continue;
    }

    let isValid = false;
    try {
      isValid = params.validateProvider(provider);
    } catch (error) {
      if (isLinghuiExecutionCancelledError(error)) {
        throw error;
      }
      lastError = error;
      attempts.push({
        ...baseAttempt,
        outcome: 'failed',
        error: getExecutionErrorMessage(error),
      });
      continue;
    }

    if (!isValid) {
      const error = new Error('当前 Provider 校验失败');
      lastError = error;
      attempts.push({
        ...baseAttempt,
        outcome: 'failed',
        error: error.message,
      });
      continue;
    }

    try {
      const result = await params.execute(provider, candidate);
      attempts.push({
        ...baseAttempt,
        outcome: 'succeeded',
      });
      return {
        result,
        attempts,
        finalCandidate: candidate,
      };
    } catch (error) {
      if (isLinghuiExecutionCancelledError(error)) {
        throw error;
      }
      lastError = error;
      attempts.push({
        ...baseAttempt,
        outcome: 'failed',
        error: getExecutionErrorMessage(error),
      });
    }
  }

  throw buildProviderFallbackError(params.mediaLabel, attempts, lastError);
}

/**
 * 单 provider + 重试执行：用户选了哪个渠道就只用哪个，**不跨渠道降级**。
 * 同一 provider 上瞬时错误（网络抖动 / 5xx）允许重试，达到 maxRetries 仍失败则抛错。
 *
 * 设计动机：视频渠道严禁静默降级 —— 用户配置了「我要 Koma 即梦」，失败就报 Koma 即梦
 * 的错，让用户决定换不换；而不是悄悄回退到 Grok 之类的另一个渠道，让账单和效果都出乎
 * 意料。重试仅在同 provider 内部消化瞬时抖动。
 */
export async function executeSingleProviderWithRetry<TProvider, TResult>(params: {
  mediaLabel: string;
  category: 'tti' | 'itv';
  capability: string;
  settings: AppSettings;
  preferredSelection?: string;
  signal?: AbortSignal;
  loadProvider: (selectionKey: string) => Promise<TProvider | null>;
  validateProvider: (provider: TProvider) => boolean;
  execute: (provider: TProvider, candidate: LinghuiProviderFallbackCandidate) => Promise<TResult>;
  maxRetries?: number;
}): Promise<CompletedFallbackExecution<TResult>> {
  const allCandidates = listCapabilityFallbackCandidates(
    params.settings,
    params.category,
    params.capability as never,
    params.preferredSelection,
  );
  if (allCandidates.length === 0) {
    throw new Error(`${params.mediaLabel}未配置 Provider`);
  }
  // 强制只用第一个（用户优先选择，或全局默认）；不再过滤剩余候选。
  const candidate = allCandidates[0];
  const baseAttempt = cloneFallbackAttempt(candidate);
  const attempts: LinghuiProviderAttemptSummary[] = [];
  const maxRetries = params.maxRetries ?? SINGLE_PROVIDER_RETRY_MAX;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    throwIfExecutionAborted(params.signal);

    let provider: TProvider | null;
    try {
      provider = await params.loadProvider(candidate.selectionKey);
    } catch (error) {
      if (isLinghuiExecutionCancelledError(error)) throw error;
      lastError = error;
      attempts.push({ ...baseAttempt, outcome: 'failed', error: getExecutionErrorMessage(error) });
      if (attempt >= maxRetries) break;
      await waitForRetry(attempt, params.signal);
      continue;
    }
    if (!provider) {
      const error = new Error('当前 Provider 不可用');
      lastError = error;
      attempts.push({ ...baseAttempt, outcome: 'failed', error: error.message });
      // provider 加载失败属于配置问题，重试也不会变好 —— 直接结束
      break;
    }
    if (!params.validateProvider(provider)) {
      const error = new Error('当前 Provider 校验失败');
      lastError = error;
      attempts.push({ ...baseAttempt, outcome: 'failed', error: error.message });
      // 校验失败同样属于配置问题，不再重试
      break;
    }

    try {
      const result = await params.execute(provider, candidate);
      attempts.push({ ...baseAttempt, outcome: 'succeeded' });
      return { result, attempts, finalCandidate: candidate };
    } catch (error) {
      if (isLinghuiExecutionCancelledError(error)) throw error;
      lastError = error;
      attempts.push({ ...baseAttempt, outcome: 'failed', error: getExecutionErrorMessage(error) });
      if (attempt >= maxRetries) break;
      await waitForRetry(attempt, params.signal);
    }
  }

  // 不调 buildProviderFallbackError —— 这条路径没"切换 Provider"，只有同一 provider 重试。
  // 用最后一条错误信息抛出（保留重试历史在 attempts，metadata 会带出去）。
  const lastMessage = lastError ? getExecutionErrorMessage(lastError) : '未知错误';
  const retryNote = attempts.length > 1 ? `（已重试 ${attempts.length - 1} 次）` : '';
  throw new Error(`${params.mediaLabel}执行失败${retryNote}：${lastMessage}`);
}

async function waitForRetry(attempt: number, signal?: AbortSignal): Promise<void> {
  const delay = SINGLE_PROVIDER_RETRY_BASE_MS * Math.pow(2, attempt);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('执行已取消'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  throwIfExecutionAborted(signal);
}
