/**
 * 角色/场景/道具加载和保存
 */
import { electronService } from '../../services/electronService';
import type { Character, Scene, Shot, Prop } from '../../types';
import { getProjectPath } from './core';

export async function loadCharacters(projectId: string): Promise<Character[]> {
  if (!electronService.isElectron()) return [];
  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(`${projectPath}/characters.json`);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveCharacters(projectId: string, characters: Character[]): Promise<void> {
  if (!electronService.isElectron()) return;
  const projectPath = await getProjectPath(projectId);
  await electronService.fs.writeFile(
    `${projectPath}/characters.json`,
    JSON.stringify(characters, null, 2)
  );
}

export async function loadScenes(projectId: string): Promise<Scene[]> {
  if (!electronService.isElectron()) return [];
  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(`${projectPath}/scenes.json`);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveScenes(projectId: string, scenes: Scene[]): Promise<void> {
  if (!electronService.isElectron()) return;
  const projectPath = await getProjectPath(projectId);
  await electronService.fs.writeFile(
    `${projectPath}/scenes.json`,
    JSON.stringify(scenes, null, 2)
  );
}

export async function loadShots(projectId: string): Promise<Shot[]> {
  if (!electronService.isElectron()) return [];
  try {
    const projectPath = await getProjectPath(projectId);
    const filePath = `${projectPath}/shots.json`;
    const exists = await electronService.fs.exists(filePath);
    if (!exists) return [];
    const data = await electronService.fs.readFile(filePath);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveShots(projectId: string, shots: Shot[]): Promise<void> {
  if (!electronService.isElectron()) return;
  const projectPath = await getProjectPath(projectId);
  await electronService.fs.writeFile(
    `${projectPath}/shots.json`,
    JSON.stringify(shots, null, 2)
  );
}
