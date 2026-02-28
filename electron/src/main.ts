/**
 * Electron-Egg 主进程入口 (TypeScript)
 */
import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, protocol, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { controllers } from './controller';
import { services } from './service';
import config from './config';
import { configManager } from './service/config';
import { fail, isDomainActionChannel, ok } from './ipc/contracts';
import { appEventBus } from './ipc/eventBus';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

if (isDev) {
  const devtoolsPort = process.env.ELECTRON_DEVTOOLS_PORT || '9333';
  app.commandLine.appendSwitch('remote-debugging-port', devtoolsPort);
}

let mainWindow: BrowserWindow | null = null;

const rendererEventSubscriptions = new Map<number, Map<string, () => void>>();

function getRendererEventOwner(webContentsId: number): string {
  return `renderer:${webContentsId}`;
}

function clearRendererSubscriptions(webContentsId: number): void {
  appEventBus.clearOwner(getRendererEventOwner(webContentsId));
  rendererEventSubscriptions.delete(webContentsId);
}

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
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: winConfig.width,
    height: winConfig.height,
    minWidth: winConfig.minWidth,
    minHeight: winConfig.minHeight,
    frame: winConfig.frame,
    titleBarStyle: isMac ? 'hiddenInset' : winConfig.titleBarStyle,
    backgroundColor: winConfig.backgroundColor,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload/index.js'),
    },
  });

  const currentWebContentsId = mainWindow.webContents.id;

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${config.dev.frontendPort}`);
    if (config.dev.openDevTools) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../public/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    clearRendererSubscriptions(currentWebContentsId);
    mainWindow = null;
  });

  mainWindow.webContents.on('destroyed', () => {
    clearRendererSubscriptions(currentWebContentsId);
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
  const invokeDomainAction = async (channel: string, args: unknown, event: IpcMainInvokeEvent) => {
    if (!isDomainActionChannel(channel)) {
      return fail(new Error(`Invalid IPC channel format: ${channel}`), 'INVALID_CHANNEL');
    }

    const [domain, action] = channel.split(':');
    const handler = (controllers as any)[domain]?.[action];

    if (typeof handler !== 'function') {
      return fail(new Error(`Handler not found: ${domain}.${action}`), 'HANDLER_NOT_FOUND');
    }

    try {
      const result = await handler.call((controllers as any)[domain], args ?? {}, event);
      return ok(result);
    } catch (error) {
      return fail(error, 'HANDLER_EXECUTION_FAILED');
    }
  };

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

  // 新规范路由: domain:action，统一结构化返回
  ipcMain.handle('rpc:invoke', async (event, request: { channel: string; args?: unknown }) => {
    return invokeDomainAction(request.channel, request.args, event);
  });

  // 事件总线 IPC
  ipcMain.handle('event:emit', (_, args: { event: string; payload?: unknown }) => {
    appEventBus.emit(args.event, args.payload);
    return ok({ emitted: true });
  });

  ipcMain.handle('event:subscribe', (event, args: { event: string }) => {
    const webContentsId = event.sender.id;
    const eventName = args?.event;

    if (!eventName) {
      return fail(new Error('Event name is required'), 'INVALID_EVENT_NAME');
    }

    if (!isDomainActionChannel(eventName) && !/^[a-z][a-z0-9-]*:\*$/.test(eventName)) {
      return fail(new Error(`Invalid event name: ${eventName}`), 'INVALID_EVENT_NAME');
    }

    const owner = getRendererEventOwner(webContentsId);
    const rendererSubscriptions = rendererEventSubscriptions.get(webContentsId) || new Map<string, () => void>();

    if (rendererSubscriptions.has(eventName)) {
      return ok({ subscribed: true, duplicated: true, event: eventName });
    }

    const unsubscribe = appEventBus.on(eventName, owner, (payload, actualEventName) => {
      event.sender.send('event:message', {
        event: actualEventName || eventName,
        payload,
      });
    });

    rendererSubscriptions.set(eventName, unsubscribe);
    rendererEventSubscriptions.set(webContentsId, rendererSubscriptions);

    return ok({ subscribed: true, event: eventName });
  });

  ipcMain.handle('event:unsubscribe', (event, args: { event?: string }) => {
    const webContentsId = event.sender.id;
    const eventName = args?.event;
    const subscriptions = rendererEventSubscriptions.get(webContentsId);

    if (!subscriptions) {
      return ok({ unsubscribed: true, event: eventName || '*', count: 0 });
    }

    if (!eventName) {
      clearRendererSubscriptions(webContentsId);
      return ok({ unsubscribed: true, event: '*', count: subscriptions.size });
    }

    const unsubscribe = subscriptions.get(eventName);
    if (!unsubscribe) {
      return ok({ unsubscribed: true, event: eventName, count: 0 });
    }

    unsubscribe();
    subscriptions.delete(eventName);

    if (!subscriptions.size) {
      rendererEventSubscriptions.delete(webContentsId);
    }

    return ok({ unsubscribed: true, event: eventName, count: 1 });
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

  // 插件运行时管理
  ipcMain.handle('plugin:activate', (_, args) => controllers.plugin.activate(args));
  ipcMain.handle('plugin:deactivate', (_, args) => controllers.plugin.deactivate(args));
  ipcMain.handle('plugin:status', (_, args) => controllers.plugin.status(args));
  ipcMain.handle('plugin:listRuntimeStates', () => controllers.plugin.listRuntimeStates({}));
  ipcMain.handle('plugin:getRuntimeState', (_, args) => controllers.plugin.getRuntimeState(args));
  ipcMain.handle('plugin:listActive', () => controllers.plugin.listActive({}));
  ipcMain.handle('plugin:listMCPTools', () => controllers.plugin.listMCPTools({}));
  ipcMain.handle('plugin:callMCPTool', (_, args) => controllers.plugin.callMCPTool(args));
  ipcMain.handle('plugin:listAgents', () => controllers.plugin.listAgents({}));
  ipcMain.handle('plugin:listProviderStatus', (_, args) => controllers.plugin.listProviderStatus(args || {}));
  ipcMain.handle('plugin:testProvider', (_, args) => controllers.plugin.testProvider(args));

  // 配置管理
  ipcMain.handle('config:get', (_, args) => controllers.config.get(args));
  ipcMain.handle('config:set', (_, args) => controllers.config.set(args));
  ipcMain.handle('config:reset', (_, args) => controllers.config.reset(args));
  ipcMain.handle('config:list', () => controllers.config.list());
  ipcMain.handle('config:import', (_, args) => controllers.config.import(args));
  ipcMain.handle('config:export', (_, args) => controllers.config.export(args));

  // 工作流管理
  ipcMain.handle('workflow:start', (_, args) => controllers.workflow.start(args));
  ipcMain.handle('workflow:pause', (_, args) => controllers.workflow.pause(args));
  ipcMain.handle('workflow:resume', (_, args) => controllers.workflow.resume(args));
  ipcMain.handle('workflow:cancel', (_, args) => controllers.workflow.cancel(args));
  ipcMain.handle('workflow:approve', (_, args) => controllers.workflow.approve(args));
  ipcMain.handle('workflow:getRun', (_, args) => controllers.workflow.getRun(args));
  ipcMain.handle('workflow:listRuns', () => controllers.workflow.listRuns());
}

async function initServices(): Promise<void> {
  const storageRoot = config.storage?.defaultRoot;
  const rootPath = storageRoot ? path.join(app.getPath('home'), storageRoot) : undefined;

  // 配置管理系统必须最先初始化（其他服务依赖配置）
  await configManager.init(rootPath);

  // 四个独立服务并行初始化，互不依赖
  const results = await Promise.allSettled([
    services.project.init(rootPath || null),
    services.ffmpeg.init(),
    services.plugin.init(),
    Promise.resolve(controllers.chat.init()),
  ]);

  // 记录失败的服务，但不阻塞启动
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const names = ['project', 'ffmpeg', 'plugin', 'chat'];
      console.error(`[Startup] ${names[index]} 服务初始化失败:`, result.reason);
    }
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  registerLocalProtocol();

  // IPC 路由注册不依赖 initServices，可以并行
  registerIpcRoutes();

  await initServices();
  createWindow();

  // 设置工作流控制器的窗口引用
  if (mainWindow) {
    controllers.workflow.setWindow(mainWindow);
  }
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
