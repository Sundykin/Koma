/**
 * 资产引用管理
 */
import type { EpisodeRef, Character, Scene, Prop } from '../../types';
import { loadCharacters, saveCharacters } from './entities';
import { loadScenes, saveScenes } from './entities';
import { loadProps, saveProps } from './assetStorage';

export function calculateAssetFingerprint(asset: { name: string; description?: string; type?: string }): string {
  const normalizeText = (text: string): string => {
    return text.toLowerCase().replace(/[\s\W_]/g, '').trim();
  };

  const features = [
    normalizeText(asset.name),
    asset.description ? normalizeText(asset.description) : '',
    asset.type || ''
  ].filter(Boolean);

  let hash = 0;
  const str = features.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

export async function addCharacterEpisodeRef(
  projectId: string,
  characterId: string,
  episodeRef: EpisodeRef
): Promise<void> {
  const characters = await loadCharacters(projectId);
  const character = characters.find(c => c.id === characterId);
  if (!character) return;

  if (!character.episodeRefs) {
    character.episodeRefs = [];
  }

  const exists = character.episodeRefs.some(r => r.episodeId === episodeRef.episodeId);
  if (!exists) {
    character.episodeRefs.push(episodeRef);
    await saveCharacters(projectId, characters);
  }
}

export async function removeCharacterEpisodeRef(
  projectId: string,
  characterId: string,
  episodeId: string
): Promise<void> {
  const characters = await loadCharacters(projectId);
  const character = characters.find(c => c.id === characterId);
  if (!character || !character.episodeRefs) return;

  character.episodeRefs = character.episodeRefs.filter(r => r.episodeId !== episodeId);
  await saveCharacters(projectId, characters);
}

export async function addSceneEpisodeRef(
  projectId: string,
  sceneId: string,
  episodeRef: EpisodeRef
): Promise<void> {
  const scenes = await loadScenes(projectId);
  const scene = scenes.find(s => s.id === sceneId);
  if (!scene) return;

  if (!scene.episodeRefs) {
    scene.episodeRefs = [];
  }

  const exists = scene.episodeRefs.some(r => r.episodeId === episodeRef.episodeId);
  if (!exists) {
    scene.episodeRefs.push(episodeRef);
    await saveScenes(projectId, scenes);
  }
}

export async function removeSceneEpisodeRef(
  projectId: string,
  sceneId: string,
  episodeId: string
): Promise<void> {
  const scenes = await loadScenes(projectId);
  const scene = scenes.find(s => s.id === sceneId);
  if (!scene || !scene.episodeRefs) return;

  scene.episodeRefs = scene.episodeRefs.filter(r => r.episodeId !== episodeId);
  await saveScenes(projectId, scenes);
}

export async function addPropEpisodeRef(
  projectId: string,
  propId: string,
  episodeRef: EpisodeRef
): Promise<void> {
  const props = await loadProps(projectId);
  const prop = props.find(p => p.id === propId);
  if (!prop) return;

  if (!prop.episodeRefs) {
    prop.episodeRefs = [];
  }

  const exists = prop.episodeRefs.some(r => r.episodeId === episodeRef.episodeId);
  if (!exists) {
    prop.episodeRefs.push(episodeRef);
    await saveProps(projectId, props);
  }
}

export async function removePropEpisodeRef(
  projectId: string,
  propId: string,
  episodeId: string
): Promise<void> {
  const props = await loadProps(projectId);
  const prop = props.find(p => p.id === propId);
  if (!prop || !prop.episodeRefs) return;

  prop.episodeRefs = prop.episodeRefs.filter(r => r.episodeId !== episodeId);
  await saveProps(projectId, props);
}

export async function findCharacterByName(
  projectId: string,
  name: string
): Promise<Character | null> {
  const characters = await loadCharacters(projectId);
  const normalized = name.toLowerCase().trim();
  return characters.find(c => c.name.toLowerCase().trim() === normalized) || null;
}

export async function findSceneByName(
  projectId: string,
  name: string
): Promise<Scene | null> {
  const scenes = await loadScenes(projectId);
  const normalized = name.toLowerCase().trim();
  return scenes.find(s => s.name.toLowerCase().trim() === normalized) || null;
}

export async function findPropByName(
  projectId: string,
  name: string
): Promise<Prop | null> {
  const props = await loadProps(projectId);
  const normalized = name.toLowerCase().trim();
  return props.find(p => p.name.toLowerCase().trim() === normalized) || null;
}

export async function getOrphanedAssets(projectId: string): Promise<{
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
}> {
  const [characters, scenes, props] = await Promise.all([
    loadCharacters(projectId),
    loadScenes(projectId),
    loadProps(projectId),
  ]);

  return {
    characters: characters.filter(c => !c.episodeRefs || c.episodeRefs.length === 0),
    scenes: scenes.filter(s => !s.episodeRefs || s.episodeRefs.length === 0),
    props: props.filter(p => !p.episodeRefs || p.episodeRefs.length === 0),
  };
}
