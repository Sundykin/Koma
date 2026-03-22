/**
 * 时间线管理
 */
import { electronService } from '../../services/electronService';
import type { Timeline } from '../../types';
import { getProjectPath } from './core';
import { remapTimelineClipSourcesToLocal } from './mediaUrlRemap';

export async function loadTimeline(projectId: string): Promise<Timeline | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  try {
    const projectPath = await getProjectPath(projectId);
    const exists = await electronService.fs.exists(`${projectPath}/timeline.json`);
    if (!exists) return null;
    const data = await electronService.fs.readFile(`${projectPath}/timeline.json`);
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveTimeline(
  projectId: string,
  timeline: Timeline
): Promise<void> {
  if (!electronService.isElectron()) {
    return;
  }

  const projectPath = await getProjectPath(projectId);
  // Persist timeline with local media sources when possible (avoid CORS in Electron).
  const { timeline: remapped } = await remapTimelineClipSourcesToLocal(projectPath, timeline as any);
  await electronService.fs.writeFile(
    `${projectPath}/timeline.json`,
    JSON.stringify(remapped || timeline, null, 2)
  );
}
