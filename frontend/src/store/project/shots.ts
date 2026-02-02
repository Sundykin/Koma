/**
 * 分镜版本管理
 */
import { electronService } from '../../services/electronService';
import type { ShotVersion, ShotMeta } from '../../types';
import { getProjectPath } from './core';

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
    const data = await electronService.fs.readFile(`${shotPath}/shot.json`);
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

  const shotVersion: ShotVersion = {
    version: newVersion,
    imagePath: version.imagePath
      ? `${versionPath}/image.png`
      : undefined,
    videoPath: version.videoPath
      ? `${versionPath}/video.mp4`
      : undefined,
    audioPath: version.audioPath
      ? `${versionPath}/audio.mp3`
      : undefined,
    remoteImageUrl: version.remoteImageUrl,
    remoteVideoUrl: version.remoteVideoUrl,
    prompt: version.prompt,
    seed: version.seed,
    model: version.model,
    createdAt: Date.now(),
  };

  const isRemoteUrl = (path: string) => path.startsWith('http://') || path.startsWith('https://');

  if (version.imagePath) {
    if (isRemoteUrl(version.imagePath)) {
      await electronService.fs.downloadFile(version.imagePath, shotVersion.imagePath!);
    } else {
      await electronService.fs.copy(version.imagePath, shotVersion.imagePath!);
    }
  }
  if (version.videoPath) {
    if (isRemoteUrl(version.videoPath)) {
      await electronService.fs.downloadFile(version.videoPath, shotVersion.videoPath!);
    } else {
      await electronService.fs.copy(version.videoPath, shotVersion.videoPath!);
    }
  }
  if (version.audioPath) {
    if (isRemoteUrl(version.audioPath)) {
      await electronService.fs.downloadFile(version.audioPath, shotVersion.audioPath!);
    } else {
      await electronService.fs.copy(version.audioPath, shotVersion.audioPath!);
    }
  }

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
    const data = await electronService.fs.readFile(`${projectPath}/shots/${shotId}/shot.json`);
    return JSON.parse(data);
  } catch {
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
        const data = await electronService.fs.readFile(`${shotsPath}/${entry}/shot.json`);
        shots.push(JSON.parse(data));
      } catch {
        // skip invalid
      }
    }

    return shots;
  } catch {
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
