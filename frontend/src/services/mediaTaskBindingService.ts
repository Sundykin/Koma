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

const shotCollectionWriteTails = new Map<string, Promise<void>>();
const shotMetaWriteTails = new Map<string, Promise<void>>();

function enqueueSerializedWrite<T>(
  tails: Map<string, Promise<void>>,
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(key) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(work);
  const tail = next.then(() => undefined, () => undefined);
  tails.set(key, tail);
  tail.finally(() => {
    if (tails.get(key) === tail) {
      tails.delete(key);
    }
  });
  return next;
}

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
    case 'gridImage':
      return 'image';
    default:
      return undefined;
  }
}

function trimUrlTail(candidate: string): string {
  let s = String(candidate || '').trim();
  // Strip common trailing chars and percent-encoded tails like %22%3E (">).
  for (let i = 0; i < 10; i += 1) {
    const before = s;
    s = s.replace(/[)"'<>.,;\]]+$/g, '');
    s = s.replace(/(%22|%27|%3E|%3C)+$/gi, '');
    if (s === before) break;
  }
  return s;
}

async function rewriteTimelineFile(
  filePath: string,
  fromRemoteUrl: string,
  toLocalPath: string
): Promise<boolean> {
  try {
    const exists = await electronService.fs.exists(filePath);
    if (!exists) return false;
    const raw = await electronService.fs.readFile(filePath);
    const obj = JSON.parse(raw) as any;
    const tracks = Array.isArray(obj?.tracks) ? obj.tracks : [];
    let changed = false;
    const from = trimUrlTail(fromRemoteUrl);

    for (const track of tracks) {
      const clips = Array.isArray(track?.clips) ? track.clips : [];
      for (const clip of clips) {
        const src = typeof clip?.src === 'string' ? trimUrlTail(clip.src) : null;
        if (!src) continue;
        if (src !== clip.src) {
          clip.src = src;
          changed = true;
        }
        if (src === from) {
          clip.src = toLocalPath;
          changed = true;
        }
      }
    }

    if (!changed) return false;
    await electronService.fs.writeFile(filePath, JSON.stringify(obj, null, 2));
    return true;
  } catch {
    return false;
  }
}

async function rewriteTimelinesForAsset(
  projectId: string,
  remoteUrl: string,
  localPath: string
): Promise<void> {
  if (!electronService.isElectron()) return;
  if (!remoteUrl || !localPath) return;
  if (!/^https?:\/\//i.test(remoteUrl)) return;

  const projectPath = await getProjectPath(projectId);

  // 1) Project-wide timeline
  await rewriteTimelineFile(`${projectPath}/timeline.json`, remoteUrl, localPath);

  // 2) Episode timelines
  try {
    const episodesDir = `${projectPath}/episodes`;
    const hasEpisodes = await electronService.fs.exists(episodesDir);
    if (!hasEpisodes) return;
    const episodeIds = await electronService.fs.readdir(episodesDir);
    for (const eid of episodeIds) {
      await rewriteTimelineFile(`${episodesDir}/${eid}/timeline.json`, remoteUrl, localPath);
    }
  } catch {
    // ignore
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

  const queueKey = `${projectId}:${shotId}`;
  await enqueueSerializedWrite(shotMetaWriteTails, queueKey, async () => {
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
  });
}

function buildAssetIdentity(asset: StoredMediaAsset): string {
  return [
    asset.providerTaskId,
    asset.localPath,
    asset.remoteUrl,
    asset.createdAt,
  ].filter(Boolean).join('|');
}

function appendUniqueMediaAsset(list: StoredMediaAsset[], asset: StoredMediaAsset): StoredMediaAsset[] {
  const incomingKey = buildAssetIdentity(asset);
  if (!incomingKey) {
    return [...list, asset];
  }
  if (list.some(item => buildAssetIdentity(item) === incomingKey)) {
    return list;
  }
  return [...list, asset];
}

async function bindShotAssetCollection(
  projectId: string,
  ownerRef: MediaOwnerRef,
  slot: 'referenceImage' | 'image' | 'video',
  asset: StoredMediaAsset,
): Promise<void> {
  const queueKey = `${projectId}:${ownerRef.episodeId || '__root__'}`;
  await enqueueSerializedWrite(shotCollectionWriteTails, queueKey, async () => {
    const shots = ownerRef.episodeId
      ? await loadEpisodeShots(projectId, ownerRef.episodeId)
      : await loadShots(projectId);

    const idx = shots.findIndex(s => s.id === ownerRef.ownerId);
    if (idx === -1) return;

    const normalized = normalizeShotMediaState(shots[idx]);
    const media = normalized.media || {};

    if (slot === 'referenceImage') {
      const next = appendUniqueMediaAsset(media.references || [], asset);
      shots[idx] = normalizeShotMediaState({
        ...normalized,
        media: {
          ...media,
          references: next,
          selectedReferenceIndex: next.length - 1,
        },
      });
    } else if (slot === 'image') {
      const next = appendUniqueMediaAsset(media.images || [], asset);
      shots[idx] = normalizeShotMediaState({
        ...normalized,
        media: {
          ...media,
          images: next,
          currentImageIndex: next.length - 1,
        },
      });
    } else {
      const next = appendUniqueMediaAsset(media.videos || [], asset);
      shots[idx] = normalizeShotMediaState({
        ...normalized,
        media: {
          ...media,
          videos: next,
          currentVideoIndex: next.length - 1,
        },
      });
    }

    if (ownerRef.episodeId) {
      await saveEpisodeShots(projectId, ownerRef.episodeId, shots);
    } else {
      await saveShots(projectId, shots);
    }
  });
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
  const maybeRewriteTimelineSources = () => {
    if (asset.remoteUrl && asset.localPath) {
      rewriteTimelinesForAsset(projectId, asset.remoteUrl, asset.localPath).catch(() => {});
    }
  };

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
    maybeRewriteTimelineSources();
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
    maybeRewriteTimelineSources();
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
    maybeRewriteTimelineSources();
    return;
  }

  if (ownerRef.ownerType === 'shot') {
    if (slot !== 'referenceImage' && slot !== 'image' && slot !== 'video') {
      return;
    }
    await bindShotAssetCollection(projectId, ownerRef, slot, asset);
    maybeRewriteTimelineSources();
    return;
  }

  if (ownerRef.ownerType === 'shot-version' && ownerRef.versionId) {
    if (slot !== 'image' && slot !== 'video' && slot !== 'audio') return;
    await bindShotVersionMedia(projectId, ownerRef.ownerId, ownerRef.versionId, slot, asset);
    if (slot === 'video') {
      await bindShotAssetCollection(projectId, {
        ...ownerRef,
        ownerType: 'shot',
        slot: 'video',
      }, 'video', asset);
    }
    maybeRewriteTimelineSources();
  }
}
