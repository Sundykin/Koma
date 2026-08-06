/**
 * 窗口控制 / 文件对话框 / 文件系统 / Shell / App 信息（从 electronService.ts 拆出）
 */
import { getElectronAPI, normalizePath } from './core';
import type {
  OpenFileOptions,
  SaveFileOptions,
  OpenDialogResult,
  SaveDialogResult,
  FileStat,
} from './types';

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
    const result = await api.window.isMaximized();
    return typeof result === 'object' && result !== null && 'isMaximized' in result
      ? Boolean(result.isMaximized)
      : Boolean(result);
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

export const fsReadFileAsBase64 = async (path: string): Promise<string> => {
  const api = getElectronAPI();
  if (api) {
    const result = await api.fs.readFileAsBase64(path);
    return typeof result === 'object' && result !== null && 'base64' in result
      ? (result as { base64: string }).base64
      : (result as string);
  }
  throw new Error('File system not available in browser');
};

export const fsWriteFile = async (
  path: string,
  data: string,
  binary?: boolean
): Promise<void> => {
  const api = getElectronAPI();
  if (api) {
    await api.fs.writeFile(path, data, binary);
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
  destPath: string,
  options?: { headers?: Record<string, string>; channelId?: string }
): Promise<{ success: boolean; size: number; path?: string; mimeType?: string }> => {
  const api = getElectronAPI();
  if (api) {
    const result = await api.fs.downloadFile(url, destPath, options) as any;
    if (result?.success === false) {
      throw new Error(result.error || result.message || '文件下载失败');
    }
    if (!result?.success) {
      throw new Error('文件下载失败：IPC 未返回成功状态');
    }
    return result;
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

