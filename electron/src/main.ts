import { ElectronEgg } from 'ee-core';
import { Lifecycle } from './lifecycle';
import { preload } from './preload/init';

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
