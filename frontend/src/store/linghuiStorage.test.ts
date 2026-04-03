import { beforeEach, describe, expect, it } from 'vitest';
import {
  createLinghuiWorkspace,
  createLinghuiWorkspaceHistoryRecord,
  deleteLinghuiWorkspace,
  listLinghuiWorkspaces,
  loadLinghuiWorkspace,
} from './linghuiStorage';
import { DEFAULT_LINGHUI_WORKSPACE_NAME, getLinghuiResultPrimaryMedia } from '../types/linghui';
import { STORAGE_KEYS } from '../constants/storageKeys';

describe('linghuiStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
  });

  it('为空工作区名称回退到未命名灵绘', async () => {
    const workspace = await createLinghuiWorkspace('   ');

    expect(workspace.name).toBe(DEFAULT_LINGHUI_WORKSPACE_NAME);
  });

  it('删除工作区时会清理索引与关联的历史数据键', async () => {
    const workspace = await createLinghuiWorkspace('测试灵绘');

    window.localStorage.setItem(`koma.linghui.doc.workflow-index.${workspace.id}`, JSON.stringify([{ id: 'wf-1' }]));
    window.localStorage.setItem(`koma.linghui.doc.history-index.${workspace.id}`, JSON.stringify([{ id: 'history-1' }]));
    window.localStorage.setItem(`koma.linghui.doc.asset-index.${workspace.id}`, JSON.stringify([{ id: 'asset-1' }]));

    await deleteLinghuiWorkspace(workspace.id);

    expect(await listLinghuiWorkspaces()).toEqual([]);
    expect(await loadLinghuiWorkspace(workspace.id)).toBeNull();
    expect(window.localStorage.getItem(`koma.linghui.doc.workflow-index.${workspace.id}`)).toBeNull();
    expect(window.localStorage.getItem(`koma.linghui.doc.history-index.${workspace.id}`)).toBeNull();
    expect(window.localStorage.getItem(`koma.linghui.doc.asset-index.${workspace.id}`)).toBeNull();
  });

  it('会把远端视频历史结果物化到灵绘工作区本地文件', async () => {
    const rootPath = '/tmp/koma-test';
    const files = new Map<string, string>();
    const downloads: Array<{ url: string; destPath: string }> = [];

    window.localStorage.setItem(
      STORAGE_KEYS.STORAGE_CONFIG,
      JSON.stringify({ rootPath, version: 1 }),
    );

    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      fs: {
        readFile: async (path: string) => ({ content: files.get(path) ?? '' }),
        readFileAsBase64: async () => ({ base64: '' }),
        writeFile: async (path: string, data: string) => {
          files.set(path, data);
        },
        downloadFile: async (url: string, destPath: string) => {
          downloads.push({ url, destPath });
          files.set(destPath, `downloaded:${url}`);
          return { success: true, size: 1 };
        },
        exists: async (path: string) => ({ exists: files.has(path) }),
        mkdir: async () => {},
        readdir: async () => ({ files: [] }),
        stat: async () => null,
        remove: async () => {},
        copy: async (src: string, dest: string) => {
          files.set(dest, files.get(src) ?? '');
        },
      },
      app: {
        getPath: async () => ({ path: '/tmp' }),
        getVersion: async () => ({ version: '1.0.0' }),
      },
      dialog: {
        openFile: async () => ({ canceled: true, filePaths: [] }),
        openDirectory: async () => ({ canceled: true, filePaths: [] }),
        saveFile: async () => ({ canceled: true }),
      },
      window: {
        minimize: async () => {},
        maximize: async () => {},
        close: async () => {},
        isMaximized: async () => false,
      },
      shell: {
        openExternal: async () => {},
        showItemInFolder: async () => {},
      },
      project: {
        list: async () => [],
        create: async () => { throw new Error('not implemented'); },
        load: async () => { throw new Error('not implemented'); },
        save: async () => ({ success: true }),
        update: async () => { throw new Error('not implemented'); },
        remove: async () => ({ success: true }),
        rebuildIndex: async () => ({}),
        export: async () => ({ success: true, path: '' }),
        import: async () => ({ success: true, projectId: '', meta: {} }),
      },
    };

    const result = await createLinghuiWorkspaceHistoryRecord({
      workspaceId: 'workspace-1',
      nodeId: 'video-node-1',
      nodeData: {
        linghuiType: 'linghui/video',
        label: '视频',
        accent: '#22c55e',
        background: '#0f1720',
        properties: {
          prompt: '猫咪懒洋洋地起床',
        },
        inputs: [],
        outputs: [],
        active: false,
      },
      nodeRun: {
        status: 'succeeded',
        updatedAt: 1774838708788,
        result: {
          kind: 'video',
          primary: {
            kind: 'video',
            source: 'https://example.com/video.mp4',
            posterSource: 'https://example.com/poster.png',
          },
        },
      },
    });

    expect(downloads).toEqual([
      {
        url: 'https://example.com/video.mp4',
        destPath: `${rootPath}/linghui-workspaces/workspace-1/history/results/video/1774838708788-视频-${result.record.id}/video.mp4`,
      },
      {
        url: 'https://example.com/poster.png',
        destPath: `${rootPath}/linghui-workspaces/workspace-1/history/results/video/1774838708788-视频-${result.record.id}/poster.png`,
      },
    ]);
    expect(result.record.source).toBe(
      `${rootPath}/linghui-workspaces/workspace-1/history/results/video/1774838708788-视频-${result.record.id}/video.mp4`,
    );
    expect(getLinghuiResultPrimaryMedia(result.materializedRun?.result)?.source).toBe(result.record.source);
    expect(getLinghuiResultPrimaryMedia(result.materializedRun?.result)?.posterSource).toBe(result.record.posterSource);
    expect(files.has(result.record.snapshotPath)).toBe(true);
  });
});
