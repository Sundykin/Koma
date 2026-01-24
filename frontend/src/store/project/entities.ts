/**
 * 角色/场景/道具加载和保存
 * 包含数据规范化，确保旧数据兼容
 */
import { electronService } from '../../services/electronService';
import type { Character, Scene, Shot, Prop } from '../../types';
import { getProjectPath } from './core';

// 数据规范化：确保必填字段存在，可选字段保持原样
function normalizeCharacter(char: any): Character {
  return {
    id: char.id,
    name: char.name || '未命名角色',
    role: char.role || 'supporting',
    // 可选字段直接保留
    age: char.age,
    description: char.description,
    appearance: char.appearance,
    voiceId: char.voiceId,
    costumePhotoPath: char.costumePhotoPath,
    costumePhotoUrl: char.costumePhotoUrl,
    previewVideoPath: char.previewVideoPath,
    previewVideoTaskId: char.previewVideoTaskId,
    sora2CharacterId: char.sora2CharacterId,
    customPrompt: char.customPrompt,
    timestampRange: char.timestampRange,
    episodeRefs: char.episodeRefs,
    fingerprint: char.fingerprint,
  };
}

function normalizeScene(scene: any): Scene {
  return {
    id: scene.id,
    name: scene.name || '未命名场景',
    location: scene.location,
    time: scene.time,
    mood: scene.mood,
    description: scene.description,
    imagePath: scene.imagePath,
    imageUrl: scene.imageUrl,
    customPrompt: scene.customPrompt,
    episodeRefs: scene.episodeRefs,
    fingerprint: scene.fingerprint,
  };
}

function normalizeShot(shot: any): Shot {
  return {
    id: shot.id,
    scriptContent: shot.scriptContent || '',
    shotType: shot.shotType || 'medium',
    cameraMovement: shot.cameraMovement || 'static',
    duration: shot.duration || 3,
    // 双提示词字段
    description: shot.description,
    imagePrompt: shot.imagePrompt,
    videoPrompt: shot.videoPrompt,
    // 图片相关
    imageUrl: shot.imageUrl,
    imagePath: shot.imagePath,
    imagePaths: shot.imagePaths,
    currentImageIndex: shot.currentImageIndex,
    // 关联资产
    characters: shot.characters || [],
    scenes: shot.scenes,
    dialogue: shot.dialogue,
    emotion: shot.emotion,
    props: shot.props,
    confirmed: shot.confirmed,
    seed: shot.seed,
    currentVersion: shot.currentVersion,
    videos: shot.videos,
    currentVideoIndex: shot.currentVideoIndex,
    selectedVideoIndex: shot.selectedVideoIndex,
  };
}

export async function loadCharacters(projectId: string): Promise<Character[]> {
  if (!electronService.isElectron()) return [];
  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(`${projectPath}/characters.json`);
    const raw = JSON.parse(data);
    return Array.isArray(raw) ? raw.map(normalizeCharacter) : [];
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
    return Array.isArray(raw) ? raw.map(normalizeScene) : [];
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
    return Array.isArray(raw) ? raw.map(normalizeShot) : [];
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
