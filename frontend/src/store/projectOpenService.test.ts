import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../constants/storageKeys';
import type { AsyncTask } from '../types';
import {
  deletePendingMediaTasks,
  failPendingMediaTasks,
  inspectPendingMediaTasks,
  onProjectOpen,
  USER_INTERRUPTED_REASON,
} from './projectOpenService';
import { listTasks, __resetTaskQueueCacheForTesting } from './taskQueueStore';
import { configureLogger } from './logger';

const ROOT_PATH = '/tmp/koma-project-open-service-tests';
const PROJECT_ID = 'project-1';
const TASKS_PATH = `${ROOT_PATH}/projects/${PROJECT_ID}/tasks.json`;

const files = new Map<string, string>();

function buildTask(overrides: Partial<AsyncTask> & Pick<AsyncTask, 'id' | 'type' | 'status'>): AsyncTask {
  return {
    id: overrides.id,
    projectId: PROJECT_ID,
    type: overrides.type,
    targetType: overrides.targetType || 'shot',
    targetId: overrides.targetId || `${overrides.id}-target`,
    targetName: overrides.targetName || overrides.id,
    remoteTaskId: overrides.remoteTaskId || `${overrides.id}-remote`,
    status: overrides.status,
    progress: overrides.progress ?? 0,
    retryCount: overrides.retryCount ?? 0,
    maxRetries: overrides.maxRetries ?? 3,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    ...overrides,
  };
}

function seedTasks(tasks: AsyncTask[]): void {
  files.set(TASKS_PATH, JSON.stringify({ tasks, version: 1 }, null, 2));
}

function readPersistedTasks(): AsyncTask[] {
  return JSON.parse(files.get(TASKS_PATH) || '{"tasks":[]}').tasks || [];
}

describe('projectOpenService pending media task handling', () => {
  beforeEach(() => {
    configureLogger({ enableFile: false });
    files.clear();
    __resetTaskQueueCacheForTesting();
    localStorage.clear();
    localStorage.setItem(STORAGE_KEYS.STORAGE_CONFIG, JSON.stringify({
      rootPath: ROOT_PATH,
      version: 1,
    }));

    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      fs: {
        exists: vi.fn(async (path: string) => files.has(path)),
        readFile: vi.fn(async (path: string) => files.get(path) ?? ''),
        readFileAsBase64: vi.fn(async () => ''),
        writeFile: vi.fn(async (path: string, data: string) => {
          files.set(path, data);
        }),
        downloadFile: vi.fn(async () => ({ success: true, size: 0 })),
        mkdir: vi.fn(async () => {}),
        readdir: vi.fn(async () => []),
        stat: vi.fn(async () => ({
          size: 0,
          isDirectory: false,
          isFile: true,
          createdAt: 0,
          modifiedAt: 0,
        })),
        remove: vi.fn(async () => {}),
        copy: vi.fn(async () => {}),
      },
      app: {
        getPath: vi.fn(async () => '/tmp'),
        getVersion: vi.fn(async () => '1.0.0'),
      },
      window: {
        minimize: vi.fn(async () => {}),
        maximize: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        isMaximized: vi.fn(async () => false),
      },
      dialog: {
        openFile: vi.fn(async () => ({ canceled: true, filePaths: [] })),
        openDirectory: vi.fn(async () => ({ canceled: true, filePaths: [] })),
        saveFile: vi.fn(async () => ({ canceled: true, filePath: undefined })),
      },
      shell: {
        openExternal: vi.fn(async () => {}),
        showItemInFolder: vi.fn(async () => {}),
      },
      project: {
        load: vi.fn(async () => ({ id: PROJECT_ID, mediaSelections: {} })),
      },
    };
  });

  afterEach(() => {
    configureLogger({ enableFile: true });
    localStorage.clear();
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
  });

  it('inspects only pending and processing media tasks', async () => {
    seedTasks([
      buildTask({ id: 'pending-tti', type: 'tti', status: 'pending', createdAt: 4 }),
      buildTask({ id: 'processing-itv', type: 'itv', status: 'processing', createdAt: 3 }),
      buildTask({ id: 'completed-tts', type: 'tts', status: 'completed', createdAt: 2 }),
      buildTask({ id: 'failed-itv', type: 'itv', status: 'failed', createdAt: 1 }),
      buildTask({ id: 'legacy-non-media', type: 'script-analysis' as AsyncTask['type'], status: 'pending', createdAt: 5 }),
    ]);

    const pending = await inspectPendingMediaTasks(PROJECT_ID);

    expect(pending.map(task => task.id)).toEqual(['pending-tti', 'processing-itv']);
  });

  it('does not auto recover or mutate pending media tasks on project open', async () => {
    seedTasks([
      buildTask({ id: 'pending-tti', type: 'tti', status: 'pending' }),
      buildTask({ id: 'processing-itv', type: 'itv', status: 'processing' }),
    ]);

    await onProjectOpen(PROJECT_ID);

    expect(readPersistedTasks().map(task => [task.id, task.status])).toEqual([
      ['pending-tti', 'pending'],
      ['processing-itv', 'processing'],
    ]);
  });

  it('marks inspected pending media tasks as failed with the user interruption reason', async () => {
    seedTasks([
      buildTask({ id: 'pending-tti', type: 'tti', status: 'pending', retryCount: 0 }),
      buildTask({ id: 'processing-itv', type: 'itv', status: 'processing', retryCount: 1 }),
      buildTask({ id: 'completed-tts', type: 'tts', status: 'completed' }),
    ]);

    const pending = await inspectPendingMediaTasks(PROJECT_ID);
    const failedCount = await failPendingMediaTasks(PROJECT_ID, pending, USER_INTERRUPTED_REASON);

    expect(failedCount).toBe(2);

    const tasks = await listTasks(PROJECT_ID);
    const failedById = new Map(tasks.map(task => [task.id, task]));
    expect(failedById.get('pending-tti')).toEqual(expect.objectContaining({
      status: 'failed',
      error: USER_INTERRUPTED_REASON,
      retryCount: 1,
    }));
    expect(failedById.get('processing-itv')).toEqual(expect.objectContaining({
      status: 'failed',
      error: USER_INTERRUPTED_REASON,
      retryCount: 2,
    }));
    expect(failedById.get('completed-tts')?.status).toBe('completed');
  });

  it('deletes only the selected local pending media task records', async () => {
    seedTasks([
      buildTask({ id: 'pending-tti', type: 'tti', status: 'pending' }),
      buildTask({ id: 'processing-itv', type: 'itv', status: 'processing' }),
      buildTask({ id: 'completed-tts', type: 'tts', status: 'completed' }),
    ]);

    const pending = await inspectPendingMediaTasks(PROJECT_ID);
    const deletedCount = await deletePendingMediaTasks(PROJECT_ID, pending);

    expect(deletedCount).toBe(2);
    expect(readPersistedTasks().map(task => task.id)).toEqual(['completed-tts']);
  });
});
