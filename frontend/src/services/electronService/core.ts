/**
 * Electron 环境探测与桥接访问（从 electronService.ts 拆出）
 */
import type { ElectronBridgeWindow, ElectronAPI } from './types';

export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && 'electronAPI' in (window as ElectronBridgeWindow);
};

// 统一路径斜杠为 /（跨平台兼容）
export const normalizePath = (path: string): string => {
  if (!path) return path;
  return path.replace(/\\/g, '/');
};

// 获取 Electron API（如果可用）
export const getElectronAPI = (): ElectronAPI | null => {
  if (typeof window === 'undefined') return null;
  return (window as ElectronBridgeWindow).electronAPI ?? null;
};
