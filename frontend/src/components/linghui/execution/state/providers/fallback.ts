import type { AppSettings } from '../../../../../types';
import { listCapabilityFallbackCandidates } from '../../../../../providers/channel/resolver';
import { isLinghuiExecutionCancelledError, throwIfExecutionAborted } from '../linghuiExecutionShared';
import { getExecutionErrorMessage } from './shared';

const MAX_PROVIDER_FALLBACK_ATTEMPTS = 3;

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
  const candidates = listCapabilityFallbackCandidates(
    params.settings,
    params.category,
    params.capability as never,
    params.preferredSelection,
  ).slice(0, MAX_PROVIDER_FALLBACK_ATTEMPTS);

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
