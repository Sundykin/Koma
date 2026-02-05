/**
 * 角色/场景/道具/分镜 加载和保存
 */
import { electronService } from '../../services/electronService';
import type { Character, Scene, Shot } from '../../types';
import { getProjectPath } from './core';

// 迁移辅助函数：将旧字段合并到 prompt
function migrateCharacterToPrompt(char: Character): Character {
  if (char.prompt?.trim()) return char;
  const parts: string[] = [];
  if (char.age) parts.push(`Age: ${char.age}`);
  if (char.appearance) parts.push(char.appearance);
  if (char.description) parts.push(char.description);
  if (char.customPrompt) parts.push(char.customPrompt);
  return { ...char, prompt: parts.join('\n') || '' };
}

function migrateSceneToPrompt(scene: Scene): Scene {
  if (scene.prompt?.trim()) return scene;
  const parts: string[] = [];
  if (scene.location) parts.push(`Location: ${scene.location}`);
  if (scene.time) parts.push(`Time: ${scene.time}`);
  if (scene.mood) parts.push(`Mood: ${scene.mood}`);
  if (scene.description) parts.push(scene.description);
  if (scene.customPrompt) parts.push(scene.customPrompt);
  return { ...scene, prompt: parts.join('\n') || '' };
}

export async function loadCharacters(projectId: string): Promise<Character[]> {
  if (!electronService.isElectron()) return [];
  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(`${projectPath}/characters.json`);
    const raw = JSON.parse(data);
    const characters = Array.isArray(raw) ? raw : [];

    // 自动迁移：检查是否有需要迁移的数据
    let needsSave = false;
    const migrated = characters.map((char: Character) => {
      if (!char.prompt?.trim() && (char.age || char.appearance || char.description || char.customPrompt)) {
        needsSave = true;
        return migrateCharacterToPrompt(char);
      }
      return char;
    });

    // 如果有迁移，自动保存
    if (needsSave) {
      await electronService.fs.writeFile(
        `${projectPath}/characters.json`,
        JSON.stringify(migrated, null, 2)
      );
    }

    return migrated;
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
    const raw = JSON.parse(data);
    const scenes = Array.isArray(raw) ? raw : [];

    // 自动迁移
    let needsSave = false;
    const migrated = scenes.map((scene: Scene) => {
      if (!scene.prompt?.trim() && (scene.location || scene.time || scene.mood || scene.description || scene.customPrompt)) {
        needsSave = true;
        return migrateSceneToPrompt(scene);
      }
      return scene;
    });

    if (needsSave) {
      await electronService.fs.writeFile(
        `${projectPath}/scenes.json`,
        JSON.stringify(migrated, null, 2)
      );
    }

    return migrated;
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
    const raw = JSON.parse(data);
    return Array.isArray(raw) ? raw : [];
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
