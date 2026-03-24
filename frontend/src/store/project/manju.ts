/**
 * Manju-DSL 集成
 */
import { electronService, type ProjectMeta as ElectronProjectMeta } from '../../services/electronService';
import type { ProjectMeta, Character, Scene, Shot } from '../../types';
import type { TimelineData } from '../../types/editor';
import {
  exportToManjuDSL,
  importFromManjuDSL,
  validateManjuProject,
  type ManjuProject,
} from '../../manju-dsl/protocol';
import { addRecentProject } from '../globalStore';
import { loadProject, getProjectPath } from './core';
import { loadTimeline } from './timeline';

function warnDroppedTimelineBoundary() {
  console.warn('[manju] Timeline round-trip is not supported for TimelineData-based transition projects yet. Timeline payload will be omitted.');
}

export function saveProjectAsManju(
  project: ProjectMeta,
  characters: Character[],
  scenes: Scene[],
  shots: Shot[],
  timeline?: TimelineData
): ManjuProject {
  if (timeline) {
    warnDroppedTimelineBoundary();
  }
  return exportToManjuDSL(project, characters, scenes, shots);
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

  const project = await loadProject(projectId);
  if (!project) throw new Error('项目不存在');

  const timeline = await loadTimeline(projectId);
  if (timeline) {
    warnDroppedTimelineBoundary();
  }
  const manjuData = exportToManjuDSL(project, characters, scenes, shots);

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
  let projectId = imported.project.id;
  const originalProjectPath = await getProjectPath(projectId);
  const exists = await electronService.fs.exists(originalProjectPath);
  if (exists) {
    projectId = `${projectId}_imported_${Date.now()}`;
    imported.project.id = projectId;
  }

  await electronService.project.create({
    id: projectId,
    title: imported.project.title,
    genre: imported.project.genre,
    mode: imported.project.mode,
    createdAt: imported.project.createdAt,
    updatedAt: imported.project.updatedAt,
  } satisfies ElectronProjectMeta);

  const projectPath = await getProjectPath(projectId);

  await electronService.fs.writeFile(
    `${projectPath}/meta.json`,
    JSON.stringify(imported.project, null, 2)
  );
  await electronService.fs.writeFile(
    `${projectPath}/project.json`,
    JSON.stringify(imported.project, null, 2)
  );

  if (imported.timeline) {
    warnDroppedTimelineBoundary();
  }

  await electronService.fs.writeFile(
    `${projectPath}/characters.json`,
    JSON.stringify(imported.characters, null, 2)
  );
  await electronService.fs.writeFile(
    `${projectPath}/scenes.json`,
    JSON.stringify(imported.scenes, null, 2)
  );
  await electronService.fs.writeFile(
    `${projectPath}/shots.json`,
    JSON.stringify(imported.shots, null, 2)
  );
  await electronService.project.rebuildIndex();

  await addRecentProject({
    id: projectId,
    title: imported.project.title,
    path: projectPath,
    lastOpened: Date.now(),
  });

  return imported.project;
}
