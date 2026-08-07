/**
 * 项目/剧集/角色/场景/道具/分镜/灵绘实体 CRUD 与项目导入导出
 * （从 electronService.ts 拆出；makeEntityCrud 工厂按前缀生成 IPC 调用）
 */
import { getElectronAPI } from './core';
import type { MediaOwnerRef, StoredMediaAsset } from '../../types';
import type { ProjectMeta, ExportOptions } from './types';

// ========== 项目 CRUD ==========

export const projectSetStorageRoot = async (rootPath: string): Promise<{ success: boolean; rootPath: string }> => {
  const api = getElectronAPI();
  if (api) {
    return await api.project.setStorageRoot(rootPath);
  }
  return { success: true, rootPath };
};

export const projectList = async (): Promise<ProjectMeta[]> => {
  const api = getElectronAPI();
  if (api) {
    const result = await api.project.list();
    return Array.isArray(result) ? result : [];
  }
  // 浏览器 fallback: 返回空列表
  return [];
};

export const projectCreate = async (meta: ProjectMeta): Promise<ProjectMeta> => {
  const api = getElectronAPI();
  if (api) {
    return await api.project.create(meta);
  }
  throw new Error('Project creation not available in browser');
};

export const projectLoad = async (projectId: string): Promise<ProjectMeta> => {
  const api = getElectronAPI();
  if (api) {
    return await api.project.load(projectId);
  }
  throw new Error('Project loading not available in browser');
};

export const projectSave = async (projectId: string, data: any): Promise<{ success: boolean }> => {
  const api = getElectronAPI();
  if (api) {
    return await api.project.save(projectId, data);
  }
  throw new Error('Project save not available in browser');
};

export const projectUpdate = async (projectId: string, updates: Partial<ProjectMeta>): Promise<ProjectMeta> => {
  const api = getElectronAPI();
  if (api) {
    return await api.project.update(projectId, updates);
  }
  throw new Error('Project update not available in browser');
};

export const projectDelete = async (projectId: string): Promise<{ success: boolean }> => {
  const api = getElectronAPI();
  if (api) {
    return await api.project.remove(projectId);
  }
  throw new Error('Project deletion not available in browser');
};

export const projectRebuildIndex = async (): Promise<any> => {
  const api = getElectronAPI();
  if (api) {
    return await api.project.rebuildIndex();
  }
  throw new Error('Project index rebuild not available in browser');
};

export const projectLoadFull = async (projectId: string): Promise<any> => {
  const api = getElectronAPI();
  if (api) {
    return await api.project.loadFull(projectId);
  }
  throw new Error('Project loadFull not available in browser');
};

export const projectBindOwnerRefMedia = async (
  projectId: string,
  ownerRef: MediaOwnerRef,
  asset: StoredMediaAsset,
): Promise<{ success: boolean }> => {
  const api = getElectronAPI();
  if (api) {
    return await api.project.bindOwnerRefMedia(projectId, ownerRef, asset);
  }
  throw new Error('Project bindOwnerRefMedia not available in browser');
};

// ========== 批量实体操作（通过 IPC 调后端，匹配前端 save/load 模式） ==========

export const batchApi = {
  saveAllCharacters: async (projectId: string, items: any[]) => {
    const a = getElectronAPI(); if (!a) return;
    await (a.project as any).saveAllCharacters(projectId, items);
  },
  loadAllCharacters: async (projectId: string): Promise<any[]> => {
    const a = getElectronAPI(); if (!a) return [];
    return await (a.project as any).loadAllCharacters(projectId) ?? [];
  },
  saveAllScenes: async (projectId: string, items: any[]) => {
    const a = getElectronAPI(); if (!a) return;
    await (a.project as any).saveAllScenes(projectId, items);
  },
  loadAllScenes: async (projectId: string): Promise<any[]> => {
    const a = getElectronAPI(); if (!a) return [];
    return await (a.project as any).loadAllScenes(projectId) ?? [];
  },
  saveAllProps: async (projectId: string, items: any[]) => {
    const a = getElectronAPI(); if (!a) return;
    await (a.project as any).saveAllProps(projectId, items);
  },
  loadAllProps: async (projectId: string): Promise<any[]> => {
    const a = getElectronAPI(); if (!a) return [];
    return await (a.project as any).loadAllProps(projectId) ?? [];
  },
  saveAllShots: async (projectId: string, items: any[]) => {
    const a = getElectronAPI(); if (!a) return;
    await (a.project as any).saveAllShots(projectId, items);
  },
  loadAllShots: async (projectId: string): Promise<any[]> => {
    const a = getElectronAPI(); if (!a) return [];
    return await (a.project as any).loadAllShots(projectId) ?? [];
  },
  saveShotMeta: async (projectId: string, shotId: string, meta: any) => {
    const a = getElectronAPI(); if (!a) return;
    await (a.project as any).saveShotMeta(projectId, shotId, meta);
  },
  loadShotMeta: async (projectId: string, shotId: string): Promise<any | null> => {
    const a = getElectronAPI(); if (!a) return null;
    return await (a.project as any).loadShotMeta(projectId, shotId) ?? null;
  },
  listShotMetas: async (projectId: string): Promise<any[]> => {
    const a = getElectronAPI(); if (!a) return [];
    return await (a.project as any).listShotMetas(projectId) ?? [];
  },
  saveAnalysis: async (projectId: string, episodeId: string, analysis: any) => {
    const a = getElectronAPI(); if (!a) return;
    await (a.project as any).saveAnalysis(projectId, episodeId, analysis);
  },
  loadAnalysis: async (projectId: string, episodeId: string): Promise<any | null> => {
    const a = getElectronAPI(); if (!a) return null;
    return await (a.project as any).loadAnalysis(projectId, episodeId) ?? null;
  },
  saveProjectTimeline: async (projectId: string, timeline: any) => {
    const a = getElectronAPI(); if (!a) return;
    await (a.project as any).saveProjectTimeline(projectId, timeline);
  },
  loadProjectTimeline: async (projectId: string): Promise<any | null> => {
    const a = getElectronAPI(); if (!a) return null;
    return await (a.project as any).loadProjectTimeline(projectId) ?? null;
  },
  saveEpisodeTimeline: async (projectId: string, episodeId: string, timeline: any) => {
    const a = getElectronAPI(); if (!a) return;
    await (a.project as any).saveEpisodeTimeline(projectId, episodeId, timeline);
  },
  loadEpisodeTimeline: async (projectId: string, episodeId: string): Promise<any | null> => {
    const a = getElectronAPI(); if (!a) return null;
    return await (a.project as any).loadEpisodeTimeline(projectId, episodeId) ?? null;
  },
};

// ========== 实体 CRUD（通过 IPC 调后端） ==========

const makeEntityCrud = (prefix: string) => {
  const api = () => getElectronAPI();
  return {
    list: async (projectId: string) => {
      const a = api(); if (!a) return [];
      return await (a.project as any)[`${prefix}List`](projectId);
    },
    get: async (id: string) => {
      const a = api(); if (!a) return undefined;
      return await (a.project as any)[`${prefix}Get`](id);
    },
    create: async (data: any) => {
      const a = api(); if (!a) throw new Error('Not available');
      return await (a.project as any)[`${prefix}Create`](data);
    },
    update: async (id: string, data: any) => {
      const a = api(); if (!a) throw new Error('Not available');
      return await (a.project as any)[`${prefix}Update`](id, data);
    },
    delete: async (id: string) => {
      const a = api(); if (!a) throw new Error('Not available');
      return await (a.project as any)[`${prefix}Delete`](id);
    },
  };
};

export const characterApi = makeEntityCrud('character');
export const sceneApi = makeEntityCrud('scene');
export const propApi = makeEntityCrud('prop');
export const episodeApi = makeEntityCrud('episode');

export const shotApi = {
  ...makeEntityCrud('shot'),
  listVersions: async (shotId: string) => {
    const a = getElectronAPI(); if (!a) return [];
    return await (a.project as any).shotVersionList(shotId);
  },
  createVersion: async (data: any) => {
    const a = getElectronAPI(); if (!a) throw new Error('Not available');
    return await (a.project as any).shotVersionCreate(data);
  },
  deleteVersion: async (id: string) => {
    const a = getElectronAPI(); if (!a) throw new Error('Not available');
    return await (a.project as any).shotVersionDelete(id);
  },
  setVersion: async (shotId: string, versionNumber: number) => {
    const a = getElectronAPI(); if (!a) throw new Error('Not available');
    return await (a.project as any).shotSetVersion(shotId, versionNumber);
  },
};

export const assetApi = {
  ...makeEntityCrud('asset'),
  findByFingerprint: async (projectId: string, fingerprint: string) => {
    const a = getElectronAPI(); if (!a) return undefined;
    return await (a.project as any).assetFindByFingerprint(projectId, fingerprint);
  },
  listUnreferenced: async (projectId: string) => {
    const a = getElectronAPI(); if (!a) return [];
    return await (a.project as any).assetListUnreferenced(projectId);
  },
};

export const timelineApi = {
  get: async (projectId: string) => {
    const a = getElectronAPI(); if (!a) return undefined;
    return await (a.project as any).timelineGet(projectId);
  },
  update: async (id: string, data: any) => {
    const a = getElectronAPI(); if (!a) throw new Error('Not available');
    return await (a.project as any).timelineUpdate(id, data);
  },
  addTrack: async (data: any) => {
    const a = getElectronAPI(); if (!a) throw new Error('Not available');
    return await (a.project as any).trackAdd(data);
  },
  updateTrack: async (id: string, data: any) => {
    const a = getElectronAPI(); if (!a) throw new Error('Not available');
    return await (a.project as any).trackUpdate(id, data);
  },
  deleteTrack: async (id: string) => {
    const a = getElectronAPI(); if (!a) throw new Error('Not available');
    return await (a.project as any).trackDelete(id);
  },
  addClip: async (data: any) => {
    const a = getElectronAPI(); if (!a) throw new Error('Not available');
    return await (a.project as any).clipAdd(data);
  },
  updateClip: async (id: string, data: any) => {
    const a = getElectronAPI(); if (!a) throw new Error('Not available');
    return await (a.project as any).clipUpdate(id, data);
  },
  deleteClip: async (id: string) => {
    const a = getElectronAPI(); if (!a) throw new Error('Not available');
    return await (a.project as any).clipDelete(id);
  },
};

export const linghuiApi = {
  listWorkspaces: async () => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.listWorkspaces();
  },
  loadWorkspace: async (workspaceId: string) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.loadWorkspace(workspaceId);
  },
  saveWorkspace: async (doc: any) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.saveWorkspace(doc);
  },
  createWorkspace: async (name?: string) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.createWorkspace(name);
  },
  saveWorkspaceAs: async (doc: any, name?: string) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.saveWorkspaceAs(doc, name);
  },
  deleteWorkspace: async (workspaceId: string) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.deleteWorkspace(workspaceId);
  },
  importWorkspace: async (filePath: string) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.importWorkspace(filePath);
  },
  exportWorkspace: async (doc: any, destPath: string) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.exportWorkspace(doc, destPath);
  },
  getWorkspaceDir: async (workspaceId: string) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    const result = await a.linghui.getWorkspaceDir(workspaceId);
    return typeof result === 'object' && result !== null && 'path' in result
      ? (result as { path: string }).path
      : (result as string);
  },
  listWorkflowTemplates: async (workspaceId: string) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.listWorkflowTemplates(workspaceId);
  },
  createWorkflowTemplate: async (payload: any) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.createWorkflowTemplate(payload);
  },
  listWorkspaceAssets: async (workspaceId: string) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.listWorkspaceAssets(workspaceId);
  },
  createWorkspaceAsset: async (payload: any) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.createWorkspaceAsset(payload);
  },
  syncProductionAssets: async (payload: any) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.syncProductionAssets(payload);
  },
  listWorkspaceHistoryRecords: async (workspaceId: string) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.listWorkspaceHistoryRecords(workspaceId);
  },
  createWorkspaceHistoryRecord: async (payload: any) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.createWorkspaceHistoryRecord(payload);
  },
  importWorkspaceAsset: async (workspaceId: string, sourcePath: string, filenameHint?: string) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    const result = await a.linghui.importWorkspaceAsset(workspaceId, sourcePath, filenameHint);
    return typeof result === 'object' && result !== null && 'path' in result
      ? (result as { path: string }).path
      : (result as string);
  },

  // 全局资产库（C-5B）
  listGlobalAssets: async (kind?: 'character' | 'prop') => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.listGlobalAssets(kind ? { kind } : undefined);
  },
  upsertGlobalAsset: async (payload: {
    id?: string;
    kind: 'character' | 'prop';
    label: string;
    hint?: string;
    promptHint?: string;
    color?: string;
    scale?: number;
    posePreset?: string;
    propType?: string;
    category?: string;
    favorite?: boolean;
    referenceImages?: string[];
  }) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.upsertGlobalAsset(payload);
  },
  deleteGlobalAsset: async (id: string) => {
    const a = getElectronAPI();
    if (!a?.linghui) throw new Error('Linghui API not available');
    return await a.linghui.deleteGlobalAsset({ id });
  },
};

// ========== 项目导入导出 ==========

export const projectExport = async (
  projectId: string,
  destPath: string,
  options?: ExportOptions
): Promise<{ success: boolean; path: string }> => {
  const api = getElectronAPI();
  if (api) {
    return await api.project.export(projectId, destPath, options);
  }
  throw new Error('Project export not available in browser');
};

export const projectImport = async (
  zipPath: string,
  newProjectId?: string
): Promise<{ success: boolean; projectId: string; meta: any }> => {
  const api = getElectronAPI();
  if (api) {
    return await api.project.import(zipPath, newProjectId);
  }
  throw new Error('Project import not available in browser');
};

// 导出服务对象
