/**
 * 时间线管理
 */
import { electronService } from '../../services/electronService';
import type { Timeline } from '../../types';
import { getProjectPath } from './core';

export async function loadTimeline(projectId: string): Promise<Timeline | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  try {
    const projectPath = await getProjectPath(projectId);
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
  await electronService.fs.writeFile(
    `${projectPath}/timeline.json`,
    JSON.stringify(timeline, null, 2)
  );
}
