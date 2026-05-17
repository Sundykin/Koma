import type { LinghuiExecutionLogEntry } from '../../../../types/linghui';

export function createLinghuiPageExecutionLog(
  level: LinghuiExecutionLogEntry['level'],
  message: string,
  nodeId?: string,
): LinghuiExecutionLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    message,
    nodeId,
    createdAt: Date.now(),
  };
}

export function mergeLinghuiPageExecutionLogs(
  currentLogs: LinghuiExecutionLogEntry[],
  entry: LinghuiExecutionLogEntry,
): LinghuiExecutionLogEntry[] {
  return [...currentLogs, entry].slice(-80);
}
