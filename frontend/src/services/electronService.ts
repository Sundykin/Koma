/**
 * Electron API 服务封装
 * 仅支持 Electron 新 runtime 桥接
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

interface ProviderTelemetry {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  avgLatencyMs: number;
  errorDistribution: Record<string, number>;
}

export interface ProviderStatusSnapshot {
  type: string;
  kind: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting';
  name: string;
  pluginId?: string;
  priority: number;
  health: 'unknown' | 'healthy' | 'degraded' | 'unhealthy';
  lastCheckedAt?: number;
  consecutiveFailures: number;
  telemetry: ProviderTelemetry;
}

export interface PluginRuntimeSnapshot {
  id: string;
  category: 'provider' | 'global' | 'tool' | 'mcp' | 'agent';
  state: 'installed' | 'loaded' | 'activating' | 'active' | 'deactivating' | 'error' | 'disabled';
  sandboxType: 'none' | 'worker';
  loadedAt?: number;
  activatedAt?: number;
  deactivatedAt?: number;
  updatedAt: number;
  error?: string;
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
  plugin?: {
    validate?: (zipPath: string) => Promise<any>;
    install?: (zipPath: string, manifest: any, stagingId?: string) => Promise<any>;
    uninstall?: (pluginPath: string) => Promise<any>;
    list?: () => Promise<any>;
    openFolder?: (pluginPath: string) => Promise<any>;
    activate?: (manifest: any) => Promise<any>;
    deactivate?: (pluginId: string) => Promise<any>;
    status?: (pluginId: string) => Promise<any>;
    listActive?: () => Promise<any>;
    listMCPTools?: () => Promise<any>;
    listAgents?: () => Promise<any>;
    listProviderStatus?: (kind?: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting') => Promise<ProviderStatusSnapshot[]>;
    testProvider?: (
      kind: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting',
      type: string,
      config: Record<string, unknown>
    ) => Promise<{ success: boolean; latency: number; error?: string }>;
    listRuntimeStates?: () => Promise<PluginRuntimeSnapshot[]>;
    getRuntimeState?: (pluginId: string) => Promise<PluginRuntimeSnapshot | null>;
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
export const getElectronAPI = (): ElectronAPI | null => {
  if (!isElectron()) {
    return null;
  }
  return (window as any).electronAPI as ElectronAPI;
};

const requireElectronAPI = (): ElectronAPI => {
  const api = getElectronAPI();
  if (!api) {
    throw new Error('Electron runtime bridge is not available');
  }
  return api;
};

// ========== 窗口控制 ==========

export const windowMinimize = async (): Promise<void> => {
  await requireElectronAPI().window.minimize();
};

export const windowMaximize = async (): Promise<void> => {
  await requireElectronAPI().window.maximize();
};

export const windowClose = async (): Promise<void> => {
  await requireElectronAPI().window.close();
};

export const windowIsMaximized = async (): Promise<boolean> => {
  return requireElectronAPI().window.isMaximized();
};

// ========== 文件对话框 ==========

export const openFileDialog = async (
  options?: OpenFileOptions
): Promise<OpenDialogResult> => {
  return requireElectronAPI().dialog.openFile(options);
};

export const openDirectoryDialog = async (): Promise<OpenDialogResult> => {
  const result = await requireElectronAPI().dialog.openDirectory();
  return {
    ...result,
    filePaths: result.filePaths.map(normalizePath),
  };
};

export const saveFileDialog = async (
  options?: SaveFileOptions
): Promise<SaveDialogResult> => {
  return requireElectronAPI().dialog.saveFile(options);
};

// ========== 文件系统 ==========

export const fsReadFile = async (path: string): Promise<string> => {
  const result = await requireElectronAPI().fs.readFile(path);
  return typeof result === 'object' && result !== null && 'content' in result
    ? (result as { content: string }).content
    : (result as string);
};

export const fsWriteFile = async (
  path: string,
  data: string
): Promise<void> => {
  await requireElectronAPI().fs.writeFile(path, data);
};

export const fsExists = async (path: string): Promise<boolean> => {
  const result = await requireElectronAPI().fs.exists(path);
  return typeof result === 'object' && result !== null && 'exists' in result
    ? (result as { exists: boolean }).exists
    : Boolean(result);
};

export const fsMkdir = async (path: string): Promise<void> => {
  await requireElectronAPI().fs.mkdir(path);
};

export const fsReaddir = async (path: string): Promise<string[]> => {
  const result = await requireElectronAPI().fs.readdir(path);
  return typeof result === 'object' && result !== null && 'files' in result
    ? (result as { files: string[] }).files
    : (result as string[]);
};

export const fsStat = async (path: string): Promise<FileStat | null> => {
  return requireElectronAPI().fs.stat(path);
};

export const fsRemove = async (path: string): Promise<void> => {
  await requireElectronAPI().fs.remove(path);
};

export const fsCopy = async (src: string, dest: string): Promise<void> => {
  await requireElectronAPI().fs.copy(src, dest);
};

// 递归计算目录大小
export const fsDirSize = async (dirPath: string): Promise<number> => {
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
  return requireElectronAPI().fs.downloadFile(url, destPath);
};

// 写入二进制文件（用于下载的图片/视频）
export const fsWriteFileBuffer = async (
  path: string,
  buffer: Uint8Array
): Promise<void> => {
  const base64 = btoa(
    Array.from(buffer)
      .map((b) => String.fromCharCode(b))
      .join('')
  );
  console.log('[fsWriteFileBuffer] 写入文件:', path, '大小:', buffer.byteLength, 'base64长度:', base64.length);
  await requireElectronAPI().fs.writeFile(path, base64, true);
};

// ========== Shell ==========

// 别名导出，便于在组件中使用
export const selectDirectory = async (_options?: { title?: string }): Promise<OpenDialogResult> => {
  return openDirectoryDialog();
};

export const writeFile = fsWriteFile;
export const createDirectory = fsMkdir;

export const shellOpenExternal = async (url: string): Promise<void> => {
  await requireElectronAPI().shell.openExternal(url);
};

export const shellShowItemInFolder = async (path: string): Promise<void> => {
  await requireElectronAPI().shell.showItemInFolder(path);
};

// 用系统默认程序打开路径（文件夹会在资源管理器中打开）
export const shellOpenPath = async (path: string): Promise<void> => {
  const api = requireElectronAPI();
  const shellAny = api.shell as any;
  if (shellAny.openPath) {
    await shellAny.openPath(path);
    return;
  }
  await api.shell.showItemInFolder(path);
};

// ========== App ==========

export const appGetPath = async (
  name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents'
): Promise<string> => {
  const result = await requireElectronAPI().app.getPath(name);
  const path = typeof result === 'object' && result !== null && 'path' in result
    ? (result as { path: string }).path
    : (result as string);
  return normalizePath(path);
};

export const appGetVersion = async (): Promise<string> => {
  const result = await requireElectronAPI().app.getVersion();
  return typeof result === 'object' && result !== null && 'version' in result
    ? (result as { version: string }).version
    : (result as string);
};

// 获取存储根路径
export const getStoragePath = async (): Promise<string> => {
  const userData = await requireElectronAPI().app.getPath('userData');
  const path = typeof userData === 'object' && userData !== null && 'path' in userData
    ? (userData as { path: string }).path
    : (userData as string);
  return `${path}/storage`;
};

// 获取机器唯一标识
export const getMachineId = async (): Promise<string> => {
  const userData = await requireElectronAPI().app.getPath('userData');
  const path = typeof userData === 'object' && userData !== null && 'path' in userData
    ? (userData as { path: string }).path
    : (userData as string);
  return btoa(path).slice(0, 32);
};

// ========== 项目 CRUD ==========

export const projectList = async (): Promise<ProjectMeta[]> => {
  return requireElectronAPI().project.list();
};

export const projectCreate = async (meta: ProjectMeta): Promise<ProjectMeta> => {
  return requireElectronAPI().project.create(meta);
};

export const projectLoad = async (projectId: string): Promise<ProjectMeta> => {
  return requireElectronAPI().project.load(projectId);
};

export const projectSave = async (projectId: string, data: any): Promise<{ success: boolean }> => {
  return requireElectronAPI().project.save(projectId, data);
};

export const projectUpdate = async (projectId: string, updates: Partial<ProjectMeta>): Promise<ProjectMeta> => {
  return requireElectronAPI().project.update(projectId, updates);
};

export const projectDelete = async (projectId: string): Promise<{ success: boolean }> => {
  return requireElectronAPI().project.remove(projectId);
};

export const projectRebuildIndex = async (): Promise<any> => {
  return requireElectronAPI().project.rebuildIndex();
};

// ========== 项目导入导出 ==========

export const projectExport = async (
  projectId: string,
  destPath: string,
  options?: ExportOptions
): Promise<{ success: boolean; path: string }> => {
  return requireElectronAPI().project.export(projectId, destPath, options);
};

export const projectImport = async (
  zipPath: string,
  newProjectId?: string
): Promise<{ success: boolean; projectId: string; meta: any }> => {
  return requireElectronAPI().project.import(zipPath, newProjectId);
};

export const pluginListProviderStatus = async (
  kind?: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting'
): Promise<ProviderStatusSnapshot[]> => {
  const fn = requireElectronAPI().plugin?.listProviderStatus;
  if (!fn) {
    throw new Error('plugin:listProviderStatus is not available');
  }
  return fn(kind);
};

export const pluginTestProvider = async (
  kind: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting',
  type: string,
  config: Record<string, unknown>
): Promise<{ success: boolean; latency: number; error?: string }> => {
  const fn = requireElectronAPI().plugin?.testProvider;
  if (!fn) {
    throw new Error('plugin:testProvider is not available');
  }
  return fn(kind, type, config);
};

export const pluginListRuntimeStates = async (): Promise<PluginRuntimeSnapshot[]> => {
  const fn = requireElectronAPI().plugin?.listRuntimeStates;
  if (!fn) {
    throw new Error('plugin:listRuntimeStates is not available');
  }
  return fn();
};

export const pluginGetRuntimeState = async (pluginId: string): Promise<PluginRuntimeSnapshot | null> => {
  const fn = requireElectronAPI().plugin?.getRuntimeState;
  if (!fn) {
    throw new Error('plugin:getRuntimeState is not available');
  }
  return fn(pluginId);
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
    toLocalUrl: (filePath: string): string => {
      if (!filePath) return '';
      if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('koma-local://')) {
        return filePath;
      }
      const normalizedPath = filePath.replace(/\\/g, '/');
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
  plugin: {
    listProviderStatus: pluginListProviderStatus,
    testProvider: pluginTestProvider,
    listRuntimeStates: pluginListRuntimeStates,
    getRuntimeState: pluginGetRuntimeState,
  },
  ipc: {
    invoke: async (channel: string, args?: any): Promise<any> => {
      const api = requireElectronAPI();
      if (!api.plugin) {
        throw new Error(`IPC not available: ${channel}`);
      }

      switch (channel) {
        case 'plugin:validate':
          return api.plugin.validate?.(args);
        case 'plugin:install':
          return api.plugin.install?.(args.zipPath, args.manifest, args.stagingId);
        case 'plugin:uninstall':
          return api.plugin.uninstall?.(args);
        case 'plugin:list':
          return api.plugin.list?.();
        case 'plugin:openFolder':
          return api.plugin.openFolder?.(args);
        case 'plugin:activate':
          return api.plugin.activate?.(args.manifest);
        case 'plugin:deactivate':
          return api.plugin.deactivate?.(args.pluginId);
        case 'plugin:status':
          return api.plugin.status?.(args.pluginId);
        case 'plugin:listActive':
          return api.plugin.listActive?.();
        case 'plugin:listMCPTools':
          return api.plugin.listMCPTools?.();
        case 'plugin:listAgents':
          return api.plugin.listAgents?.();
        case 'plugin:listRuntimeStates':
          return api.plugin.listRuntimeStates?.();
        case 'plugin:getRuntimeState':
          return api.plugin.getRuntimeState?.(args.pluginId);
        case 'plugin:listProviderStatus':
          return api.plugin.listProviderStatus?.(args?.kind);
        case 'plugin:testProvider':
          return api.plugin.testProvider?.(args.kind, args.type, args.config);
        default:
          throw new Error(`Unsupported IPC channel: ${channel}`);
      }
    },
  },
};

export default electronService;
