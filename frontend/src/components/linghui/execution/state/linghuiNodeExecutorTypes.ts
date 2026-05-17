import type { LinghuiNodeResult } from '../../../../types/linghui';

export type NodeExecutionProgressHandler = (
  progress: number,
  message?: string,
  partialResult?: LinghuiNodeResult,
) => void;

export function resolveStreamingProgress(accumulated: string, base = 18, cap = 92): number {
  return Math.max(base, Math.min(cap, base + Math.floor(accumulated.trim().length / 48)));
}
