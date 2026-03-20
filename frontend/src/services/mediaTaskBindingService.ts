import type { AsyncTask, MediaOwnerRef, ShotMeta, StoredMediaAsset } from '../types';
import {
  loadCharacters,
  saveCharacters,
  loadScenes,
  saveScenes,
  loadProps,
  saveProps,
  loadEpisodeShots,
  saveEpisodeShots,
  loadShots,
  saveShots,
} from '../store/projectStore';
import { normalizeShotMediaState, normalizeShotVersionMediaState } from '../store/project/mediaState';
import { electronService } from './electronService';
import { getProjectPath } from '../store/project/core';

function slotKeyForOwnerSlot(slot: string): 'costumePhoto' | 'previewImage' | 'previewVideo' | 'referenceImage' | 'image' | 'video' | 'audio' | undefined {
  switch (slot) {
    case 'costumePhoto':
    case 'previewImage':
    case 'previewVideo':
    case 'referenceImage':
    case 'image':
    case 'video':
    case 'audio':
      return slot;
    default:
      return undefined;
  }
}

async function bindShotVersionMedia(
  projectId: string,
  shotId: string,
  versionId: string,
  slot: 'image' | 'video' | 'audio',
  asset: StoredMediaAsset
): Promise<void> {
  if (!electronService.isElectron()) return;

  const projectPath = await getProjectPath(projectId);
  const shotMetaPath = `${projectPath}/shots/${shotId}/shot.json`;
  const exists = await electronService.fs.exists(shotMetaPath);
  if (!exists) return;

  const data = await electronService.fs.readFile(shotMetaPath);
  const meta = JSON.parse(data) as ShotMeta;

  const versionNumber = Number(versionId.replace(/^v/i, ''));
  if (!Number.isFinite(versionNumber)) return;

  const idx = Array.isArray(meta.versions) ? meta.versions.findIndex(v => v.version === versionNumber) : -1;
  if (idx === -1) return;

  const normalized = normalizeShotVersionMediaState(meta.versions[idx]);
  const next = normalizeShotVersionMediaState({
    ...normalized,
    media: {
      ...(normalized.media || {}),
      [slot]: asset,
    },
  });
  meta.versions[idx] = next;

  await electronService.fs.writeFile(shotMetaPath, JSON.stringify(meta, null, 2));
}

export async function bindCompletedMediaTask(
  projectId: string,
  task: AsyncTask,
  asset: StoredMediaAsset
): Promise<void> {
  const ownerRef = task.ownerRef;
  if (!ownerRef || ownerRef.projectId !== projectId) return;

  await bindOwnerRefMedia(projectId, ownerRef, asset);
}

export async function bindOwnerRefMedia(
  projectId: string,
  ownerRef: MediaOwnerRef,
  asset: StoredMediaAsset
): Promise<void> {
  const slot = slotKeyForOwnerSlot(ownerRef.slot);
  if (!slot) return;

  if (ownerRef.ownerType === 'character') {
    const characters = await loadCharacters(projectId);
    const idx = characters.findIndex(c => c.id === ownerRef.ownerId);
    if (idx === -1) return;

    if (slot !== 'costumePhoto' && slot !== 'previewVideo') return;
    const existing = characters[idx];
    characters[idx] = {
      ...existing,
      media: {
        ...(existing.media || {}),
        [slot]: asset,
      },
    };
    await saveCharacters(projectId, characters);
    return;
  }

  if (ownerRef.ownerType === 'scene') {
    const scenes = await loadScenes(projectId);
    const idx = scenes.findIndex(s => s.id === ownerRef.ownerId);
    if (idx === -1) return;

    if (slot !== 'previewImage') return;
    const existing = scenes[idx];
    scenes[idx] = {
      ...existing,
      media: {
        ...(existing.media || {}),
        previewImage: asset,
      },
    };
    await saveScenes(projectId, scenes);
    return;
  }

  if (ownerRef.ownerType === 'prop') {
    const props = await loadProps(projectId);
    const idx = props.findIndex(p => p.id === ownerRef.ownerId);
    if (idx === -1) return;

    if (slot !== 'previewImage' && slot !== 'previewVideo') return;
    const existing = props[idx];
    props[idx] = {
      ...existing,
      media: {
        ...(existing.media || {}),
        [slot]: asset,
      },
    };
    await saveProps(projectId, props);
    return;
  }

  if (ownerRef.ownerType === 'shot') {
    const shots = ownerRef.episodeId
      ? await loadEpisodeShots(projectId, ownerRef.episodeId)
      : await loadShots(projectId);

    const idx = shots.findIndex(s => s.id === ownerRef.ownerId);
    if (idx === -1) return;

    const normalized = normalizeShotMediaState(shots[idx]);
    const media = normalized.media || {};

    if (slot === 'referenceImage') {
      const next = [...(media.references || []), asset];
      shots[idx] = normalizeShotMediaState({
        ...normalized,
        media: {
          ...media,
          references: next,
          selectedReferenceIndex: next.length - 1,
        },
      });
    } else if (slot === 'image') {
      const next = [...(media.images || []), asset];
      shots[idx] = normalizeShotMediaState({
        ...normalized,
        media: {
          ...media,
          images: next,
          currentImageIndex: next.length - 1,
        },
      });
    } else if (slot === 'video') {
      const next = [...(media.videos || []), asset];
      shots[idx] = normalizeShotMediaState({
        ...normalized,
        media: {
          ...media,
          videos: next,
          currentVideoIndex: next.length - 1,
        },
      });
    } else {
      return;
    }

    if (ownerRef.episodeId) {
      await saveEpisodeShots(projectId, ownerRef.episodeId, shots);
    } else {
      await saveShots(projectId, shots);
    }
    return;
  }

  if (ownerRef.ownerType === 'shot-version' && ownerRef.versionId) {
    if (slot !== 'image' && slot !== 'video' && slot !== 'audio') return;
    await bindShotVersionMedia(projectId, ownerRef.ownerId, ownerRef.versionId, slot, asset);
  }
}
