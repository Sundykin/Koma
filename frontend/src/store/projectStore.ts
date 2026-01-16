/**
 * 项目存储
 * 管理项目数据、时间线、素材、分镜版本
 */
import { v4 as uuidv4 } from 'uuid';
import { electronService } from '../services/electronService';
import { getStorageConfig, initStorageConfig } from './storageConfig';
import { addRecentProject } from './globalStore';
import type {
  ProjectMeta,
  Timeline,
  Asset,
  ShotMeta,
  ShotVersion,
  Track,
} from '../types';

import {
  exportToManjuDSL,
  importFromManjuDSL,
  validateManjuProject,
  type ManjuProject,
} from '../manju-dsl/protocol';
import type { Character, Scene, Shot } from '../types';

// ========== 路径工具 ==========

async function getProjectsRoot(): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  return `${config.rootPath}/projects`;
}

async function getProjectPath(projectId: string): Promise<string> {
  const root = await getProjectsRoot();
  return `${root}/${projectId}`;
}

// ========== 项目管理 ==========

export async function createProject(
  title: string,
  genre: string,
  mode: 'drama' | 'narration'
): Promise<ProjectMeta> {
  const projectId = uuidv4();
  const now = Date.now();

  const project: ProjectMeta = {
    id: projectId,
    title,
    genre,
    mode,
    createdAt: now,
    updatedAt: now,
  };

  if (electronService.isElectron()) {
    const projectPath = await getProjectPath(projectId);

    // 创建项目目录结构
    await electronService.fs.mkdir(projectPath);
    await electronService.fs.mkdir(`${projectPath}/assets/images`);
    await electronService.fs.mkdir(`${projectPath}/assets/videos`);
    await electronService.fs.mkdir(`${projectPath}/assets/audio`);
    await electronService.fs.mkdir(`${projectPath}/assets/fonts`);
    await electronService.fs.mkdir(`${projectPath}/shots`);
    await electronService.fs.mkdir(`${projectPath}/cache/thumbnails`);
    await electronService.fs.mkdir(`${projectPath}/cache/waveforms`);
    await electronService.fs.mkdir(`${projectPath}/cache/previews`);
    await electronService.fs.mkdir(`${projectPath}/exports`);
    await electronService.fs.mkdir(`${projectPath}/temp`);

    // 保存项目元数据
    await electronService.fs.writeFile(
      `${projectPath}/project.json`,
      JSON.stringify(project, null, 2)
    );

    // 创建默认时间线
    const timeline = createDefaultTimeline();
    await electronService.fs.writeFile(
      `${projectPath}/timeline.json`,
      JSON.stringify(timeline, null, 2)
    );

    // 添加到最近项目
    await addRecentProject({
      id: projectId,
      title,
      path: projectPath,
      lastOpened: now,
    });
  }

  return project;
}

function createDefaultTimeline(): Timeline {
  return {
    id: uuidv4(),
    duration: 0,
    tracks: [
      {
        id: uuidv4(),
        name: '视频轨道 1',
        type: 'video',
        muted: false,
        locked: false,
        visible: true,
        height: 60,
        clips: [],
      },
      {
        id: uuidv4(),
        name: '音频轨道 1',
        type: 'audio',
        muted: false,
        locked: false,
        visible: true,
        height: 40,
        clips: [],
      },
      {
        id: uuidv4(),
        name: '字幕轨道',
        type: 'subtitle',
        muted: false,
        locked: false,
        visible: true,
        height: 30,
        clips: [],
      },
    ],
    fps: 30,
    resolution: { width: 1920, height: 1080 },
  };
}

export async function loadProject(projectId: string): Promise<ProjectMeta | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(
      `${projectPath}/project.json`
    );
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveProject(project: ProjectMeta): Promise<void> {
  if (!electronService.isElectron()) {
    return;
  }

  const projectPath = await getProjectPath(project.id);
  project.updatedAt = Date.now();
  await electronService.fs.writeFile(
    `${projectPath}/project.json`,
    JSON.stringify(project, null, 2)
  );
}

export async function deleteProject(projectId: string): Promise<void> {
  if (!electronService.isElectron()) {
    return;
  }

  const projectPath = await getProjectPath(projectId);
  await electronService.fs.remove(projectPath);
}

// ========== 时间线 ==========

export async function loadTimeline(projectId: string): Promise<Timeline | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(
      `${projectPath}/timeline.json`
    );
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveTimeline(
  projectId: string,
  timeline: Timeline
): Promise<void> {
  if (!electronService.isElectron()) {
    return;
  }

  const projectPath = await getProjectPath(projectId);
  await electronService.fs.writeFile(
    `${projectPath}/timeline.json`,
    JSON.stringify(timeline, null, 2)
  );
}

// ========== 素材管理 ==========

// 计算文件哈希（用于去重）
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

  // 计算哈希用于去重
  const fileHash = await computeFileHash(sourcePath);

  // 检查是否已存在相同文件
  const existingAssets = await loadAssets(projectId);
  const duplicate = existingAssets.find(a => a.md5 === fileHash);
  if (duplicate) {
    return duplicate;
  }

  // 生成唯一文件名
  const timestamp = Date.now();
  const originalName = sourcePath.split('/').pop() || sourcePath.split('\\').pop() || 'file';
  const destName = `${timestamp}_${originalName}`;
  const destPath = `${projectPath}/assets/${type}s/${destName}`;

  // 复制文件
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

  // 保存素材元数据
  await saveAssetMeta(projectId, asset);

  return asset;
}

async function saveAssetMeta(projectId: string, asset: Asset): Promise<void> {
  const projectPath = await getProjectPath(projectId);
  const assetsPath = `${projectPath}/assets.json`;

  let assets: Asset[] = [];
  try {
    const data = await electronService.fs.readFile(assetsPath);
    assets = JSON.parse(data);
  } catch {
    // 文件不存在
  }

  assets.push(asset);
  await electronService.fs.writeFile(
    assetsPath,
    JSON.stringify(assets, null, 2)
  );
}

export async function loadAssets(projectId: string): Promise<Asset[]> {
  if (!electronService.isElectron()) {
    return [];
  }

  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(
      `${projectPath}/assets.json`
    );
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// 检查素材是否已存在（去重）
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

// 增加素材引用计数
export async function incrementAssetRef(
  projectId: string,
  assetId: string
): Promise<void> {
  if (!electronService.isElectron()) return;

  const projectPath = await getProjectPath(projectId);
  const assetsPath = `${projectPath}/assets.json`;
  const assets = await loadAssets(projectId);

  const asset = assets.find(a => a.id === assetId);
  if (asset) {
    asset.refCount = (asset.refCount || 0) + 1;
    await electronService.fs.writeFile(assetsPath, JSON.stringify(assets, null, 2));
  }
}

// 减少素材引用计数
export async function decrementAssetRef(
  projectId: string,
  assetId: string
): Promise<void> {
  if (!electronService.isElectron()) return;

  const projectPath = await getProjectPath(projectId);
  const assetsPath = `${projectPath}/assets.json`;
  const assets = await loadAssets(projectId);

  const asset = assets.find(a => a.id === assetId);
  if (asset && asset.refCount > 0) {
    asset.refCount -= 1;
    await electronService.fs.writeFile(assetsPath, JSON.stringify(assets, null, 2));
  }
}

// 获取未使用的素材
export async function getUnusedAssets(projectId: string): Promise<Asset[]> {
  const assets = await loadAssets(projectId);
  return assets.filter(a => (a.refCount || 0) === 0);
}

// 清理未使用的素材
export async function cleanUnusedAssets(projectId: string): Promise<number> {
  if (!electronService.isElectron()) return 0;

  const projectPath = await getProjectPath(projectId);
  const assetsPath = `${projectPath}/assets.json`;
  const assets = await loadAssets(projectId);

  const unusedAssets = assets.filter(a => (a.refCount || 0) === 0);
  const usedAssets = assets.filter(a => (a.refCount || 0) > 0);

  // 删除文件
  for (const asset of unusedAssets) {
    try {
      await electronService.fs.remove(asset.path);
    } catch {
      // 忽略删除失败
    }
  }

  // 更新元数据
  await electronService.fs.writeFile(assetsPath, JSON.stringify(usedAssets, null, 2));

  return unusedAssets.length;
}

// ========== 分镜版本管理 ==========

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

  // 加载现有元数据
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

  // 创建新版本
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
    prompt: version.prompt,
    seed: version.seed,
    model: version.model,
    createdAt: Date.now(),
  };

  // 复制文件到版本目录
  if (version.imagePath) {
    await electronService.fs.copy(version.imagePath, shotVersion.imagePath!);
  }
  if (version.videoPath) {
    await electronService.fs.copy(version.videoPath, shotVersion.videoPath!);
  }
  if (version.audioPath) {
    await electronService.fs.copy(version.audioPath, shotVersion.audioPath!);
  }

  // 更新元数据
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
    const data = await electronService.fs.readFile(
      `${projectPath}/shots/${shotId}/shot.json`
    );
    return JSON.parse(data);
  } catch {
    return null;
  }
}

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

// 删除分镜版本（保留至少一个）
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

  // 至少保留一个版本
  if (shotMeta.versions.length <= 1) {
    throw new Error('至少需要保留一个版本');
  }

  const versionIndex = shotMeta.versions.findIndex((v) => v.version === version);
  if (versionIndex === -1) {
    throw new Error(`版本 ${version} 不存在`);
  }

  const targetVersion = shotMeta.versions[versionIndex];
  const projectPath = await getProjectPath(projectId);
  const versionPath = `${projectPath}/shots/${shotId}/versions/v${version}`;

  // 删除版本目录
  try {
    await electronService.fs.remove(versionPath);
  } catch {
    // 忽略删除失败
  }

  // 从元数据中移除
  shotMeta.versions.splice(versionIndex, 1);

  // 如果删除的是当前版本，切换到最新版本
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

// 获取分镜版本历史
export async function getShotVersionHistory(
  projectId: string,
  shotId: string
): Promise<ShotVersion[]> {
  if (!electronService.isElectron()) {
    return [];
  }

  const shotMeta = await loadShotMeta(projectId, shotId);
  if (!shotMeta) {
    return [];
  }

  // 按版本号降序排列（最新在前）
  return [...shotMeta.versions].sort((a, b) => b.version - a.version);
}

// ========== 缓存管理 ==========

// 获取缓存统计信息
export interface CacheStats {
  thumbnails: { count: number; size: number };
  waveforms: { count: number; size: number };
  previews: { count: number; size: number };
  total: number;
}

export async function getCacheStats(projectId: string): Promise<CacheStats | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  const projectPath = await getProjectPath(projectId);
  const stats: CacheStats = {
    thumbnails: { count: 0, size: 0 },
    waveforms: { count: 0, size: 0 },
    previews: { count: 0, size: 0 },
    total: 0,
  };

  const cacheDirs = ['thumbnails', 'waveforms', 'previews'] as const;

  for (const dir of cacheDirs) {
    try {
      const files = await electronService.fs.readdir(`${projectPath}/cache/${dir}`);
      for (const file of files) {
        const fileStat = await electronService.fs.stat(`${projectPath}/cache/${dir}/${file}`);
        if (fileStat) {
          stats[dir].count++;
          stats[dir].size += fileStat.size;
        }
      }
    } catch {
      // 目录不存在
    }
  }

  stats.total = stats.thumbnails.size + stats.waveforms.size + stats.previews.size;
  return stats;
}

// 保存缩略图缓存
export async function saveThumbnail(
  projectId: string,
  assetId: string,
  dataUrl: string
): Promise<string | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  const projectPath = await getProjectPath(projectId);
  const thumbnailPath = `${projectPath}/cache/thumbnails/${assetId}.jpg`;

  // dataUrl 格式: data:image/jpeg;base64,xxxxx
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  await electronService.fs.writeFile(thumbnailPath, base64Data);

  return thumbnailPath;
}

// 获取缩略图缓存
export async function getThumbnail(
  projectId: string,
  assetId: string
): Promise<string | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  const projectPath = await getProjectPath(projectId);
  const thumbnailPath = `${projectPath}/cache/thumbnails/${assetId}.jpg`;

  const exists = await electronService.fs.exists(thumbnailPath);
  return exists ? thumbnailPath : null;
}

// 保存波形缓存
export async function saveWaveform(
  projectId: string,
  assetId: string,
  waveformData: number[]
): Promise<string | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  const projectPath = await getProjectPath(projectId);
  const waveformPath = `${projectPath}/cache/waveforms/${assetId}.json`;

  await electronService.fs.writeFile(waveformPath, JSON.stringify(waveformData));
  return waveformPath;
}

// 获取波形缓存
export async function getWaveform(
  projectId: string,
  assetId: string
): Promise<number[] | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  const projectPath = await getProjectPath(projectId);
  const waveformPath = `${projectPath}/cache/waveforms/${assetId}.json`;

  try {
    const data = await electronService.fs.readFile(waveformPath);
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// 保存预览帧缓存
export async function savePreviewFrame(
  projectId: string,
  assetId: string,
  frameIndex: number,
  dataUrl: string
): Promise<string | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  const projectPath = await getProjectPath(projectId);
  const previewPath = `${projectPath}/cache/previews/${assetId}_${frameIndex}.jpg`;

  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  await electronService.fs.writeFile(previewPath, base64Data);

  return previewPath;
}

// 获取预览帧缓存
export async function getPreviewFrame(
  projectId: string,
  assetId: string,
  frameIndex: number
): Promise<string | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  const projectPath = await getProjectPath(projectId);
  const previewPath = `${projectPath}/cache/previews/${assetId}_${frameIndex}.jpg`;

  const exists = await electronService.fs.exists(previewPath);
  return exists ? previewPath : null;
}

// 清理指定类型的缓存
export async function clearCacheByType(
  projectId: string,
  type: 'thumbnails' | 'waveforms' | 'previews'
): Promise<void> {
  if (!electronService.isElectron()) {
    return;
  }

  const projectPath = await getProjectPath(projectId);
  await electronService.fs.remove(`${projectPath}/cache/${type}`);
  await electronService.fs.mkdir(`${projectPath}/cache/${type}`);
}

export async function clearCache(projectId: string): Promise<void> {
  if (!electronService.isElectron()) {
    return;
  }

  const projectPath = await getProjectPath(projectId);
  await electronService.fs.remove(`${projectPath}/cache`);
  await electronService.fs.mkdir(`${projectPath}/cache/thumbnails`);
  await electronService.fs.mkdir(`${projectPath}/cache/waveforms`);
  await electronService.fs.mkdir(`${projectPath}/cache/previews`);
}

export async function clearTemp(projectId: string): Promise<void> {
  if (!electronService.isElectron()) {
    return;
  }

  const projectPath = await getProjectPath(projectId);
  await electronService.fs.remove(`${projectPath}/temp`);
  await electronService.fs.mkdir(`${projectPath}/temp`);
}

// ========== 临时文件管理 ==========

// 创建临时文件（唯一命名）
export async function createTempFile(
  projectId: string,
  extension: string = 'tmp'
): Promise<string | null> {
  if (!electronService.isElectron()) {
    return null;
  }

  const projectPath = await getProjectPath(projectId);
  const tempDir = `${projectPath}/temp`;
  await electronService.fs.mkdir(tempDir);

  const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const tempPath = `${tempDir}/${uniqueName}`;

  // 创建空文件
  await electronService.fs.writeFile(tempPath, '');
  return tempPath;
}

// 清理所有项目的 temp 目录（应用启动时调用）
export async function cleanAllTempOnStartup(): Promise<void> {
  if (!electronService.isElectron()) {
    return;
  }

  try {
    const projectsRoot = await getProjectsRoot();
    const exists = await electronService.fs.exists(projectsRoot);
    if (!exists) return;

    const projectDirs = await electronService.fs.readdir(projectsRoot);
    for (const dir of projectDirs) {
      const tempPath = `${projectsRoot}/${dir}/temp`;
      const tempExists = await electronService.fs.exists(tempPath);
      if (tempExists) {
        await electronService.fs.remove(tempPath);
        await electronService.fs.mkdir(tempPath);
      }
    }
  } catch {
    // 启动清理失败不影响正常运行
  }
}

export default {
  createProject,
  loadProject,
  saveProject,
  deleteProject,
  loadTimeline,
  saveTimeline,
  importAsset,
  loadAssets,
  findDuplicateAsset,
  incrementAssetRef,
  decrementAssetRef,
  getUnusedAssets,
  cleanUnusedAssets,
  saveShotVersion,
  loadShotMeta,
  switchShotVersion,
  deleteShotVersion,
  getShotVersionHistory,
  getCacheStats,
  saveThumbnail,
  getThumbnail,
  saveWaveform,
  getWaveform,
  savePreviewFrame,
  getPreviewFrame,
  clearCacheByType,
  clearCache,
  clearTemp,
  createTempFile,
  cleanAllTempOnStartup,
  saveProjectAsManju,
  loadProjectFromManju,
  exportProjectToManjuFile,
  importProjectFromManjuFile,
};

// ========== Manju-DSL 集成 ==========

/**
 * 保存项目为 Manju-DSL 格式（内存对象）
 */
export function saveProjectAsManju(
  project: ProjectMeta,
  characters: Character[],
  scenes: Scene[],
  shots: Shot[],
  timeline?: Timeline
): ManjuProject {
  return exportToManjuDSL(project, characters, scenes, shots, timeline);
}

/**
 * 从 Manju-DSL 加载项目数据
 */
export function loadProjectFromManju(manjuData: ManjuProject) {
  if (!validateManjuProject(manjuData)) {
    throw new Error('无效的 Manju-DSL 数据格式');
  }
  return importFromManjuDSL(manjuData);
}

/**
 * 导出项目到 .manju.json 文件
 */
export async function exportProjectToManjuFile(
  projectId: string,
  characters: Character[],
  scenes: Scene[],
  shots: Shot[]
): Promise<string | null> {
  if (!electronService.isElectron()) return null;

  const project = await loadProject(projectId);
  if (!project) throw new Error('项目不存在');

  const timeline = await loadTimeline(projectId);
  const manjuData = exportToManjuDSL(project, characters, scenes, shots, timeline || undefined);

  const projectPath = await getProjectPath(projectId);
  const exportPath = `${projectPath}/exports/${project.title}.manju.json`;
  await electronService.fs.writeFile(exportPath, JSON.stringify(manjuData, null, 2));

  return exportPath;
}

/**
 * 从 .manju.json 文件导入项目
 */
export async function importProjectFromManjuFile(filePath: string): Promise<ProjectMeta | null> {
  if (!electronService.isElectron()) return null;

  const content = await electronService.fs.readFile(filePath);
  const manjuData = JSON.parse(content);

  if (!validateManjuProject(manjuData)) {
    throw new Error('无效的 Manju-DSL 文件');
  }

  const imported = importFromManjuDSL(manjuData);

  // 创建新项目目录
  const projectId = imported.project.id;
  const projectPath = await getProjectPath(projectId);

  await electronService.fs.mkdir(projectPath);
  await electronService.fs.mkdir(`${projectPath}/assets/images`);
  await electronService.fs.mkdir(`${projectPath}/assets/videos`);
  await electronService.fs.mkdir(`${projectPath}/assets/audio`);
  await electronService.fs.mkdir(`${projectPath}/assets/fonts`);
  await electronService.fs.mkdir(`${projectPath}/shots`);
  await electronService.fs.mkdir(`${projectPath}/cache/thumbnails`);
  await electronService.fs.mkdir(`${projectPath}/cache/waveforms`);
  await electronService.fs.mkdir(`${projectPath}/cache/previews`);
  await electronService.fs.mkdir(`${projectPath}/exports`);
  await electronService.fs.mkdir(`${projectPath}/temp`);

  // 保存项目元数据
  await electronService.fs.writeFile(
    `${projectPath}/project.json`,
    JSON.stringify(imported.project, null, 2)
  );

  // 保存时间线
  if (imported.timeline) {
    await electronService.fs.writeFile(
      `${projectPath}/timeline.json`,
      JSON.stringify(imported.timeline, null, 2)
    );
  }

  // 保存角色、场景、分镜数据
  await electronService.fs.writeFile(
    `${projectPath}/characters.json`,
    JSON.stringify(imported.characters, null, 2)
  );
  await electronService.fs.writeFile(
    `${projectPath}/scenes.json`,
    JSON.stringify(imported.scenes, null, 2)
  );
  await electronService.fs.writeFile(
    `${projectPath}/shots.json`,
    JSON.stringify(imported.shots, null, 2)
  );

  // 添加到最近项目
  await addRecentProject({
    id: projectId,
    title: imported.project.title,
    path: projectPath,
    lastOpened: Date.now(),
  });

  return imported.project;
}

// 加载角色数据
export async function loadCharacters(projectId: string): Promise<Character[]> {
  if (!electronService.isElectron()) return [];
  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(`${projectPath}/characters.json`);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// 保存角色数据
export async function saveCharacters(projectId: string, characters: Character[]): Promise<void> {
  if (!electronService.isElectron()) return;
  const projectPath = await getProjectPath(projectId);
  await electronService.fs.writeFile(
    `${projectPath}/characters.json`,
    JSON.stringify(characters, null, 2)
  );
}

// 加载场景数据
export async function loadScenes(projectId: string): Promise<Scene[]> {
  if (!electronService.isElectron()) return [];
  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(`${projectPath}/scenes.json`);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// 保存场景数据
export async function saveScenes(projectId: string, scenes: Scene[]): Promise<void> {
  if (!electronService.isElectron()) return;
  const projectPath = await getProjectPath(projectId);
  await electronService.fs.writeFile(
    `${projectPath}/scenes.json`,
    JSON.stringify(scenes, null, 2)
  );
}

// 加载分镜数据
export async function loadShots(projectId: string): Promise<Shot[]> {
  if (!electronService.isElectron()) return [];
  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(`${projectPath}/shots.json`);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// 保存分镜数据
export async function saveShots(projectId: string, shots: Shot[]): Promise<void> {
  if (!electronService.isElectron()) return;
  const projectPath = await getProjectPath(projectId);
  await electronService.fs.writeFile(
    `${projectPath}/shots.json`,
    JSON.stringify(shots, null, 2)
  );
}
