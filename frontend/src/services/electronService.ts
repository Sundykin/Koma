/**
 * Electron API 服务封装
 * 在浏览器环境下提供 fallback 实现
 */

// 类型定义
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
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, data: string) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
    mkdir: (path: string) => Promise<void>;
    readdir: (path: string) => Promise<string[]>;
    stat: (path: string) => Promise<FileStat>;
    remove: (path: string) => Promise<void>;
    copy: (src: string, dest: string) => Promise<void>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
    showItemInFolder: (path: string) => Promise<void>;
  };
  app: {
    getPath: (name: string) => Promise<string>;
    getVersion: () => Promise<string>;
  };
  project: {
    list: () => Promise<any[]>;
    create: (meta: any) => Promise<any>;
    load: (projectId: string) => Promise<any>;
    save: (projectId: string, data: any) => Promise<{ success: boolean }>;
    export: (projectId: string, destPath: string, options?: ExportOptions) => Promise<{ success: boolean; path: string }>;
    import: (zipPath: string, newProjectId?: string) => Promise<{ success: boolean; projectId: string; meta: any }>;
  };
}

interface OpenFileOptions {
  filters?: { name: string; extensions: string[] }[];
  multiple?: boolean;
}

interface SaveFileOptions {
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
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
    return await api.dialog.openDirectory();
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
    return await api.fs.readFile(path);
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
    return await api.fs.exists(path);
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
    return await api.fs.readdir(path);
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

// ========== Shell ==========

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

// ========== App ==========

export const appGetPath = async (
  name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents'
): Promise<string> => {
  const api = getElectronAPI();
  if (api) {
    return await api.app.getPath(name);
  }
  // 浏览器 fallback
  return '';
};

export const appGetVersion = async (): Promise<string> => {
  const api = getElectronAPI();
  if (api) {
    return await api.app.getVersion();
  }
  return '0.0.0';
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
  },
  shell: {
    openExternal: shellOpenExternal,
    showItemInFolder: shellShowItemInFolder,
  },
  app: {
    getPath: appGetPath,
    getVersion: appGetVersion,
  },
  project: {
    export: projectExport,
    import: projectImport,
  },
};

export default electronService;
