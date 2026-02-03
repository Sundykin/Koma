/**
 * Project Store 统一导出
 */

// 核心 (使用动态导入以支持代码分割，避免与 manju.ts 动态导入冲突)
export type { ProjectMeta } from '../../types';

export const getProjectsRoot = async (): Promise<string> => {
  const { getProjectsRoot: fn } = await import('./core');
  return fn();
};

export const getProjectPath = async (projectId: string): Promise<string> => {
  const { getProjectPath: fn } = await import('./core');
  return fn(projectId);
};

export const createProject = async (
  title: string,
  genre: string,
  mode: 'drama' | 'narration',
  llmConfigId?: string
) => {
  const { createProject: fn } = await import('./core');
  return fn(title, genre, mode, llmConfigId);
};

export const loadProject = async (projectId: string) => {
  const { loadProject: fn } = await import('./core');
  return fn(projectId);
};

export const saveProject = async (project: any) => {
  const { saveProject: fn } = await import('./core');
  return fn(project);
};

export const updateProjectLLMConfig = async (
  projectId: string,
  llmConfigId: string | null
) => {
  const { updateProjectLLMConfig: fn } = await import('./core');
  return fn(projectId, llmConfigId);
};

export const deleteProject = async (projectId: string) => {
  const { deleteProject: fn } = await import('./core');
  return fn(projectId);
};

export const listProjects = async () => {
  const { listProjects: fn } = await import('./core');
  return fn();
};

// 时间线 (使用动态导入以支持代码分割)
export type { Timeline } from '../../types';
export const loadTimeline = async (projectId: string) => {
  const { loadTimeline: load } = await import('./timeline');
  return load(projectId);
};
export const saveTimeline = async (projectId: string, timeline: any) => {
  const { saveTimeline: save } = await import('./timeline');
  return save(projectId, timeline);
};

// 素材管理
export {
  importAsset,
  loadAssets,
  findDuplicateAsset,
  incrementAssetRef,
  decrementAssetRef,
  getUnusedAssets,
  cleanUnusedAssets,
} from './assets';

// 分镜版本
export {
  saveShotVersion,
  loadShotMeta,
  listShots,
  getShotVersionHistory,
} from './shots';

// 剧集管理
export {
  createEpisode,
  loadEpisode,
  saveEpisode,
  deleteEpisode,
  listEpisodes,
} from './episodes';

// 剧集解析结果
export {
  saveEpisodeAnalysis,
  loadEpisodeAnalysis,
  loadEpisodeShots,
  saveEpisodeShots,
  loadEpisodeTimeline,
  saveEpisodeTimeline,
  updateShot,
  deleteEpisodeAnalysis,
} from './analysis';

// 角色/场景/道具存储
export {
  saveCharacterCostumePhoto,
  saveCharacterPreviewVideo,
  saveSceneImage,
  savePropImage,
  loadProps,
  saveProps,
  switchShotVersion,
  deleteShotVersion,
} from './assetStorage';

// 实体加载/保存
export {
  loadCharacters,
  saveCharacters,
  loadScenes,
  saveScenes,
  loadShots,
  saveShots,
} from './entities';

// 资产引用
export {
  calculateAssetFingerprint,
  addCharacterEpisodeRef,
  removeCharacterEpisodeRef,
  addSceneEpisodeRef,
  removeSceneEpisodeRef,
  addPropEpisodeRef,
  removePropEpisodeRef,
  findCharacterByName,
  findSceneByName,
  findPropByName,
  getOrphanedAssets,
} from './refs';

// 缓存管理
export type { CacheStats } from './cache';
export {
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
} from './cache';

// 临时文件
export {
  createTempFile,
  cleanAllTempOnStartup,
} from './temp';

// Manju-DSL
export {
  saveProjectAsManju,
  loadProjectFromManju,
  exportProjectToManjuFile,
  importProjectFromManjuFile,
} from './manju';
export type { ManjuProject } from '../../manju-dsl/protocol';
