import { BrowserWindow } from 'electron';
import * as path from 'path';
import config from '../config';

function resolveAppEnv(): string {
  const envArg = process.argv.find((arg) => arg.startsWith('--env='));
  if (envArg) {
    return envArg.slice('--env='.length);
  }
  return process.env.NODE_ENV || 'development';
}

const appEnv = resolveAppEnv();
const isDev = appEnv === 'local' || appEnv === 'development';

export function createMainWindow(options: { onRendererCleanup: (webContentsId: number) => void }): BrowserWindow {
  const { window: winConfig } = config;
  const isMac = process.platform === 'darwin';

  const mainWindow = new BrowserWindow({
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
      preload: path.join(__dirname, '../preload/index.js'),
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
    options.onRendererCleanup(currentWebContentsId);
  });

  mainWindow.webContents.on('destroyed', () => {
    options.onRendererCleanup(currentWebContentsId);
  });

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  return mainWindow;
}
