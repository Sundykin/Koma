/**
 * Electron-Egg 主进程入口 (TypeScript)
 */
import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, protocol, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { controllers } from './controller';
import { services } from './service';
import config from './config';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

// MIME 类型映射
const mimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

// 校验路径是否在允许的目录范围内（防止路径遍历）
function isPathAllowed(filePath: string): boolean {
  const normalized = path.resolve(filePath);
  const home = app.getPath('home');
  const appData = app.getPath('appData');
  const userData = app.getPath('userData');
  const temp = app.getPath('temp');
  const allowedRoots = [home, appData, userData, temp];
  return allowedRoots.some(root => normalized.startsWith(root + path.sep) || normalized === root);
}

// 注册自定义协议用于加载本地文件（支持 Range 请求）
function registerLocalProtocol(): void {
  protocol.handle('koma-local', async (request) => {
    try {
      const url = new URL(request.url);
      // pathname 会是 /C%3A/Users/... 格式
      let filePath = decodeURIComponent(url.pathname);
      // 移除开头的斜杠（Windows 路径不需要）
      if (filePath.startsWith('/')) {
        filePath = filePath.slice(1);
      }

      const resolvedPath = path.resolve(filePath);
      if (!isPathAllowed(resolvedPath)) {
        console.warn('[koma-local] Path access denied:', resolvedPath);
        return new Response('Forbidden', { status: 403 });
      }
      filePath = resolvedPath;

      // 获取文件信息
      const stat = await fs.promises.stat(filePath);
      const fileSize = stat.size;
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      // 检查是否有 Range 请求（视频播放必需）
      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        // 解析 Range 头，格式: bytes=start-end
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          console.log('[koma-local] Range:', filePath, `${start}-${end}/${fileSize}`);

          // 读取指定范围的数据
          const fd = await fs.promises.open(filePath, 'r');
          const buffer = Buffer.alloc(chunkSize);
          await fd.read(buffer, 0, chunkSize, start);
          await fd.close();

          return new Response(buffer, {
            status: 206,
            headers: {
              'Content-Type': mimeType,
              'Content-Length': String(chunkSize),
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
            },
          });
        }
      }

      // 普通请求，返回整个文件
      console.log('[koma-local] Full:', filePath);
      const buffer = await fs.promises.readFile(filePath);

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
        },
      });
    } catch (err: any) {
      console.error('[koma-local] Error:', err.message);
      return new Response('File not found', { status: 404 });
    }
  });
}

function createWindow(): void {
  const { window: winConfig } = config;

  mainWindow = new BrowserWindow({
    width: winConfig.width,
    height: winConfig.height,
    minWidth: winConfig.minWidth,
    minHeight: winConfig.minHeight,
    frame: winConfig.frame,
    titleBarStyle: winConfig.titleBarStyle,
    backgroundColor: winConfig.backgroundColor,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload/index.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${config.dev.frontendPort}`);
    if (config.dev.openDevTools) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../public/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 注册 F12 / Ctrl+Shift+I 快捷键打开 DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow?.webContents.toggleDevTools();
    }
  });
}

function registerIpcRoutes(): void {
  // 通用路由: controller.xxx.method
  ipcMain.handle('controller', async (event: IpcMainInvokeEvent, channel: string, args: any) => {
    const parts = channel.split('.');
    if (parts.length < 3 || parts[0] !== 'controller') {
      throw new Error(`Invalid channel: ${channel}`);
    }

    const [, controllerName, methodName] = parts;
    const controller = (controllers as any)[controllerName];

    if (!controller) {
      throw new Error(`Controller not found: ${controllerName}`);
    }

    const method = controller[methodName];
    if (typeof method !== 'function') {
      throw new Error(`Method not found: ${controllerName}.${methodName}`);
    }

    return await method.call(controller, args, event);
  });

  // 兼容旧格式
  ipcMain.handle('window:minimize', (event) => controllers.window.minimize({}, event));
  ipcMain.handle('window:maximize', (event) => controllers.window.maximize({}, event));
  ipcMain.handle('window:close', (event) => controllers.window.close({}, event));
  ipcMain.handle('window:isMaximized', (event) => controllers.window.isMaximized({}, event));

  ipcMain.handle('dialog:openFile', (event, options) => controllers.dialog.openFile(options, event));
  ipcMain.handle('dialog:openDirectory', (event, options) => controllers.dialog.openDirectory(options, event));
  ipcMain.handle('dialog:saveFile', (event, options) => controllers.dialog.saveFile(options, event));

  ipcMain.handle('fs:readFile', (_, filePath) => controllers.fs.readFile({ filePath }));
  ipcMain.handle('fs:writeFile', (_, filePath, data, binary) => controllers.fs.writeFile({ filePath, data, binary }));
  ipcMain.handle('fs:downloadFile', (_, url, destPath) => controllers.fs.downloadFile({ url, destPath }));
  ipcMain.handle('fs:exists', (_, filePath) => controllers.fs.exists({ filePath }));
  ipcMain.handle('fs:mkdir', (_, dirPath) => controllers.fs.mkdir({ dirPath }));
  ipcMain.handle('fs:readdir', (_, dirPath) => controllers.fs.readdir({ dirPath }));
  ipcMain.handle('fs:stat', (_, filePath) => controllers.fs.stat({ filePath }));
  ipcMain.handle('fs:remove', (_, filePath) => controllers.fs.remove({ filePath }));
  ipcMain.handle('fs:copy', (_, src, dest) => controllers.fs.copy({ src, dest }));

  ipcMain.handle('shell:openExternal', (_, url) => controllers.app.openExternal({ url }));
  ipcMain.handle('shell:showItemInFolder', (_, filePath) => controllers.app.showItemInFolder({ filePath }));

  ipcMain.handle('app:getPath', (_, name) => controllers.app.getPath({ name }));
  ipcMain.handle('app:getVersion', () => controllers.app.getVersion());

  // 插件管理
  ipcMain.handle('plugin:validate', (_, zipPath) => controllers.plugin.validate({ zipPath }));
  ipcMain.handle('plugin:install', (_, { zipPath, manifest }) => controllers.plugin.install({ zipPath, manifest }));
  ipcMain.handle('plugin:uninstall', (_, pluginPath) => controllers.plugin.uninstall({ pluginPath }));
  ipcMain.handle('plugin:list', () => controllers.plugin.list({}));
  ipcMain.handle('plugin:openFolder', (_, pluginPath) => controllers.plugin.openFolder({ pluginPath }));

  // 网络代理：让渲染进程的 LLM 请求通过主进程发出，绕过 CORS
  ipcMain.handle('net:fetch', async (_, args: { url: string; method?: string; headers?: Record<string, string>; body?: string }) => {
    try {
      const parsed = new URL(args.url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, status: 403, statusText: 'Only http/https URLs are allowed', body: '' };
      }

      const resp = await fetch(args.url, {
        method: args.method || 'GET',
        headers: args.headers,
        body: args.body,
      });
      const body = await resp.text();
      return { ok: resp.ok, status: resp.status, statusText: resp.statusText, body };
    } catch (err: any) {
      return { ok: false, status: 502, statusText: err.message || 'Network error', body: '' };
    }
  });

  // 插件运行时管理
  ipcMain.handle('plugin:activate', (_, args) => controllers.plugin.activate(args));
  ipcMain.handle('plugin:deactivate', (_, args) => controllers.plugin.deactivate(args));
  ipcMain.handle('plugin:status', (_, args) => controllers.plugin.status(args));
  ipcMain.handle('plugin:listActive', () => controllers.plugin.listActive({}));
  ipcMain.handle('plugin:listMCPTools', () => controllers.plugin.listMCPTools({}));
  ipcMain.handle('plugin:callMCPTool', (_, args) => controllers.plugin.callMCPTool(args));
  ipcMain.handle('plugin:listAgents', () => controllers.plugin.listAgents({}));
}

async function initServices(): Promise<void> {
  const storageRoot = config.storage?.defaultRoot;
  await services.project.init(
    storageRoot ? path.join(app.getPath('home'), storageRoot) : null
  );
  // 初始化 FFmpeg 服务
  await services.ffmpeg.init();
  // 初始化插件服务
  await services.plugin.init();
  // 初始化 Chat 控制器（注册 IPC handlers）
  controllers.chat.init();
}

app.whenReady().then(async () => {
  registerLocalProtocol();

  // CSP: 限制脚本、样式、连接来源
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self' koma-local:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: koma-local: https: http:",
      "media-src 'self' blob: koma-local: https: http:",
      "connect-src 'self' https: http: ws: wss:",
    ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  await initServices();
  registerIpcRoutes();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
