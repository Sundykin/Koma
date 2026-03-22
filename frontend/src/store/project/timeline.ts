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
    const parsed = JSON.parse(data);
    const { timeline, changed } = await remapTimelineClipSourcesToLocal(projectPath, parsed);
    if (changed && timeline) {
      // Best-effort migration so future loads don't hit CORS again.
      electronService.fs.writeFile(`${projectPath}/timeline.json`, JSON.stringify(timeline, null, 2)).catch(() => {});
    }
    return timeline as any;
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
