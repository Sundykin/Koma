import { ElectronEgg } from 'ee-core';
import { Lifecycle } from './preload/lifecycle';
import { preload } from './preload';

const app = new ElectronEgg();
const lifecycle = new Lifecycle();

app.register('ready', lifecycle.ready);
app.register('electron-app-ready', lifecycle.electronAppReady);
app.register('window-ready', lifecycle.windowReady);
app.register('before-close', lifecycle.beforeClose);
app.register('preload', preload);

app.run();
