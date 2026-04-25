import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { TaskManager } from './TaskManager';

const ROOT_PATH = '/tmp/koma-task-manager-tests';
const PROJECT_ID = 'project-1';
const TASKS_PATH = `${ROOT_PATH}/projects/${PROJECT_ID}/background-tasks.json`;

describe('TaskManager restart reconciliation', () => {
  const files = new Map<string, string>();

  beforeEach(() => {
    files.clear();
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
      project: {},
    };
  });

  afterEach(() => {
    TaskManager.dispose();
    localStorage.clear();
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
  });

  it.each(['pending', 'running', 'processing'] as const)(
    'marks %s script-analysis tasks from a previous launch as failed on initialize',
    async (status) => {
      files.set(TASKS_PATH, JSON.stringify({
        tasks: [
          {
            id: `old-${status}`,
            projectId: PROJECT_ID,
            type: 'script-analysis',
            category: 'script',
            subType: 'script-analysis',
            status,
            progress: 17,
            targetType: 'episode',
            targetId: 'episode-1',
            createdAt: 1,
            updatedAt: 2,
            lastHeartbeat: 2,
          },
        ],
        updatedAt: 2,
      }, null, 2));

      await TaskManager.initialize(PROJECT_ID);

      const task = TaskManager.getTask(`old-${status}`);
      expect(task?.status).toBe('failed');
      expect(task?.error).toBe('任务在软件重启后中断');

      const persisted = JSON.parse(files.get(TASKS_PATH) || '{}');
      expect(persisted.tasks?.[0]?.status).toBe('failed');
      expect(persisted.tasks?.[0]?.error).toBe('任务在软件重启后中断');
    }
  );

  it('keeps unfinished tasks created in the current renderer session when re-initializing', async () => {
    const created = TaskManager.createTask({
      projectId: PROJECT_ID,
      type: 'script-analysis',
      targetType: 'episode',
      targetId: 'episode-1',
      targetName: '第 1 集',
    });
    const sessionId = TaskManager.getTask(created.id)?.sessionId;
    expect(sessionId).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 0));

    files.set(TASKS_PATH, JSON.stringify({
      tasks: [
        {
          id: created.id,
          projectId: PROJECT_ID,
          sessionId,
          type: 'script-analysis',
          category: 'script',
          subType: 'script-analysis',
          status: 'running',
          progress: 42,
          targetType: 'episode',
          targetId: 'episode-1',
          targetName: '第 1 集',
          createdAt: 1,
          updatedAt: 2,
          lastHeartbeat: 2,
        },
      ],
      updatedAt: 2,
    }, null, 2));

    TaskManager.dispose();

    await TaskManager.initialize(PROJECT_ID);

    const reloaded = TaskManager.getTask(created.id);
    expect(reloaded?.sessionId).toBe(sessionId);
    expect(reloaded?.status).toBe('running');
    expect(reloaded?.progress).toBe(42);
  });
});
