import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateStorage } from './storageConfig';

type StatLike = { isDirectory: boolean };

const fsMock = vi.hoisted(() => ({
  readdir: vi.fn<(path: string) => Promise<string[]>>(),
  stat: vi.fn<(path: string) => Promise<StatLike>>(),
  mkdir: vi.fn<(path: string) => Promise<void>>(),
  copy: vi.fn<(src: string, dest: string) => Promise<void>>(),
}));

vi.mock('../services/electronService', () => ({
  normalizePath: (path: string) => path.replace(/\\/g, '/'),
  electronService: {
    isElectron: () => true,
    fs: fsMock,
  },
}));

describe('storageConfig migration', () => {
  beforeEach(() => {
    Object.values(fsMock).forEach(mock => mock.mockReset());
    fsMock.mkdir.mockResolvedValue(undefined);
    fsMock.copy.mockResolvedValue(undefined);
  });

  it('迁移业务数据时跳过 Electron userData 和运行时锁文件', async () => {
    fsMock.readdir.mockImplementation(async dir => {
      if (dir === '/old') {
        return ['projects', 'settings.json', '_userData', 'SingletonLock'];
      }
      if (dir === '/old/projects') {
        return ['project-1', 'SingletonSocket'];
      }
      if (dir === '/old/projects/project-1') {
        return ['koma.db'];
      }
      return [];
    });
    fsMock.stat.mockImplementation(async filePath => ({
      isDirectory: filePath === '/old/projects' || filePath === '/old/projects/project-1',
    }));

    await migrateStorage('/old', '/new');

    expect(fsMock.copy).toHaveBeenCalledWith('/old/settings.json', '/new/settings.json');
    expect(fsMock.copy).toHaveBeenCalledWith(
      '/old/projects/project-1/koma.db',
      '/new/projects/project-1/koma.db'
    );
    expect(fsMock.stat).not.toHaveBeenCalledWith('/old/_userData');
    expect(fsMock.stat).not.toHaveBeenCalledWith('/old/SingletonLock');
    expect(fsMock.stat).not.toHaveBeenCalledWith('/old/projects/SingletonSocket');
    const copiedPaths = fsMock.copy.mock.calls.flat() as string[];
    expect(copiedPaths.some(path => path.includes('_userData'))).toBe(false);
    expect(copiedPaths.some(path => path.includes('Singleton'))).toBe(false);
  });
});
