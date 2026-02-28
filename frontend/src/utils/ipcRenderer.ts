/**
 * Frontend IPC utilities
 * Uses typed preload API (electronAPI.persistence.*) instead of raw rpc.invoke
 */
import { getElectronAPI as getBaseElectronAPI } from '../services/electronService';

export type PersistenceEntity =
  | 'project'
  | 'episode'
  | 'episodeAnalysis'
  | 'episodeTimeline'
  | 'shot'
  | 'character'
  | 'scene'
  | 'prop'
  | 'timeline'
  | 'asset';

function getPersistenceAPI() {
  const api = getBaseElectronAPI() as any;
  if (!api?.persistence) {
    throw new Error('Electron persistence API is not available');
  }
  return api.persistence;
}

export const persistenceClient = {
  list: <T = any>(projectId: string, entity: PersistenceEntity) =>
    getPersistenceAPI().list(projectId, entity) as Promise<T[]>,
  find: <T = any>(projectId: string, entity: PersistenceEntity, query?: Record<string, unknown>) =>
    getPersistenceAPI().find(projectId, entity, query) as Promise<T[]>,
  findById: <T = any>(projectId: string, entity: PersistenceEntity, id: string) =>
    getPersistenceAPI().findById(projectId, entity, id) as Promise<T | null>,
  save: <T = any>(projectId: string, entity: PersistenceEntity, data: T | T[]) =>
    getPersistenceAPI().save(projectId, entity, data) as Promise<T | T[]>,
  delete: (projectId: string, entity: PersistenceEntity, id: string) =>
    getPersistenceAPI().delete(projectId, entity, id) as Promise<{ success: boolean }>,
  batchSave: (projectId: string, operations: Array<{ entity: PersistenceEntity; data: unknown }>) =>
    getPersistenceAPI().batchSave(projectId, operations) as Promise<{ success: boolean }>,
};

