/**
 * ElectronAPI 与相关 DTO 类型（从 electronService.ts 拆出，纯类型无逻辑）
 */
import type { MediaModelSelection, MediaOwnerRef, ProjectStyleSnapshot, StoredMediaAsset } from '../../types';

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
  mediaSelections?: Partial<Record<'llm' | 'tti' | 'itv' | 'tts', MediaModelSelection>>;
  stylePresetId?: string;
  styleSnapshot?: ProjectStyleSnapshot;
  aspectRatio?: '16:9' | '9:16';
  // 主题风格
  theme?: string;
  stylePrompt?: string;
}

export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean | { isMaximized: boolean }>;
  };
  dialog: {
    openFile: (options?: OpenFileOptions) => Promise<OpenDialogResult>;
    openDirectory: () => Promise<OpenDialogResult>;
    saveFile: (options?: SaveFileOptions) => Promise<SaveDialogResult>;
  };
  fs: {
    readFile: (path: string) => Promise<string | { content: string }>;
    readFileAsBase64: (path: string) => Promise<string | { base64: string }>;
    writeFile: (path: string, data: string, binary?: boolean) => Promise<void>;
    downloadFile: (url: string, destPath: string, options?: { headers?: Record<string, string>; channelId?: string }) => Promise<{ success: boolean; size: number; path?: string; mimeType?: string }>;
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
    voiceLibrary?: {
      get: () => Promise<{ _version: 1; categories: any[]; profiles: any[] }>;
      save: (manifest: { _version: 1; categories: any[]; profiles: any[] }) => Promise<{ success: boolean }>;
      uploadSample: (voiceId: string, dataBase64: string, ext: string) => Promise<{ sampleFile: string; localPath: string }>;
      deleteSample: (voiceId: string) => Promise<{ removed: number }>;
      getSamplePath: (sampleFile: string) => Promise<{ localPath: string | null }>;
    };
  };
  diagnostics?: {
    appendRendererLog: (payload: DiagnosticsRendererLogPayload) => Promise<{ success: boolean }>;
    listLogs: () => Promise<DiagnosticsLogSummary>;
    getUsage: () => Promise<DiagnosticsUsageSummary>;
    clearLogs: () => Promise<{ success: boolean; removed: number }>;
    clearRendererLogs: () => Promise<{ success: boolean; removed: number }>;
    exportLogs: (destPath: string) => Promise<DiagnosticsExportResult>;
  };
  project: {
    setStorageRoot: (rootPath: string) => Promise<{ success: boolean; rootPath: string }>;
    list: () => Promise<ProjectMeta[]>;
    create: (meta: ProjectMeta) => Promise<ProjectMeta>;
    load: (projectId: string) => Promise<ProjectMeta>;
    loadFull: (projectId: string) => Promise<any>;
    bindOwnerRefMedia: (projectId: string, ownerRef: MediaOwnerRef, asset: StoredMediaAsset) => Promise<{ success: boolean }>;
    save: (projectId: string, data: any) => Promise<{ success: boolean }>;
    update: (projectId: string, updates: Partial<ProjectMeta>) => Promise<ProjectMeta>;
    remove: (projectId: string) => Promise<{ success: boolean }>;
    rebuildIndex: () => Promise<any>;
    export: (projectId: string, destPath: string, options?: ExportOptions) => Promise<{ success: boolean; path: string }>;
    import: (zipPath: string, newProjectId?: string) => Promise<{ success: boolean; projectId: string; meta: ProjectMeta }>;
    // 实体 CRUD
    characterList: (projectId: string) => Promise<any[]>;
    characterGet: (id: string) => Promise<any>;
    characterCreate: (data: any) => Promise<any>;
    characterUpdate: (id: string, data: any) => Promise<any>;
    characterDelete: (id: string) => Promise<any>;
    sceneList: (projectId: string) => Promise<any[]>;
    sceneGet: (id: string) => Promise<any>;
    sceneCreate: (data: any) => Promise<any>;
    sceneUpdate: (id: string, data: any) => Promise<any>;
    sceneDelete: (id: string) => Promise<any>;
    propList: (projectId: string) => Promise<any[]>;
    propGet: (id: string) => Promise<any>;
    propCreate: (data: any) => Promise<any>;
    propUpdate: (id: string, data: any) => Promise<any>;
    propDelete: (id: string) => Promise<any>;
    shotList: (projectId: string) => Promise<any[]>;
    shotGet: (id: string) => Promise<any>;
    shotCreate: (data: any) => Promise<any>;
    shotUpdate: (id: string, data: any) => Promise<any>;
    shotDelete: (id: string) => Promise<any>;
    shotVersionList: (shotId: string) => Promise<any[]>;
    shotVersionCreate: (data: any) => Promise<any>;
    shotVersionDelete: (id: string) => Promise<any>;
    shotSetVersion: (shotId: string, versionNumber: number) => Promise<any>;
    assetList: (projectId: string) => Promise<any[]>;
    assetGet: (id: string) => Promise<any>;
    assetCreate: (data: any) => Promise<any>;
    assetUpdate: (id: string, data: any) => Promise<any>;
    assetDelete: (id: string) => Promise<any>;
    assetFindByFingerprint: (projectId: string, fingerprint: string) => Promise<any>;
    assetListUnreferenced: (projectId: string) => Promise<any[]>;
    episodeList: (projectId: string) => Promise<any[]>;
    episodeGet: (id: string) => Promise<any>;
    episodeCreate: (data: any) => Promise<any>;
    episodeUpdate: (id: string, data: any) => Promise<any>;
    episodeDelete: (id: string) => Promise<any>;
    timelineGet: (projectId: string) => Promise<any>;
    timelineUpdate: (id: string, data: any) => Promise<any>;
    trackAdd: (data: any) => Promise<any>;
    trackUpdate: (id: string, data: any) => Promise<any>;
    trackDelete: (id: string) => Promise<any>;
    clipAdd: (data: any) => Promise<any>;
    clipUpdate: (id: string, data: any) => Promise<any>;
    clipDelete: (id: string) => Promise<any>;
  };
  linghui?: {
    listWorkspaces: () => Promise<any[]>;
    loadWorkspace: (workspaceId: string) => Promise<any>;
    saveWorkspace: (doc: any) => Promise<any>;
    createWorkspace: (name?: string) => Promise<any>;
    saveWorkspaceAs: (doc: any, name?: string) => Promise<any>;
    deleteWorkspace: (workspaceId: string) => Promise<any>;
    importWorkspace: (filePath: string) => Promise<any>;
    exportWorkspace: (doc: any, destPath: string) => Promise<{ path: string }>;
    getWorkspaceDir: (workspaceId: string) => Promise<string | { path: string }>;
    listWorkflowTemplates: (workspaceId: string) => Promise<any[]>;
    createWorkflowTemplate: (payload: any) => Promise<any>;
    listWorkspaceAssets: (workspaceId: string) => Promise<any[]>;
    createWorkspaceAsset: (payload: any) => Promise<any>;
    syncProductionAssets: (payload: any) => Promise<any>;
    listWorkspaceHistoryRecords: (workspaceId: string) => Promise<any[]>;
    createWorkspaceHistoryRecord: (payload: any) => Promise<any>;
    importWorkspaceAsset: (workspaceId: string, sourcePath: string, filenameHint?: string) => Promise<string | { path: string }>;
    listGlobalAssets: (args?: { kind?: 'character' | 'prop' }) => Promise<any[]>;
    upsertGlobalAsset: (payload: any) => Promise<any>;
    deleteGlobalAsset: (args: { id: string }) => Promise<{ deleted: boolean }>;
  };
  updater?: {
    getState: () => Promise<UpdaterStateDto>;
    checkNow: () => Promise<UpdaterStateDto>;
    download: () => Promise<{ success: boolean }>;
    installNow: () => Promise<{ success: boolean }>;
    onStateChange: (cb: (e: unknown, state: UpdaterStateDto) => void) => () => void;
  };
  marketplace?: {
    list: () => Promise<{ items: MarketplacePluginItem[] }>;
    refresh: () => Promise<MarketplaceStateDto>;
    checkUpdates: () => Promise<{ items: MarketplacePluginItem[] }>;
    getState: () => Promise<MarketplaceStateDto>;
    installOrUpdate: (pluginId: string) => Promise<{ success: boolean }>;
    uninstall: (pluginId: string) => Promise<{ success: boolean }>;
    setAutoCheck: (enabled: boolean) => Promise<{ success: boolean }>;
    onStateChange: (cb: (e: unknown, state: MarketplaceStateDto) => void) => () => void;
    onPluginInstalled: (cb: (e: unknown, payload: { pluginId: string; version: string }) => void) => () => void;
  };
}

export interface UpdaterStateDto {
  kind: 'idle' | 'checking' | 'downloading' | 'downloaded' | 'failed';
  currentVersion: string;
  availableVersion?: string;
  downloadProgress?: number;
  error?: { message: string; detail?: string };
}

export interface MarketplacePluginItem {
  entry: {
    id: string;
    name: string;
    latestVersion: string;
    category?: string;
    iconUrl?: string;
    description?: string;
    downloadUrl: string;
    sha512: string;
    engine?: {
      minAppVersion?: string;
      maxAppVersion?: string;
      apiVersion?: string;
    };
  };
  installed: boolean;
  installedVersion?: string;
  hasUpdate: boolean;
  incompatibleReason?: string;
}

export interface MarketplaceStateDto {
  installing: string[];
  uninstalling: string[];
  lastCheckedAt?: string;
  lastError?: string;
}

export type ElectronBridgeWindow = Window & {
  electronAPI?: ElectronAPI;
  electron?: {
    ipcRenderer?: {
      invoke: (channel: string, args?: unknown) => Promise<unknown>;
    };
  };
};

export interface OpenFileOptions {
  filters?: { name: string; extensions: string[] }[];
  multiple?: boolean;
  title?: string;
}

export interface SaveFileOptions {
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  title?: string;
}

export interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface FileStat {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  createdAt: number;
  modifiedAt: number;
}

export interface ExportOptions {
  excludeCache?: boolean;
  excludeTemp?: boolean;
}

export type DiagnosticsLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DiagnosticsRendererLogPayload {
  level: DiagnosticsLogLevel;
  category: string;
  message: string;
  data?: unknown;
  timestamp?: string;
  source?: 'logger' | 'console' | 'error';
}

export interface DiagnosticsLogFileInfo {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: number;
  kind: 'renderer' | 'main' | 'electron' | 'other';
}

export interface DiagnosticsLogSummary {
  storageRoot: string;
  logsDir: string;
  electronLogsDir: string;
  files: DiagnosticsLogFileInfo[];
  totalSize: number;
}

export interface DiagnosticsUsageSummary {
  storageRoot: string;
  logsDir: string;
  totalSize: number;
  fileCount: number;
}

export interface DiagnosticsExportResult {
  success: boolean;
  path: string;
  fileCount: number;
  totalSize: number;
}
