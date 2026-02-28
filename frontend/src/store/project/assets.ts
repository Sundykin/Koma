/**
 * 素材管理
 */
import { v4 as uuidv4 } from 'uuid';
import { electronService } from '../../services/electronService';
import type { Asset } from '../../types';
import { getProjectPath } from './core';
import { persistenceClient } from '../../utils/ipcRenderer';

async function computeFileHash(filePath: string): Promise<string> {
  try {
    const content = await electronService.fs.readFile(filePath);
    const size = content.length;
    const head = content.slice(0, 1000);
    const tail = content.slice(-1000);
    return `${size}-${hashString(head + tail)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

async function saveAssetMeta(projectId: string, asset: Asset): Promise<void> {
  const assets = await loadAssets(projectId);
  assets.push(asset);
  await persistenceClient.save(projectId, 'asset', assets);
}

export async function importAsset(
  projectId: string,
  sourcePath: string,
  type: 'image' | 'video' | 'audio'
): Promise<Asset | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  const projectPath = await getProjectPath(projectId);
  const stat = await electronService.fs.stat(sourcePath);
  if (!stat) {
    return null;
  }

  const fileHash = await computeFileHash(sourcePath);

  const existingAssets = await loadAssets(projectId);
  const duplicate = existingAssets.find(a => a.md5 === fileHash);
  if (duplicate) {
    return duplicate;
  }

  const timestamp = Date.now();
  const originalName = sourcePath.split('/').pop() || sourcePath.split('\\').pop() || 'file';
  const destName = `${timestamp}_${originalName}`;
  const destPath = `${projectPath}/assets/${type}s/${destName}`;

  await electronService.fs.copy(sourcePath, destPath);

  const asset: Asset = {
    id: uuidv4(),
    name: originalName,
    type: type === 'image' ? 'image' : type === 'video' ? 'video' : 'audio',
    path: destPath,
    size: stat.size,
    createdAt: Date.now(),
    refCount: 0,
    md5: fileHash,
  };

  await saveAssetMeta(projectId, asset);

  return asset;
}

export async function loadAssets(projectId: string): Promise<Asset[]> {
  if (!electronService.isElectron()) {
    return [];
  }

  try {
    const assets = await persistenceClient.list<Asset>(projectId, 'asset');
    return Array.isArray(assets) ? assets : [];
  } catch {
    return [];
  }
}

export async function findDuplicateAsset(
  projectId: string,
  filePath: string
): Promise<Asset | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  const assets = await loadAssets(projectId);
  const newHash = await computeFileHash(filePath);

  for (const asset of assets) {
    if (asset.md5 === newHash) {
      return asset;
    }
  }
  return null;
}

export async function incrementAssetRef(
  projectId: string,
  assetId: string
): Promise<void> {
  if (!electronService.isElectron()) return;

  const assets = await loadAssets(projectId);

  const asset = assets.find(a => a.id === assetId);
  if (asset) {
    asset.refCount = (asset.refCount || 0) + 1;
    await persistenceClient.save(projectId, 'asset', assets);
  }
}

export async function decrementAssetRef(
  projectId: string,
  assetId: string
): Promise<void> {
  if (!electronService.isElectron()) return;

  const assets = await loadAssets(projectId);

  const asset = assets.find(a => a.id === assetId);
  if (asset && asset.refCount > 0) {
    asset.refCount -= 1;
    await persistenceClient.save(projectId, 'asset', assets);
  }
}

export async function getUnusedAssets(projectId: string): Promise<Asset[]> {
  const assets = await loadAssets(projectId);
  return assets.filter(a => (a.refCount || 0) === 0);
}

export async function cleanUnusedAssets(projectId: string): Promise<number> {
  if (!electronService.isElectron()) return 0;

  const assets = await loadAssets(projectId);

  const unusedAssets = assets.filter(a => (a.refCount || 0) === 0);
  const usedAssets = assets.filter(a => (a.refCount || 0) > 0);

  for (const asset of unusedAssets) {
    try {
      await electronService.fs.remove(asset.path);
    } catch {
      // 忽略删除失败
    }
  }

  await persistenceClient.save(projectId, 'asset', usedAssets);

  return unusedAssets.length;
}
