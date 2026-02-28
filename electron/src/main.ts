import { app, BrowserWindow, Menu } from 'electron';
import * as path from 'path';
import { controllers } from './controller';
import { services } from './service';
import config from './config';
import { configManager } from './service/config';
import { registerLocalProtocol } from './bootstrap/protocol';
import { createMainWindow } from './bootstrap/window';
import { Lifecycle } from './lifecycle';
import { createRendererSubscriptionRegistry, registerIpcRoutes } from './ipc/router';

let mainWindow: BrowserWindow | null = null;

const subscriptions = createRendererSubscriptionRegistry();

async function initServices(): Promise<void> {
  const storageRoot = config.storage?.defaultRoot;
  const rootPath = storageRoot ? path.join(app.getPath('home'), storageRoot) : undefined;

  await configManager.init(rootPath);

  const initTasks: Array<{ name: string; run: () => Promise<unknown> }> = [
    { name: 'project', run: () => services.project.init(rootPath || null) },
    { name: 'ffmpeg', run: () => services.ffmpeg.init() },
    { name: 'plugin', run: () => services.plugin.init() },
    { name: 'chat', run: () => Promise.resolve(controllers.chat.init()) },
  ];

  await Promise.all(
    initTasks.map(async ({ name, run }) => {
      try {
        await run();
      } catch (error) {
        console.error(`[Startup] ${name} 服务初始化失败:`, error);
        throw new Error(`[Startup] ${name} init failed`);
      }
    })
  );
}

function createWindow(): BrowserWindow {
  const win = createMainWindow({
    onRendererCleanup: (webContentsId) => {
      subscriptions.clearRendererSubscriptions(webContentsId);
      if (mainWindow && mainWindow.webContents.id === webContentsId) {
        mainWindow = null;
      }
    },
  });
  mainWindow = win;
  return win;
}

async function bootstrap(): Promise<void> {
  Menu.setApplicationMenu(null);
  registerLocalProtocol();

  registerIpcRoutes({
    clearRendererSubscriptions: subscriptions.clearRendererSubscriptions,
    getRendererEventOwner: subscriptions.getRendererEventOwner,
    rendererEventSubscriptions: subscriptions.rendererEventSubscriptions,
  });

  await initServices();
  createWindow();
}

const lifecycle = new Lifecycle({
  createWindow,
  onWindowReady: (win) => {
    controllers.workflow.setWindow(win);
  },
});

lifecycle.ready().catch((error) => {
  console.error('[Lifecycle] ready error:', error);
});

app.whenReady().then(async () => {
  await lifecycle.electronAppReady();
  await bootstrap();
  if (mainWindow) {
    await lifecycle.windowReady(mainWindow);
  }
});
