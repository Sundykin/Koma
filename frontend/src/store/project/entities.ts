/**
 * 角色/场景/道具/分镜 加载和保存
 */
import { electronService } from '../../services/electronService';
import type { Character, Scene, Shot } from '../../types';
import { getProjectPath } from './core';
import {
  normalizeCharactersMediaState,
  normalizeScenesMediaState,
  normalizeShotsMediaState,
} from './mediaState';

export async function loadCharacters(projectId: string): Promise<Character[]> {
  if (!electronService.isElectron()) return [];
  try {
    const projectPath = await getProjectPath(projectId);
    const exists = await electronService.fs.exists(`${projectPath}/characters.json`);
    if (!exists) return [];
    const data = await electronService.fs.readFile(`${projectPath}/characters.json`);
    const raw = JSON.parse(data);
    return Array.isArray(raw) ? normalizeCharactersMediaState(raw.filter(Boolean)) : [];
  } catch {
    return [];
  }
}

export async function saveCharacters(projectId: string, characters: Character[]): Promise<void> {
  if (!electronService.isElectron()) return;
  const projectPath = await getProjectPath(projectId);
  await electronService.fs.writeFile(
    `${projectPath}/characters.json`,
    JSON.stringify(normalizeCharactersMediaState(characters), null, 2)
  );
}

export async function loadScenes(projectId: string): Promise<Scene[]> {
  if (!electronService.isElectron()) return [];
  try {
    const projectPath = await getProjectPath(projectId);
    const exists = await electronService.fs.exists(`${projectPath}/scenes.json`);
    if (!exists) return [];
    const data = await electronService.fs.readFile(`${projectPath}/scenes.json`);
    const raw = JSON.parse(data);
    return Array.isArray(raw) ? normalizeScenesMediaState(raw.filter(Boolean)) : [];
  } catch {
    return [];
  }
}

export async function saveScenes(projectId: string, scenes: Scene[]): Promise<void> {
  if (!electronService.isElectron()) return;
  const projectPath = await getProjectPath(projectId);
  await electronService.fs.writeFile(
    `${projectPath}/scenes.json`,
    JSON.stringify(normalizeScenesMediaState(scenes), null, 2)
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
    const raw = JSON.parse(data);
    return Array.isArray(raw) ? normalizeShotsMediaState(raw.filter(Boolean)) : [];
  } catch {
    return [];
  }
}

export async function saveShots(projectId: string, shots: Shot[]): Promise<void> {
  if (!electronService.isElectron()) return;
  const projectPath = await getProjectPath(projectId);
  await electronService.fs.writeFile(
    `${projectPath}/shots.json`,
    JSON.stringify(normalizeShotsMediaState(shots), null, 2)
  );
}
