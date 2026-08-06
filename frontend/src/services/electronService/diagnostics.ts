/**
 * 诊断日志 IPC 封装（从 electronService.ts 拆出）
 */
import { getElectronAPI, normalizePath } from './core';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import type {
  DiagnosticsRendererLogPayload,
  DiagnosticsLogSummary,
  DiagnosticsUsageSummary,
  DiagnosticsExportResult,
} from './types';

// ========== 诊断日志 ==========

export const diagnosticsAppendRendererLog = async (
  payload: DiagnosticsRendererLogPayload
): Promise<void> => {
  const api = getElectronAPI();
  if (!api?.diagnostics) return;
  await api.diagnostics.appendRendererLog(payload);
};

export const diagnosticsListLogs = async (): Promise<DiagnosticsLogSummary> => {
  const api = getElectronAPI();
  if (api?.diagnostics) {
    return await api.diagnostics.listLogs();
  }
  return {
    storageRoot: '',
    logsDir: '',
    electronLogsDir: '',
    files: [],
    totalSize: 0,
  };
};

export const diagnosticsGetUsage = async (): Promise<DiagnosticsUsageSummary> => {
  const api = getElectronAPI();
  if (api?.diagnostics?.getUsage) {
    return await api.diagnostics.getUsage();
  }
  const summary = await diagnosticsListLogs();
  return {
    storageRoot: summary.storageRoot,
    logsDir: summary.logsDir,
    totalSize: summary.totalSize,
    fileCount: summary.files.length,
  };
};

export const diagnosticsClearLogs = async (): Promise<{ success: boolean; removed: number }> => {
  const api = getElectronAPI();
  if (api?.diagnostics?.clearLogs) {
    return await api.diagnostics.clearLogs();
  }
  return { success: false, removed: 0 };
};

export const diagnosticsClearRendererLogs = async (): Promise<{ success: boolean; removed: number }> => {
  const api = getElectronAPI();
  if (api?.diagnostics) {
    return await api.diagnostics.clearRendererLogs();
  }
  return { success: false, removed: 0 };
};

export const diagnosticsExportLogs = async (destPath: string): Promise<DiagnosticsExportResult> => {
  const api = getElectronAPI();
  if (api?.diagnostics) {
    return await api.diagnostics.exportLogs(destPath);
  }
  throw new Error('Diagnostics export not available in browser');
};

// 获取存储根路径（与 storageConfig 使用同一来源）
export const getStoragePath = async (): Promise<string> => {
  if (typeof window !== 'undefined') {
    try {
      const data = window.localStorage?.getItem(STORAGE_KEYS.STORAGE_CONFIG);
      if (data) {
        const parsed = JSON.parse(data) as { rootPath?: string };
        const configuredPath = normalizePath(String(parsed.rootPath || ''));
        if (configuredPath) {
          return configuredPath;
        }
      }
    } catch {
      // fall through to default path
    }
  }

  const api = getElectronAPI();
  if (api) {
    const home = await api.app.getPath('home');
    const homePath = typeof home === 'object' && home !== null && 'path' in home
      ? (home as { path: string }).path
      : (home as string);
    return normalizePath(`${homePath}/.koma`);
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

