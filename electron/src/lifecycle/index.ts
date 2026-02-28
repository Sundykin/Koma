import { app as electronApp, BrowserWindow, Menu, screen, type Input } from 'electron';
import { getMainWindow } from 'ee-core/electron';
import { getConfig } from 'ee-core/config';
import { logger } from 'ee-core/log';
import { registerLocalProtocol } from '../bootstrap/protocol';
import { controllers } from '../controller';

const isDev = process.env.NODE_ENV === 'development' || !electronApp.isPackaged;

class Lifecycle {
  /**
   * Core app has been loaded
   */
  async ready(): Promise<void> {
    logger.info('[lifecycle] ready');

    // Enable remote debugging port in dev mode
    if (isDev) {
      const devtoolsPort = process.env.ELECTRON_DEVTOOLS_PORT || '9333';
      electronApp.commandLine.appendSwitch('remote-debugging-port', devtoolsPort);
      electronApp.commandLine.appendSwitch('remote-allow-origins', '*');
    }

    // Remove default application menu
    Menu.setApplicationMenu(null);
  }

  /**
   * Electron app is ready
   */
  async electronAppReady(): Promise<void> {
    logger.info('[lifecycle] electron-app-ready');

    electronApp.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        electronApp.quit();
      }
    });

    electronApp.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        // ee-core will handle window recreation
      }
    });

    electronApp.on('second-instance', () => {
      const win = getMainWindow();
      if (win.isMinimized()) {
        win.restore();
      }
      win.show();
      win.focus();
    });
  }

  /**
   * Main window has been loaded
   */
  async windowReady(): Promise<void> {
    logger.info('[lifecycle] window-ready');

    const win = getMainWindow();

    // Set workflow controller window reference
    controllers.workflow.setWindow(win);

    // Center and scale window proportionally
    const mainScreen = screen.getPrimaryDisplay();
    const { width, height } = mainScreen.workAreaSize;
    const windowWidth = Math.floor(width * 0.6);
    const windowHeight = Math.floor(height * 0.8);
    const x = Math.floor((width - windowWidth) / 2);
    const y = Math.floor((height - windowHeight) / 2);
    win.setBounds({ x, y, width: windowWidth, height: windowHeight });

    // Delay loading, no white screen
    const config = getConfig();
    const { windowsOption } = config;
    if (windowsOption?.show === false) {
      win.once('ready-to-show', () => {
        win.show();
        win.focus();
      });
    }

    // DevTools shortcut
    win.webContents.on('before-input-event', (_event: unknown, input: Input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        win.webContents.toggleDevTools();
      }
    });
  }

  /**
   * Before app close
   */
  async beforeClose(): Promise<void> {
    logger.info('[lifecycle] before-close');
  }
}

Lifecycle.toString = () => '[class Lifecycle]';

export { Lifecycle };
