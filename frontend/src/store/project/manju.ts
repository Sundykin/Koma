/**
 * Manju-DSL 集成
 */
import { electronService } from '../../services/electronService';
import type { ProjectMeta, Character, Scene, Shot, Timeline } from '../../types';
import {
  exportToManjuDSL,
  importFromManjuDSL,
  validateManjuProject,
  type ManjuProject,
} from '../../manju-dsl/protocol';
import { getProjectPath } from './core';
import { addRecentProject } from '../globalStore';
import { persistenceClient } from '../../utils/ipcRenderer';

export function saveProjectAsManju(
  project: ProjectMeta,
  characters: Character[],
  scenes: Scene[],
  shots: Shot[],
  timeline?: Timeline
): ManjuProject {
  return exportToManjuDSL(project, characters, scenes, shots, timeline);
}

export function loadProjectFromManju(manjuData: ManjuProject) {
  if (!validateManjuProject(manjuData)) {
    throw new Error('无效的 Manju-DSL 数据格式');
  }
  return importFromManjuDSL(manjuData);
}

export async function exportProjectToManjuFile(
  projectId: string,
  characters: Character[],
  scenes: Scene[],
  shots: Shot[]
): Promise<string | null> {
  if (!electronService.isElectron()) return null;

  const { loadProject } = await import('./core');
  const { loadTimeline } = await import('./timeline');

  const project = await loadProject(projectId);
  if (!project) throw new Error('项目不存在');

  const timeline = await loadTimeline(projectId);
  const manjuData = exportToManjuDSL(project, characters, scenes, shots, timeline || undefined);

  const projectPath = await getProjectPath(projectId);
  const exportPath = `${projectPath}/exports/${project.title}.manju.json`;
  await electronService.fs.writeFile(exportPath, JSON.stringify(manjuData, null, 2));

  return exportPath;
}

export async function importProjectFromManjuFile(filePath: string): Promise<ProjectMeta | null> {
  if (!electronService.isElectron()) return null;

  const content = await electronService.fs.readFile(filePath);
  const manjuData = JSON.parse(content);

  if (!validateManjuProject(manjuData)) {
    throw new Error('无效的 Manju-DSL 文件');
  }

  const imported = importFromManjuDSL(manjuData);

  const projectId = imported.project.id;
  const projectPath = await getProjectPath(projectId);

  await electronService.fs.mkdir(projectPath);
  await electronService.fs.mkdir(`${projectPath}/assets/images`);
  await electronService.fs.mkdir(`${projectPath}/assets/videos`);
  await electronService.fs.mkdir(`${projectPath}/assets/audio`);
  await electronService.fs.mkdir(`${projectPath}/assets/fonts`);
  await electronService.fs.mkdir(`${projectPath}/shots`);
  await electronService.fs.mkdir(`${projectPath}/cache/thumbnails`);
  await electronService.fs.mkdir(`${projectPath}/cache/waveforms`);
  await electronService.fs.mkdir(`${projectPath}/cache/previews`);
  await electronService.fs.mkdir(`${projectPath}/exports`);
  await electronService.fs.mkdir(`${projectPath}/temp`);

  await persistenceClient.save(projectId, 'project', imported.project);

  if (imported.timeline) {
    await persistenceClient.save(projectId, 'timeline', imported.timeline);
  }

  await persistenceClient.save(projectId, 'character', imported.characters);
  await persistenceClient.save(projectId, 'scene', imported.scenes);
  await persistenceClient.save(projectId, 'shot', imported.shots);

  await addRecentProject({
    id: projectId,
    title: imported.project.title,
    path: projectPath,
    lastOpened: Date.now(),
  });

  return imported.project;
}
