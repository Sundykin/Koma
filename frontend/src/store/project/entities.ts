/**
 * 角色/场景/道具/分镜 加载和保存
 */
import type { Character, Scene, Shot } from '../../types';
import { persistenceClient } from '../../utils/ipcRenderer';

export async function loadCharacters(projectId: string): Promise<Character[]> {
  try {
    const characters = await persistenceClient.list<Character>(projectId, 'character');
    return Array.isArray(characters) ? characters : [];
  } catch {
    return [];
  }
}

export async function saveCharacters(projectId: string, characters: Character[]): Promise<void> {
  await persistenceClient.save(projectId, 'character', characters);
}

export async function loadScenes(projectId: string): Promise<Scene[]> {
  try {
    const scenes = await persistenceClient.list<Scene>(projectId, 'scene');
    return Array.isArray(scenes) ? scenes : [];
  } catch {
    return [];
  }
}

export async function saveScenes(projectId: string, scenes: Scene[]): Promise<void> {
  await persistenceClient.save(projectId, 'scene', scenes);
}

export async function loadShots(projectId: string): Promise<Shot[]> {
  try {
    const shots = await persistenceClient.list<Shot>(projectId, 'shot');
    return Array.isArray(shots) ? shots : [];
  } catch {
    return [];
  }
}

export async function saveShots(projectId: string, shots: Shot[]): Promise<void> {
  await persistenceClient.save(projectId, 'shot', shots);
}
