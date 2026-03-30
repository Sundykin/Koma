import { app as electronApp } from 'electron';
import { ElectronEgg } from 'ee-core';
import { join } from 'node:path';
import { Lifecycle } from './preload/lifecycle';
import { preload } from './preload';

const ELECTRON_REMOTE_DEBUGGING_PORT = process.env.KOMA_ELECTRON_REMOTE_DEBUGGING_PORT || '9333';
const isDev = process.env.NODE_ENV === 'development' || !electronApp.isPackaged;

if (isDev) {
  electronApp.commandLine.appendSwitch('remote-debugging-port', ELECTRON_REMOTE_DEBUGGING_PORT);
  electronApp.setPath(
    'userData',
    join(electronApp.getPath('appData'), `koma-electron-mcp-dev-${ELECTRON_REMOTE_DEBUGGING_PORT}`)
  );

  console.info(
    `[electron-devtools] chrome-devtools-mcp browser-url=http://127.0.0.1:${ELECTRON_REMOTE_DEBUGGING_PORT}`
  );
}

const app = new ElectronEgg();
const lifecycle = new Lifecycle();

app.register('ready', lifecycle.ready);
app.register('electron-app-ready', lifecycle.electronAppReady);
app.register('window-ready', lifecycle.windowReady);
app.register('before-close', lifecycle.beforeClose);
app.register('preload', preload);

app.run();
