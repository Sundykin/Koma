/**
 * Electron-Egg 主进程入口 (TypeScript)
 */
import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, protocol } from 'electron';
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

// 注册自定义协议用于加载本地文件
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

      console.log('[koma-local] Loading:', filePath);

      // 读取文件
      const buffer = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': mimeType },
      });
    } catch (err: any) {
      console.error('[koma-local] Error loading file:', err.message);
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
}

async function initServices(): Promise<void> {
  const storageRoot = config.storage?.defaultRoot;
  await services.project.init(
    storageRoot ? path.join(app.getPath('home'), storageRoot) : null
  );
}

app.whenReady().then(async () => {
  registerLocalProtocol();
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
