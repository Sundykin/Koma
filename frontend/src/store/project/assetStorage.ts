/**
 * 角色/场景/道具资产存储
 */
import { electronService } from '../../services/electronService';
import type { Prop } from '../../types';
import { getProjectPath } from './core';
import { loadShotMeta } from './shots';

// ========== 角色资产 ==========

export async function saveCharacterCostumePhoto(
  projectId: string,
  characterId: string,
  imagePath: string
): Promise<string> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  const projectPath = await getProjectPath(projectId);
  const assetDir = `${projectPath}/assets/characters/${characterId}`;
  await electronService.fs.mkdir(assetDir);

  const destPath = `${assetDir}/costume.png`;
  await electronService.fs.copy(imagePath, destPath);

  return destPath;
}

export async function saveCharacterPreviewVideo(
  projectId: string,
  characterId: string,
  videoPath: string
): Promise<string> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  const projectPath = await getProjectPath(projectId);
  const assetDir = `${projectPath}/assets/characters/${characterId}`;
  await electronService.fs.mkdir(assetDir);

  const destPath = `${assetDir}/preview.mp4`;
  await electronService.fs.copy(videoPath, destPath);

  return destPath;
}

// ========== 场景资产 ==========

export async function saveSceneImage(
  projectId: string,
  sceneId: string,
  imagePath: string
): Promise<string> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  const projectPath = await getProjectPath(projectId);
  const assetDir = `${projectPath}/assets/scenes/${sceneId}`;
  await electronService.fs.mkdir(assetDir);

  const destPath = `${assetDir}/preview.png`;
  await electronService.fs.copy(imagePath, destPath);

  return destPath;
}

// ========== 道具资产 ==========

export async function savePropImage(
  projectId: string,
  propId: string,
  imagePath: string
): Promise<string> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  const projectPath = await getProjectPath(projectId);
  const assetDir = `${projectPath}/assets/props/${propId}`;
  await electronService.fs.mkdir(assetDir);

  const destPath = `${assetDir}/reference.png`;
  await electronService.fs.copy(imagePath, destPath);

  return destPath;
}

// 道具迁移辅助函数
function migratePropToPrompt(prop: Prop): Prop {
  if (prop.prompt?.trim()) return prop;
  const parts: string[] = [];
  if (prop.type) parts.push(`Type: ${prop.type}`);
  if (prop.description) parts.push(prop.description);
  if (prop.customPrompt) parts.push(prop.customPrompt);
  return { ...prop, prompt: parts.join('\n') || '' };
}

export async function loadProps(projectId: string): Promise<Prop[]> {
  if (!electronService.isElectron()) return [];
  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(`${projectPath}/props.json`);
    const props = JSON.parse(data);

    // 自动迁移
    let needsSave = false;
    const migrated = (Array.isArray(props) ? props : []).map((prop: Prop) => {
      if (!prop.prompt?.trim() && (prop.type || prop.description || prop.customPrompt)) {
        needsSave = true;
        return migratePropToPrompt(prop);
      }
      return prop;
    });

    if (needsSave) {
      await electronService.fs.writeFile(
        `${projectPath}/props.json`,
        JSON.stringify(migrated, null, 2)
      );
      console.log('[Migration] Props migrated to prompt field');
    }

    return migrated;
  } catch {
    return [];
  }
}

export async function saveProps(projectId: string, props: Prop[]): Promise<void> {
  if (!electronService.isElectron()) return;
  const projectPath = await getProjectPath(projectId);
  await electronService.fs.writeFile(
    `${projectPath}/props.json`,
    JSON.stringify(props, null, 2)
  );
}

// ========== 分镜版本切换 ==========

export async function switchShotVersion(
  projectId: string,
  shotId: string,
  version: number
): Promise<void> {
  if (!electronService.isElectron()) {
    return;
  }

  const shotMeta = await loadShotMeta(projectId, shotId);
  if (!shotMeta) {
    return;
  }

  const targetVersion = shotMeta.versions.find((v) => v.version === version);
  if (!targetVersion) {
    throw new Error(`版本 ${version} 不存在`);
  }

  shotMeta.currentVersion = version;

  const projectPath = await getProjectPath(projectId);
  await electronService.fs.writeFile(
    `${projectPath}/shots/${shotId}/shot.json`,
    JSON.stringify(shotMeta, null, 2)
  );
}

export async function deleteShotVersion(
  projectId: string,
  shotId: string,
  version: number
): Promise<boolean> {
  if (!electronService.isElectron()) {
    return false;
  }

  const shotMeta = await loadShotMeta(projectId, shotId);
  if (!shotMeta) {
    return false;
  }

  if (shotMeta.versions.length <= 1) {
    throw new Error('至少需要保留一个版本');
  }

  const versionIndex = shotMeta.versions.findIndex((v) => v.version === version);
  if (versionIndex === -1) {
    throw new Error(`版本 ${version} 不存在`);
  }

  const projectPath = await getProjectPath(projectId);
  const versionPath = `${projectPath}/shots/${shotId}/versions/v${version}`;

  try {
    await electronService.fs.remove(versionPath);
  } catch {
    // 忽略删除失败
  }

  shotMeta.versions.splice(versionIndex, 1);

  if (shotMeta.currentVersion === version) {
    const latestVersion = Math.max(...shotMeta.versions.map((v) => v.version));
    shotMeta.currentVersion = latestVersion;
  }

  await electronService.fs.writeFile(
    `${projectPath}/shots/${shotId}/shot.json`,
    JSON.stringify(shotMeta, null, 2)
  );

  return true;
}
