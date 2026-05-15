import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./imageHostingService', () => {
  return {
    uploadBytesToImageHostingWithRetry: vi.fn(),
  };
});

vi.mock('./electronService', () => {
  const files = new Map<string, string>();
  const binaryFiles = new Map<string, string>();
  // 模拟 mtime/size 仓库：测试可以在 setup 阶段直接往里塞条目，
  // 用来验证 buildRemoteUrlSourceKey 是否把 mtime 附加进 cache key。
  const stats = new Map<string, { modifiedAt: number; size: number; isDirectory?: boolean }>();
  const exists = vi.fn(async (path: string) => files.has(path) || binaryFiles.has(path));
  const readFile = vi.fn(async (path: string) => files.get(path) || '');
  const readFileAsBase64 = vi.fn(async (path: string) => binaryFiles.get(path) || 'AA==');
  const writeFile = vi.fn(async (path: string, data: string) => {
    files.set(path, data);
  });
  const mkdir = vi.fn(async () => undefined);
  const stat = vi.fn(async (path: string) => stats.get(path) ?? null);
  return {
    electronService: {
      isElectron: () => true,
      diagnostics: {
        appendRendererLog: vi.fn(async () => ({ success: true })),
      },
      fs: {
        exists,
        readFile,
        readFileAsBase64,
        writeFile,
        mkdir,
        stat,
      },
    },
    __remoteUrlServiceTestFiles: files,
    __remoteUrlServiceTestBinaryFiles: binaryFiles,
    __remoteUrlServiceTestStats: stats,
    __remoteUrlServiceTestFsMocks: { exists, readFile, readFileAsBase64, writeFile, mkdir, stat },
  };
});

vi.mock('../store/project/core', () => ({
  getProjectPath: vi.fn(async (projectId: string) => `/tmp/${projectId}`),
}));

vi.mock('../utils/safeFetch', () => ({
  safeFetch: vi.fn(async () => new Response('', { status: 200 })),
}));

describe('mediaRemoteUrlService.ensureRemoteUrlForImageAsset', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const electronModule = await import('./electronService') as unknown as {
      __remoteUrlServiceTestFiles: Map<string, string>;
      __remoteUrlServiceTestBinaryFiles: Map<string, string>;
    };
    electronModule.__remoteUrlServiceTestFiles.clear();
    electronModule.__remoteUrlServiceTestBinaryFiles.clear();
    (electronModule as unknown as { __remoteUrlServiceTestStats: Map<string, unknown> })
      .__remoteUrlServiceTestStats.clear();

    const { safeFetch } = await import('../utils/safeFetch');
    vi.mocked(safeFetch).mockResolvedValue(new Response('', { status: 200 }));

    const { __resetMediaRemoteUrlCacheForTests } = await import('./mediaRemoteUrlService');
    __resetMediaRemoteUrlCacheForTests();
  });

  it('uploads data-url bytes and fills remoteUrl (best-effort success)', async () => {
    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');
    (uploadBytesToImageHostingWithRetry as any).mockResolvedValue({
      success: true,
      url: 'https://cdn.example.com/out.png',
    });

    const { ensureRemoteUrlForImageAsset } = await import('./mediaRemoteUrlService');

    const asset = await ensureRemoteUrlForImageAsset({
      projectId: 'p1',
      policy: 'best-effort',
      asset: {
        kind: 'image',
        localPath: 'data:image/png;base64,AA==',
        createdAt: 1,
      },
    });

    expect(asset.remoteUrl).toBe('https://cdn.example.com/out.png');
  });

  it('throws when upload fails and policy is required', async () => {
    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');
    (uploadBytesToImageHostingWithRetry as any).mockResolvedValue({
      success: false,
      error: 'nope',
    });

    const { ensureRemoteUrlForImageAsset } = await import('./mediaRemoteUrlService');

    await expect(
      ensureRemoteUrlForImageAsset({
        projectId: 'p1',
        policy: 'required',
        asset: {
          kind: 'image',
          localPath: 'data:image/png;base64,AA==',
          createdAt: 1,
        },
      })
    ).rejects.toThrow('nope');
  });

  it('uploads multiple image sources sequentially with unique filenames', async () => {
    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');
    const uploadMock = uploadBytesToImageHostingWithRetry as any;
    uploadMock
      .mockResolvedValueOnce({ success: true, url: 'https://cdn.example.com/1.png' })
      .mockResolvedValueOnce({ success: true, url: 'https://cdn.example.com/2.png' });

    const { ensureRemoteUrlForImageSources } = await import('./mediaRemoteUrlService');

    const result = await ensureRemoteUrlForImageSources({
      projectId: 'p1',
      policy: 'required',
      sources: [
        'data:image/jpeg;base64,AA==',
        'data:image/jpeg;base64,BB==',
      ],
    });

    expect(result).toEqual([
      'https://cdn.example.com/1.png',
      'https://cdn.example.com/2.png',
    ]);
    expect(uploadMock.mock.calls[0][1]).toEqual({ filename: 'image-1.jpg' });
    expect(uploadMock.mock.calls[1][1]).toEqual({ filename: 'image-2.jpg' });
  });

  it('dedupes repeated sources in one normalization batch', async () => {
    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');
    const uploadMock = uploadBytesToImageHostingWithRetry as any;
    uploadMock.mockResolvedValue({ success: true, url: 'https://cdn.example.com/shared.png' });

    const { ensureRemoteUrlForImageSources } = await import('./mediaRemoteUrlService');

    const result = await ensureRemoteUrlForImageSources({
      projectId: 'p1',
      policy: 'required',
      sources: [
        'data:image/jpeg;base64,AA==',
        'data:image/jpeg;base64,AA==',
      ],
    });

    expect(result).toEqual([
      'https://cdn.example.com/shared.png',
      'https://cdn.example.com/shared.png',
    ]);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it('reuses cached remote url when reachable', async () => {
    const electronModule = await import('./electronService') as unknown as {
      __remoteUrlServiceTestFiles: Map<string, string>;
    };
    electronModule.__remoteUrlServiceTestFiles.set(
      '/tmp/p1/metadata/media-remote-url-cache.json',
      JSON.stringify({
        version: 1,
        entries: {
          'local:/tmp/source.png': {
            sourceKey: 'local:/tmp/source.png',
            sourceKind: 'local-file',
            localPath: '/tmp/source.png',
            remoteUrl: 'https://cdn.example.com/cached.png',
            updatedAt: 1,
          },
        },
      }),
    );

    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');
    const { ensureRemoteUrlForImageSources } = await import('./mediaRemoteUrlService');

    const result = await ensureRemoteUrlForImageSources({
      projectId: 'p1',
      policy: 'required',
      sources: ['/tmp/source.png'],
    });

    expect(result).toEqual(['https://cdn.example.com/cached.png']);
    expect(uploadBytesToImageHostingWithRetry).not.toHaveBeenCalled();
  });

  it('prefers local-path cache over stale asset remoteUrl', async () => {
    const electronModule = await import('./electronService') as unknown as {
      __remoteUrlServiceTestFiles: Map<string, string>;
    };
    electronModule.__remoteUrlServiceTestFiles.set(
      '/tmp/p1/metadata/media-remote-url-cache.json',
      JSON.stringify({
        version: 1,
        entries: {
          'local:/tmp/asset.png': {
            sourceKey: 'local:/tmp/asset.png',
            sourceKind: 'asset',
            localPath: '/tmp/asset.png',
            remoteUrl: 'https://cdn.example.com/fresh.png',
            updatedAt: 1,
          },
        },
      }),
    );

    const { safeFetch } = await import('../utils/safeFetch');
    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');
    const { ensureRemoteUrlForImageAsset } = await import('./mediaRemoteUrlService');

    const result = await ensureRemoteUrlForImageAsset({
      projectId: 'p1',
      policy: 'required',
      asset: {
        kind: 'image',
        localPath: '/tmp/asset.png',
        remoteUrl: 'https://cdn.example.com/stale.png',
        createdAt: 1,
      },
    });

    expect(result.remoteUrl).toBe('https://cdn.example.com/fresh.png');
    expect(uploadBytesToImageHostingWithRetry).not.toHaveBeenCalled();
    expect(vi.mocked(safeFetch).mock.calls.map(call => call[0])).toEqual([
      'https://cdn.example.com/fresh.png',
    ]);
  });

  it('stores reachable asset remoteUrl in local-path cache', async () => {
    const electronModule = await import('./electronService') as unknown as {
      __remoteUrlServiceTestFiles: Map<string, string>;
    };
    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');
    const { ensureRemoteUrlForImageAsset } = await import('./mediaRemoteUrlService');

    const result = await ensureRemoteUrlForImageAsset({
      projectId: 'p1',
      policy: 'required',
      asset: {
        kind: 'image',
        localPath: '/tmp/asset.png',
        remoteUrl: 'https://cdn.example.com/original.png',
        createdAt: 1,
      },
    });

    expect(result.remoteUrl).toBe('https://cdn.example.com/original.png');
    expect(uploadBytesToImageHostingWithRetry).not.toHaveBeenCalled();
    expect(electronModule.__remoteUrlServiceTestFiles.get('/tmp/p1/metadata/media-remote-url-cache.json'))
      .toContain('https://cdn.example.com/original.png');
  });

  it('reuploads and updates cache when cached remote url is unreachable', async () => {
    const electronModule = await import('./electronService') as unknown as {
      __remoteUrlServiceTestFiles: Map<string, string>;
    };
    electronModule.__remoteUrlServiceTestFiles.set(
      '/tmp/p1/metadata/media-remote-url-cache.json',
      JSON.stringify({
        version: 1,
        entries: {
          'local:/tmp/stale.png': {
            sourceKey: 'local:/tmp/stale.png',
            sourceKind: 'local-file',
            localPath: '/tmp/stale.png',
            remoteUrl: 'https://cdn.example.com/stale.png',
            updatedAt: 1,
          },
        },
      }),
    );
    const electronBinaryModule = electronModule as typeof electronModule & {
      __remoteUrlServiceTestBinaryFiles: Map<string, string>;
    };
    electronBinaryModule.__remoteUrlServiceTestBinaryFiles.set('/tmp/stale.png', 'AA==');
    const { safeFetch } = await import('../utils/safeFetch');
    vi.mocked(safeFetch).mockResolvedValueOnce(new Response('', { status: 404 }));

    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');
    const uploadMock = uploadBytesToImageHostingWithRetry as any;
    uploadMock.mockResolvedValue({ success: true, url: 'https://cdn.example.com/fresh.png' });

    const { ensureRemoteUrlForImageSources } = await import('./mediaRemoteUrlService');
    const result = await ensureRemoteUrlForImageSources({
      projectId: 'p1',
      policy: 'required',
      sources: ['/tmp/stale.png'],
    });

    expect(result).toEqual(['https://cdn.example.com/fresh.png']);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(electronModule.__remoteUrlServiceTestFiles.get('/tmp/p1/metadata/media-remote-url-cache.json'))
      .toContain('https://cdn.example.com/fresh.png');
  });

  // 项目资产（角色 / 场景 / 道具）落盘是固定路径，重新生图会**原地覆盖** `costume.png` 等同名文件。
  // 修复前 cache key 只看路径 → 二次生图 sourceKey 跟首次一致 → lookupCachedRemoteUrl
  // 返回上一次的远程 URL，新字节根本不会上传，UI 还在拿旧 CDN。
  // 修复后 cache key 形如 `local:{path}#{mtime}#{size}`：mtime 变 → miss → 重新上传。
  it('cache busts when the same local path is overwritten by a regenerated asset (different mtime)', async () => {
    const electronModule = await import('./electronService') as unknown as {
      __remoteUrlServiceTestFiles: Map<string, string>;
      __remoteUrlServiceTestBinaryFiles: Map<string, string>;
      __remoteUrlServiceTestStats: Map<string, { modifiedAt: number; size: number }>;
    };
    // 首次生成：mtime=1000、size=10、内容 AA==
    electronModule.__remoteUrlServiceTestBinaryFiles.set('/tmp/costume.png', 'AA==');
    electronModule.__remoteUrlServiceTestStats.set('/tmp/costume.png', { modifiedAt: 1000, size: 10 });

    const { safeFetch } = await import('../utils/safeFetch');
    vi.mocked(safeFetch).mockResolvedValue(new Response('', { status: 200 }));

    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');
    const uploadMock = uploadBytesToImageHostingWithRetry as any;
    uploadMock.mockResolvedValueOnce({ success: true, url: 'https://cdn.example.com/first.png' });
    uploadMock.mockResolvedValueOnce({ success: true, url: 'https://cdn.example.com/second.png' });

    const { ensureRemoteUrlForImageSources } = await import('./mediaRemoteUrlService');

    const firstResult = await ensureRemoteUrlForImageSources({
      projectId: 'p1',
      policy: 'required',
      sources: ['/tmp/costume.png'],
    });
    expect(firstResult).toEqual(['https://cdn.example.com/first.png']);
    expect(uploadMock).toHaveBeenCalledTimes(1);

    // 模拟"重新生成"：同一路径被覆盖，mtime / size 变了
    electronModule.__remoteUrlServiceTestStats.set('/tmp/costume.png', { modifiedAt: 2000, size: 12 });

    const secondResult = await ensureRemoteUrlForImageSources({
      projectId: 'p1',
      policy: 'required',
      sources: ['/tmp/costume.png'],
    });
    // 关键断言：返回新 URL（不是 first.png）—— 缓存必须 miss、必须重新上传
    expect(secondResult).toEqual(['https://cdn.example.com/second.png']);
    expect(uploadMock).toHaveBeenCalledTimes(2);
  });
});
