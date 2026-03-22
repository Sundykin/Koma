/**
 * 分镜版本管理
 */
import { electronService } from '../../services/electronService';
import type { ShotVersion, ShotMeta } from '../../types';
import { getProjectPath } from './core';
import { persistMediaAsset } from '../../services/mediaPersistenceService';
import {
  normalizeShotVersionMediaState,
  normalizeShotVersionsMediaState,
} from './mediaState';
import { createLogger } from '../logger';

const logger = createLogger('ProjectShots');

export async function saveShotVersion(
  projectId: string,
  shotId: string,
  version: Omit<ShotVersion, 'version' | 'createdAt'>
): Promise<ShotVersion> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  const projectPath = await getProjectPath(projectId);
  const shotPath = `${projectPath}/shots/${shotId}`;
  await electronService.fs.mkdir(shotPath);

  let shotMeta: ShotMeta;
  try {
    const shotMetaPath = `${shotPath}/shot.json`;
    const exists = await electronService.fs.exists(shotMetaPath);
    if (!exists) {
      throw new Error('missing shot meta');
    }
    const data = await electronService.fs.readFile(shotMetaPath);
    shotMeta = JSON.parse(data);
  } catch {
    shotMeta = {
      id: shotId,
      prompt: version.prompt,
      seed: version.seed,
      model: version.model,
      currentVersion: 0,
      versions: [],
    };
  }

  const newVersion = shotMeta.currentVersion + 1;
  const versionPath = `${shotPath}/versions/v${newVersion}`;
  await electronService.fs.mkdir(versionPath);

  const normalizedInput = normalizeShotVersionMediaState({
    version: 0,
    ...version,
    createdAt: Date.now(),
  });

  const persistedMedia: NonNullable<ShotVersion['media']> = {};

  if (normalizedInput.media?.image) {
    persistedMedia.image = await persistMediaAsset({
      projectId,
      kind: 'image',
      source: normalizedInput.media.image,
      destPath: `${versionPath}/image.png`,
      ownerRef: {
        projectId,
        ownerType: 'shot-version',
        ownerId: shotId,
        slot: 'image',
        versionId: `v${newVersion}`,
      },
    });
  }

  if (normalizedInput.media?.video) {
    persistedMedia.video = await persistMediaAsset({
      projectId,
      kind: 'video',
      source: normalizedInput.media.video,
      destPath: `${versionPath}/video.mp4`,
      ownerRef: {
        projectId,
        ownerType: 'shot-version',
        ownerId: shotId,
        slot: 'video',
        versionId: `v${newVersion}`,
      },
    });
  }

  if (normalizedInput.media?.audio) {
    persistedMedia.audio = await persistMediaAsset({
      projectId,
      kind: 'audio',
      source: normalizedInput.media.audio,
      destPath: `${versionPath}/audio.mp3`,
      ownerRef: {
        projectId,
        ownerType: 'shot-version',
        ownerId: shotId,
        slot: 'audio',
        versionId: `v${newVersion}`,
      },
    });
  }

  const shotVersion = normalizeShotVersionMediaState({
    version: newVersion,
    media: persistedMedia,
    prompt: normalizedInput.prompt,
    seed: normalizedInput.seed,
    model: normalizedInput.model,
    createdAt: Date.now(),
  });

  shotMeta.currentVersion = newVersion;
  shotMeta.versions.push(shotVersion);
  shotMeta.prompt = version.prompt;
  shotMeta.seed = version.seed;
  shotMeta.model = version.model;

  await electronService.fs.writeFile(
    `${shotPath}/shot.json`,
    JSON.stringify(shotMeta, null, 2)
  );

  return shotVersion;
}

export async function loadShotMeta(
  projectId: string,
  shotId: string
): Promise<ShotMeta | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  try {
    const projectPath = await getProjectPath(projectId);
    const shotMetaPath = `${projectPath}/shots/${shotId}/shot.json`;
    const exists = await electronService.fs.exists(shotMetaPath);
    if (!exists) return null;
    const data = await electronService.fs.readFile(shotMetaPath);
    const parsed = JSON.parse(data) as ShotMeta;
    return {
      ...parsed,
      versions: normalizeShotVersionsMediaState(parsed.versions || []),
    };
  } catch (err) {
    logger.warn('加载分镜元数据失败', { shotId, err });
    return null;
  }
}

export async function listShots(projectId: string): Promise<ShotMeta[]> {
  if (!electronService.isElectron()) {
    return [];
  }

  try {
    const projectPath = await getProjectPath(projectId);
    const shotsPath = `${projectPath}/shots`;
    const entries = await electronService.fs.readdir(shotsPath);
    const shots: ShotMeta[] = [];

    for (const entry of entries) {
      try {
        const shotMetaPath = `${shotsPath}/${entry}/shot.json`;
        const exists = await electronService.fs.exists(shotMetaPath);
        if (!exists) continue;
        const data = await electronService.fs.readFile(shotMetaPath);
        const parsed = JSON.parse(data) as ShotMeta;
        shots.push({
          ...parsed,
          versions: normalizeShotVersionsMediaState(parsed.versions || []),
        });
      } catch (err) {
        logger.warn('跳过无效分镜条目', { entry, err });
      }
    }

    return shots;
  } catch (err) {
    logger.warn('列举分镜失败', { projectId, err });
    return [];
  }
}

export async function getShotVersionHistory(
  projectId: string,
  shotId: string
): Promise<import('../../types').ShotVersion[]> {
  if (!electronService.isElectron()) {
    return [];
  }

  const shotMeta = await loadShotMeta(projectId, shotId);
  if (!shotMeta) {
    return [];
  }

  return [...shotMeta.versions].sort((a, b) => b.version - a.version);
}
