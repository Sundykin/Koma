/**
 * 日志记录系统
 * 支持文件和控制台日志
 */
import { electronService } from '../services/electronService';
import { getStorageConfig, initStorageConfig } from './storageConfig';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// 配置
let minLevel: LogLevel = 'info';
let enableConsole = true;
let enableFile = true;
let maxFileSize = 5 * 1024 * 1024; // 5MB
let maxFiles = 5;

async function getLogsPath(): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  return `${config.rootPath}/logs`;
}

// 格式化日志条目
function formatLogEntry(entry: LogEntry): string {
  const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : '';
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}${dataStr}`;
}

// 获取当前日志文件名
function getLogFileName(): string {
  const date = new Date().toISOString().split('T')[0];
  return `koma-${date}.log`;
}

// 写入文件日志（追加模式）
async function writeToFile(entry: LogEntry): Promise<void> {
  if (!electronService.isElectron() || !enableFile) return;

  try {
    const logsPath = await getLogsPath();
    await electronService.fs.mkdir(logsPath);

    const logFile = `${logsPath}/${getLogFileName()}`;
    const logLine = formatLogEntry(entry) + '\n';

    // 检查文件大小，需要轮转
    const exists = await electronService.fs.exists(logFile);
    let currentContent = '';
    if (exists) {
      const stats = await electronService.fs.stat(logFile);
      if (stats && stats.size > maxFileSize) {
        await rotateLogFiles(logsPath);
      } else {
        currentContent = await electronService.fs.readFile(logFile);
      }
    }

    // 追加写入（读取后重写）
    await electronService.fs.writeFile(logFile, currentContent + logLine);
  } catch (err) {
    console.error('写入日志文件失败:', err);
  }
}

// 日志文件轮转
async function rotateLogFiles(logsPath: string): Promise<void> {
  try {
    const files = await electronService.fs.readdir(logsPath);
    const logFiles = files
      .filter(f => f.startsWith('koma-') && f.endsWith('.log'))
      .sort()
      .reverse();

    // 删除超出数量限制的旧日志
    for (let i = maxFiles - 1; i < logFiles.length; i++) {
      await electronService.fs.remove(`${logsPath}/${logFiles[i]}`);
    }
  } catch (err) {
    console.error('日志轮转失败:', err);
  }
}

// 核心日志函数
function log(level: LogLevel, category: string, message: string, data?: any): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[minLevel]) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    data,
  };

  // 控制台输出
  if (enableConsole) {
    const consoleMethod = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : level === 'debug' ? console.debug
      : console.info;
    consoleMethod(`[${entry.timestamp}] [${category}] ${message}`, data ?? '');
  }

  // 文件输出
  writeToFile(entry);
}

// 创建分类日志器
export function createLogger(category: string) {
  return {
    debug: (message: string, data?: any) => log('debug', category, message, data),
    info: (message: string, data?: any) => log('info', category, message, data),
    warn: (message: string, data?: any) => log('warn', category, message, data),
    error: (message: string, data?: any) => log('error', category, message, data),
  };
}

// 配置日志系统
export function configureLogger(options: {
  minLevel?: LogLevel;
  enableConsole?: boolean;
  enableFile?: boolean;
  maxFileSize?: number;
  maxFiles?: number;
}) {
  if (options.minLevel !== undefined) minLevel = options.minLevel;
  if (options.enableConsole !== undefined) enableConsole = options.enableConsole;
  if (options.enableFile !== undefined) enableFile = options.enableFile;
  if (options.maxFileSize !== undefined) maxFileSize = options.maxFileSize;
  if (options.maxFiles !== undefined) maxFiles = options.maxFiles;
}

// 清理旧日志
export async function cleanOldLogs(daysToKeep: number = 7): Promise<number> {
  if (!electronService.isElectron()) return 0;

  try {
    const logsPath = await getLogsPath();
    const exists = await electronService.fs.exists(logsPath);
    if (!exists) return 0;

    const files = await electronService.fs.readdir(logsPath);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    let deletedCount = 0;
    for (const file of files) {
      if (file.startsWith('koma-') && file.endsWith('.log')) {
        const dateStr = file.replace('koma-', '').replace('.log', '');
        if (dateStr < cutoffStr) {
          await electronService.fs.remove(`${logsPath}/${file}`);
          deletedCount++;
        }
      }
    }

    return deletedCount;
  } catch (err) {
    console.error('清理日志失败:', err);
    return 0;
  }
}

// 获取日志文件列表
export async function getLogFiles(): Promise<{ name: string; size: number; date: string }[]> {
  if (!electronService.isElectron()) return [];

  try {
    const logsPath = await getLogsPath();
    const exists = await electronService.fs.exists(logsPath);
    if (!exists) return [];

    const files = await electronService.fs.readdir(logsPath);
    const logFiles: { name: string; size: number; date: string }[] = [];

    for (const file of files) {
      if (file.startsWith('koma-') && file.endsWith('.log')) {
        const stats = await electronService.fs.stat(`${logsPath}/${file}`);
        if (stats) {
          logFiles.push({
            name: file,
            size: stats.size,
            date: file.replace('koma-', '').replace('.log', ''),
          });
        }
      }
    }

    return logFiles.sort((a, b) => b.date.localeCompare(a.date));
  } catch (err) {
    console.error('获取日志列表失败:', err);
    return [];
  }
}

// 默认日志器
export const logger = createLogger('App');

export default {
  createLogger,
  configureLogger,
  cleanOldLogs,
  getLogFiles,
  logger,
};
