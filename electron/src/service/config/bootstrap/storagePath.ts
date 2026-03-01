/**
 * 存储路径引导加载器
 */
import * as path from 'path';
import * as fs from 'fs/promises';
import { app } from 'electron';

export interface StoragePaths {
  dataDir: string;      // 配置数据目录
  projectsDir: string;  // 项目存储目录
  pluginsDir: string;   // 插件目录
  cacheDir: string;     // 缓存目录
}

class StoragePathLoader {
  /** @internal */
  _paths: StoragePaths | null = null;

  async load(customRoot?: string): Promise<StoragePaths> {
    if (this._paths) return this._paths;

    const root = customRoot || path.join(app.getPath('home'), '.koma');

    this._paths = {
      dataDir: path.join(root, 'config'),
      projectsDir: path.join(root, 'projects'),
      pluginsDir: path.join(root, 'plugins-runtime'),
      cacheDir: path.join(root, 'cache'),
    };

    // 确保目录存在
    await Promise.all([
      fs.mkdir(this._paths.dataDir, { recursive: true }),
      fs.mkdir(this._paths.projectsDir, { recursive: true }),
      fs.mkdir(this._paths.pluginsDir, { recursive: true }),
      fs.mkdir(this._paths.cacheDir, { recursive: true }),
    ]);

    return this._paths;
  }

  getPaths(): StoragePaths {
    if (!this._paths) throw new Error('StoragePathLoader not initialized');
    return this._paths;
  }
}

export const storagePathLoader = new StoragePathLoader();
