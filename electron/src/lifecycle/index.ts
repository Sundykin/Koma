import { app, BrowserWindow } from 'electron';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

export class Lifecycle {
  constructor(private options: {
    createWindow: () => BrowserWindow;
    onWindowReady?: (window: BrowserWindow) => void;
    onBeforeClose?: () => void;
  }) {}

  async ready(): Promise<void> {
    if (isDev) {
      const devtoolsPort = process.env.ELECTRON_DEVTOOLS_PORT || '9333';
      app.commandLine.appendSwitch('remote-debugging-port', devtoolsPort);
    }
  }

  async electronAppReady(): Promise<void> {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.options.createWindow();
      }
    });

    app.on('before-quit', () => {
      this.beforeClose();
    });
  }

  async windowReady(win: BrowserWindow): Promise<void> {
    this.options.onWindowReady?.(win);
  }

  async beforeClose(): Promise<void> {
    this.options.onBeforeClose?.();
  }
}
