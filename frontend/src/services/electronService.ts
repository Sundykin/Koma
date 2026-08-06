/**
 * Electron API 服务封装（门面）。
 * 浏览器环境下提供 fallback 实现。
 *
 * 实现已按域拆到 ./electronService/：
 *   - types.ts       ElectronAPI 与 DTO 类型
 *   - core.ts        isElectron / normalizePath / getElectronAPI
 *   - windowFs.ts    窗口控制 / 文件对话框 / 文件系统 / Shell / App 信息
 *   - diagnostics.ts 诊断日志
 *   - entities.ts    项目与各实体 CRUD / 批量操作 / 导入导出 / 灵绘资产
 */
import { toKomaLocalUrl } from '../utils/urlUtils';
import { isElectron, getElectronAPI } from './electronService/core';
import type { ElectronBridgeWindow } from './electronService/types';
import {
  windowMinimize, windowMaximize, windowClose, windowIsMaximized,
  openFileDialog, openDirectoryDialog, saveFileDialog,
  fsReadFile, fsReadFileAsBase64, fsWriteFile, fsExists, fsMkdir, fsReaddir, fsStat,
  fsRemove, fsCopy, fsDownloadFile, fsWriteFileBuffer, fsDirSize,
  shellOpenExternal, shellShowItemInFolder, shellOpenPath,
  appGetPath, appGetVersion,
} from './electronService/windowFs';
import {
  diagnosticsAppendRendererLog, diagnosticsListLogs, diagnosticsGetUsage,
  diagnosticsClearLogs, diagnosticsClearRendererLogs, diagnosticsExportLogs,
  getStoragePath, getMachineId,
} from './electronService/diagnostics';
import {
  projectSetStorageRoot, projectList, projectCreate, projectLoad, projectLoadFull,
  projectBindOwnerRefMedia, projectSave, projectUpdate, projectDelete, projectRebuildIndex,
  projectExport, projectImport,
  batchApi, characterApi, sceneApi, propApi, shotApi, assetApi, episodeApi,
  timelineApi, linghuiApi,
} from './electronService/entities';

export * from './electronService/types';
export { isElectron, normalizePath } from './electronService/core';
export * from './electronService/windowFs';
export * from './electronService/diagnostics';
export * from './electronService/entities';

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
    readFileAsBase64: fsReadFileAsBase64,
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
      return toKomaLocalUrl(filePath);
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
  diagnostics: {
    appendRendererLog: diagnosticsAppendRendererLog,
    listLogs: diagnosticsListLogs,
    getUsage: diagnosticsGetUsage,
    clearLogs: diagnosticsClearLogs,
    clearRendererLogs: diagnosticsClearRendererLogs,
    exportLogs: diagnosticsExportLogs,
  },
  getStoragePath,
  getMachineId,
  project: {
    setStorageRoot: projectSetStorageRoot,
    list: projectList,
    create: projectCreate,
    load: projectLoad,
    loadFull: projectLoadFull,
    bindOwnerRefMedia: projectBindOwnerRefMedia,
    save: projectSave,
    update: projectUpdate,
    remove: projectDelete,
    rebuildIndex: projectRebuildIndex,
    export: projectExport,
    import: projectImport,
  },
  // 批量实体 API
  batch: batchApi,
  // 实体 CRUD API（通过 IPC 调后端）
  character: characterApi,
  scene: sceneApi,
  prop: propApi,
  shot: shotApi,
  asset: assetApi,
  episode: episodeApi,
  timeline: timelineApi,
  linghui: linghuiApi,
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
        if (channel === 'controller/plugin/activate') {
          return (api as any).plugin.activate(args.manifest);
        }
        if (channel === 'controller/plugin/deactivate') {
          return (api as any).plugin.deactivate(args.pluginId);
        }
        if (channel === 'controller/plugin/status') {
          return (api as any).plugin.status(args.pluginId);
        }
        if (channel === 'controller/plugin/listActive') {
          return (api as any).plugin.listActive();
        }
      }
      // 通用 IPC 调用（通过 window.electron）
      const bridgeWindow = typeof window === 'undefined' ? null : (window as ElectronBridgeWindow);
      if (bridgeWindow?.electron?.ipcRenderer) {
        return bridgeWindow.electron.ipcRenderer.invoke(channel, args);
      }
      throw new Error(`IPC not available: ${channel}`);
    },
  },
};

export default electronService;
