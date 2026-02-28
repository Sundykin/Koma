/**
 * 时间线管理
 */
import type { Timeline } from '../../types';
import { persistenceClient } from '../../utils/ipcRenderer';

export async function loadTimeline(projectId: string): Promise<Timeline | null> {
  try {
    const timeline = await persistenceClient.findById<Timeline>(projectId, 'timeline', projectId);
    return timeline || null;
  } catch {
    return null;
  }
}

export async function saveTimeline(
  projectId: string,
  timeline: Timeline
): Promise<void> {
  await persistenceClient.save(projectId, 'timeline', timeline);
}
