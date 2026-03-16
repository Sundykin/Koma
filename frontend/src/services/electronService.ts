/**
 * Electron API 服务封装
 * 在浏览器环境下提供 fallback 实现
 */

// 类型定义
export interface ProjectMeta {
  id: string;
  title: string;
  genre: string;
  mode: 'drama' | 'narration';
  status?: 'script' | 'storyboard' | 'generating' | 'completed';
  thumbnail?: string;
  episodes?: number;
  createdAt: number;
  updatedAt: number;
  // 媒体配置
  llmConfigId?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  ttsConfigId?: string;
  // 主题风格
  theme?: string;
  stylePrompt?: string;
}

interface ElectronAPI {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };
  dialog: {
    openFile: (options?: OpenFileOptions) => Promise<OpenDialogResult>;
    openDirectory: () => Promise<OpenDialogResult>;
    saveFile: (options?: SaveFileOptions) => Promise<SaveDialogResult>;
  };
  fs: {
    readFile: (path: string) => Promise<string | { content: string }>;
    writeFile: (path: string, data: string, binary?: boolean) => Promise<void>;
    downloadFile: (url: string, destPath: string) => Promise<{ success: boolean; size: number }>;
    exists: (path: string) => Promise<boolean | { exists: boolean }>;
    mkdir: (path: string) => Promise<void>;
    readdir: (path: string) => Promise<string[] | { files: string[] }>;
    stat: (path: string) => Promise<FileStat>;
    remove: (path: string) => Promise<void>;
    copy: (src: string, dest: string) => Promise<void>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
    showItemInFolder: (path: string) => Promise<void>;
  };
  app: {
    getPath: (name: string) => Promise<string | { path: string }>;
    getVersion: () => Promise<string | { version: string }>;
  };
  project: {
    list: () => Promise<ProjectMeta[]>;
    create: (meta: ProjectMeta) => Promise<ProjectMeta>;
    load: (projectId: string) => Promise<ProjectMeta>;
    save: (projectId: string, data: any) => Promise<{ success: boolean }>;
    update: (projectId: string, updates: Partial<ProjectMeta>) => Promise<ProjectMeta>;
    remove: (projectId: string) => Promise<{ success: boolean }>;
    rebuildIndex: () => Promise<any>;
    export: (projectId: string, destPath: string, options?: ExportOptions) => Promise<{ success: boolean; path: string }>;
    import: (zipPath: string, newProjectId?: string) => Promise<{ success: boolean; projectId: string; meta: ProjectMeta }>;
  };
}

interface OpenFileOptions {
  filters?: { name: string; extensions: string[] }[];
  multiple?: boolean;
  title?: string;
}

interface SaveFileOptions {
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  title?: string;
}

interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

interface FileStat {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  createdAt: number;
  modifiedAt: number;
}

interface ExportOptions {
  excludeCache?: boolean;
  excludeTemp?: boolean;
}

// 检测是否在 Electron 环境中
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && 'electronAPI' in window;
};

// 统一路径斜杠为 /（跨平台兼容）
export const normalizePath = (path: string): string => {
  if (!path) return path;
  return path.replace(/\\/g, '/');
};

// 获取 Electron API（如果可用）
const getElectronAPI = (): ElectronAPI | null => {
  if (isElectron()) {
    return (window as any).electronAPI as ElectronAPI;
  }
  return null;
};

// ========== 窗口控制 ==========

export const windowMinimize = async (): Promise<void> => {
  const api = getElectronAPI();
  if (api) {
    await api.window.minimize();
  }
};

export const windowMaximize = async (): Promise<void> => {
  const api = getElectronAPI();
  if (api) {
    await api.window.maximize();
  }
};

export const windowClose = async (): Promise<void> => {
  const api = getElectronAPI();
  if (api) {
    await api.window.close();
  } else {
    window.close();
  }
};

export const windowIsMaximized = async (): Promise<boolean> => {
  const api = getElectronAPI();
  if (api) {
    return await api.window.isMaximized();
  }
  return false;
};

// ========== 文件对话框 ==========

export const openFileDialog = async (
  options?: OpenFileOptions
): Promise<OpenDialogResult> => {
  const api = getElectronAPI();
  if (api) {
    return await api.dialog.openFile(options);
  }
  // 浏览器 fallback: 使用 input[type=file]
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options?.multiple) {
      input.multiple = true;
    }
    if (options?.filters) {
      const extensions = options.filters.flatMap((f) => f.extensions);
      input.accept = extensions.map((e) => `.${e}`).join(',');
    }
    input.onchange = () => {
      const files = input.files;
      if (files && files.length > 0) {
        // 浏览器环境下无法获取真实路径，返回文件名
        resolve({
          canceled: false,
          filePaths: Array.from(files).map((f) => f.name),
        });
      } else {
        resolve({ canceled: true, filePaths: [] });
      }
    };
    input.click();
  });
};

export const openDirectoryDialog = async (): Promise<OpenDialogResult> => {
  const api = getElectronAPI();
  if (api) {
    const result = await api.dialog.openDirectory();
    // 统一路径斜杠
    return {
      ...result,
      filePaths: result.filePaths.map(normalizePath),
    };
  }
  return { canceled: true, filePaths: [] };
};

export const saveFileDialog = async (
  options?: SaveFileOptions
): Promise<SaveDialogResult> => {
  const api = getElectronAPI();
  if (api) {
    return await api.dialog.saveFile(options);
  }
  return { canceled: true };
};

// ========== 文件系统 ==========

export const fsReadFile = async (path: string): Promise<string> => {
  const api = getElectronAPI();
  if (api) {
    const result = await api.fs.readFile(path);
    // Controller 返回 { content: string }，需要解包
    return typeof result === 'object' && result !== null && 'content' in result
      ? (result as { content: string }).content
      : (result as string);
  }
  throw new Error('File system not available in browser');
};

export const fsWriteFile = async (
  path: string,
  data: string
): Promise<void> => {
  const api = getElectronAPI();
  if (api) {
    await api.fs.writeFile(path, data);
    return;
  }
  throw new Error('File system not available in browser');
};

export const fsExists = async (path: string): Promise<boolean> => {
  const api = getElectronAPI();
  if (api) {
    const result = await api.fs.exists(path);
    // Controller 返回 { exists: boolean }，需要解包
    return typeof result === 'object' && result !== null && 'exists' in result
      ? (result as { exists: boolean }).exists
      : Boolean(result);
  }
  return false;
};

export const fsMkdir = async (path: string): Promise<void> => {
  const api = getElectronAPI();
  if (api) {
    await api.fs.mkdir(path);
  }
};

export const fsReaddir = async (path: string): Promise<string[]> => {
  const api = getElectronAPI();
  if (api) {
    const result = await api.fs.readdir(path);
    // Controller 返回 { files: string[] }，需要解包
    return typeof result === 'object' && result !== null && 'files' in result
      ? (result as { files: string[] }).files
      : (result as string[]);
  }
  return [];
};

export const fsStat = async (path: string): Promise<FileStat | null> => {
  const api = getElectronAPI();
  if (api) {
    return await api.fs.stat(path);
  }
  return null;
};

export const fsRemove = async (path: string): Promise<void> => {
  const api = getElectronAPI();
  if (api) {
    await api.fs.remove(path);
  }
};

export const fsCopy = async (src: string, dest: string): Promise<void> => {
  const api = getElectronAPI();
  if (api) {
    await api.fs.copy(src, dest);
  }
};

// 递归计算目录大小
export const fsDirSize = async (dirPath: string): Promise<number> => {
  const api = getElectronAPI();
  if (!api) return 0;

  let totalSize = 0;
  try {
    const entries = await fsReaddir(dirPath);
    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry}`;
      const stat = await fsStat(fullPath);
      if (stat) {
        if (stat.isDirectory) {
          totalSize += await fsDirSize(fullPath);
        } else {
          totalSize += stat.size;
        }
      }
    }
  } catch {
    // 忽略读取错误
  }
  return totalSize;
};

// 从 URL 下载文件到本地（绕过 CORS）
export const fsDownloadFile = async (
  url: string,
  destPath: string
): Promise<{ success: boolean; size: number }> => {
  const api = getElectronAPI();
  if (api) {
    return await api.fs.downloadFile(url, destPath);
  }
  throw new Error('File download not available in browser');
};

// 写入二进制文件（用于下载的图片/视频）
export const fsWriteFileBuffer = async (
  path: string,
  buffer: Uint8Array
): Promise<void> => {
  const api = getElectronAPI();
  if (api) {
    // 将 Uint8Array 转换为 base64 字符串传递
    const base64 = btoa(
      Array.from(buffer)
        .map((b) => String.fromCharCode(b))
        .join('')
    );
    await api.fs.writeFile(path, base64, true); // binary: true
    return;
  }
  throw new Error('File system not available in browser');
};

// ========== Shell ==========

// 别名导出，便于在组件中使用
export const selectDirectory = async (_options?: { title?: string }): Promise<OpenDialogResult> => {
  return openDirectoryDialog();
};

export const writeFile = fsWriteFile;
export const createDirectory = fsMkdir;

export const shellOpenExternal = async (url: string): Promise<void> => {
  const api = getElectronAPI();
  if (api) {
    await api.shell.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
};

export const shellShowItemInFolder = async (path: string): Promise<void> => {
  const api = getElectronAPI();
  if (api) {
    await api.shell.showItemInFolder(path);
  }
};

// 用系统默认程序打开路径（文件夹会在资源管理器中打开）
export const shellOpenPath = async (path: string): Promise<void> => {
  const api = getElectronAPI();
  if (api && (api.shell as any).openPath) {
    await (api.shell as any).openPath(path);
  } else {
    // fallback: 使用 showItemInFolder
    await shellShowItemInFolder(path);
  }
};

// ========== App ==========

export const appGetPath = async (
  name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents'
): Promise<string> => {
  const api = getElectronAPI();
  if (api) {
    const result = await api.app.getPath(name);
    // Controller 返回 { path: string }，需要解包
    const path = typeof result === 'object' && result !== null && 'path' in result
      ? (result as { path: string }).path
      : (result as string);
    return normalizePath(path);
  }
  // 浏览器 fallback
  return '';
};

export const appGetVersion = async (): Promise<string> => {
  const api = getElectronAPI();
  if (api) {
    const result = await api.app.getVersion();
    // Controller 返回 { version: string }，需要解包
    return typeof result === 'object' && result !== null && 'version' in result
      ? (result as { version: string }).version
      : (result as string);
  }
  return '0.0.0';
};

// 获取存储根路径
export const getStoragePath = async (): Promise<string> => {
  const api = getElectronAPI();
  if (api) {
    const userData = await api.app.getPath('userData');
    const path = typeof userData === 'object' && userData !== null && 'path' in userData
      ? (userData as { path: string }).path
      : (userData as string);
    return `${path}/storage`;
  }
  return '';
};

// 获取机器唯一标识
export const getMachineId = async (): Promise<string> => {
  const api = getElectronAPI();
  if (api) {
    const userData = await api.app.getPath('userData');
    const path = typeof userData === 'object' && userData !== null && 'path' in userData
      ? (userData as { path: string }).path
      : (userData as string);
    // 使用 userData 路径作为基础生成一个稳定的标识
    return btoa(path).slice(0, 32);
  }
  return 'browser-instance';
};

// ========== 项目 CRUD ==========

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
export const electronService = {
  isElectron,
  window: {
    minimize: windowMinimize,
    maximize: windowMaximize,
    close: windowClose,
    isMaximized: windowIsMaximized,
  },
  dialog: {
    openFile: openFileDialog,
    openDirectory: openDirectoryDialog,
    saveFile: saveFileDialog,
  },
  fs: {
    readFile: fsReadFile,
    writeFile: fsWriteFile,
    exists: fsExists,
    mkdir: fsMkdir,
    readdir: fsReaddir,
    stat: fsStat,
    remove: fsRemove,
    copy: fsCopy,
    downloadFile: fsDownloadFile,
    writeFileBuffer: fsWriteFileBuffer,
    dirSize: fsDirSize,
    // 将本地文件路径转换为可用的 URL
    toLocalUrl: (filePath: string): string => {
      if (!filePath) return '';
      // 浏览器模式直接返回（应该是网络 URL）
      if (!isElectron()) return filePath;
      // 如果已经是 URL，直接返回
      if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('koma-local://')) {
        return filePath;
      }
      // 将本地路径转换为 koma-local:// 协议
      // Windows 路径需要处理反斜杠，并对整个路径进行 URL 编码
      const normalizedPath = filePath.replace(/\\/g, '/');
      // 对路径进行编码，但保留斜杠
      const encodedPath = normalizedPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
      return `koma-local:///${encodedPath}`;
    },
  },
  shell: {
    openExternal: shellOpenExternal,
    showItemInFolder: shellShowItemInFolder,
    openPath: shellOpenPath,
  },
  app: {
    getPath: appGetPath,
    getVersion: appGetVersion,
  },
  getStoragePath,
  getMachineId,
  project: {
    list: projectList,
    create: projectCreate,
    load: projectLoad,
    save: projectSave,
    update: projectUpdate,
    remove: projectDelete,
    rebuildIndex: projectRebuildIndex,
    export: projectExport,
    import: projectImport,
  },
  // 插件相关 API
  ipc: {
    invoke: async (channel: string, args?: any): Promise<any> => {
      const api = getElectronAPI();
      if (api && (api as any).plugin) {
        if (channel === 'controller/plugin/list') {
          return (api as any).plugin.list();
        }
        if (channel === 'controller/plugin/openFolder') {
          return (api as any).plugin.openFolder(args.pluginPath);
        }
        if (channel === 'controller/plugin/validate') {
          return (api as any).plugin.validate(args.zipPath);
        }
        if (channel === 'controller/plugin/install') {
          return (api as any).plugin.install(args.zipPath, args.manifest);
        }
        if (channel === 'controller/plugin/uninstall') {
          return (api as any).plugin.uninstall(args.pluginPath);
        }
      }
      // 通用 IPC 调用（通过 window.electron）
      if (typeof window !== 'undefined' && (window as any).electron?.ipcRenderer) {
        return (window as any).electron.ipcRenderer.invoke(channel, args);
      }
      throw new Error(`IPC not available: ${channel}`);
    },
  },
};

export default electronService;
