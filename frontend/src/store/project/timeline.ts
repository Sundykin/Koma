/**
 * 时间线管理
 */
import { electronService } from '../../services/electronService';
import type { TimelineData } from '../../types/editor';
import { getProjectPath } from './core';
import { remapTimelineClipSourcesToLocal } from './mediaUrlRemap';
import { migrateTimelineData, prepareTimelineForSave } from '../../features/transition/core';

function shouldRethrowTimelineError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Unsupported timeline version:');
}

export async function loadTimeline(projectId: string): Promise<TimelineData | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  try {
    const projectPath = await getProjectPath(projectId);
    const exists = await electronService.fs.exists(`${projectPath}/timeline.json`);
    if (!exists) return null;
    const data = await electronService.fs.readFile(`${projectPath}/timeline.json`);
    return migrateTimelineData(JSON.parse(data));
  } catch (error) {
    if (shouldRethrowTimelineError(error)) {
      throw error;
    }
    return null;
  }
}

export async function saveTimeline(
  projectId: string,
  timeline: TimelineData
): Promise<void> {
  if (!electronService.isElectron()) {
    return;
  }

  const projectPath = await getProjectPath(projectId);
  const normalizedTimeline = prepareTimelineForSave(timeline);
  // Persist timeline with local media sources when possible (avoid CORS in Electron).
  const { timeline: remapped } = await remapTimelineClipSourcesToLocal(projectPath, normalizedTimeline as any);
  await electronService.fs.writeFile(
    `${projectPath}/timeline.json`,
    JSON.stringify(remapped || normalizedTimeline, null, 2)
  );
}
