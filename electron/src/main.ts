import { app as electronApp } from 'electron';
import { ElectronEgg } from 'ee-core';
import { Lifecycle } from './lifecycle';
import { preload } from './preload/init';

// Enable remote debugging in dev mode (must be set before app.ready)
const isDev = process.env.NODE_ENV === 'development' || !electronApp.isPackaged;
if (isDev) {
  const devtoolsPort = process.env.ELECTRON_DEVTOOLS_PORT || '9333';
  electronApp.commandLine.appendSwitch('remote-debugging-port', devtoolsPort);
  electronApp.commandLine.appendSwitch('remote-allow-origins', '*');
}

// New app
const app = new ElectronEgg();

// Register lifecycle
const life = new Lifecycle();
app.register('ready', life.ready);
app.register('electron-app-ready', life.electronAppReady);
app.register('window-ready', life.windowReady);
app.register('before-close', life.beforeClose);

// Register preload (service initialization)
app.register('preload', preload);

// Run
app.run();
