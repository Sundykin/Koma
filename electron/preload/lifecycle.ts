import { app as electronApp, type Event as ElectronEvent, type Input } from 'electron';
import { eventBus, Preload } from 'ee-core/app/events';
import { createMainWindow, getMainWindow, loadServer, restoreMainWindow } from 'ee-core/electron/window';
import { logger } from 'ee-core/log';

export class Lifecycle {
  ready(): void {
    logger.info('[lifecycle] ready');
  }

  electronAppReady(): void {
    logger.info('[lifecycle] electron-app-ready');

    electronApp.on('second-instance', () => {
      restoreMainWindow();
    });

    electronApp.on('activate', () => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        restoreMainWindow();
        return;
      }

      createMainWindow();
      eventBus.emitLifecycle(Preload);
      loadServer();
    });
  }

  windowReady(): void {
    logger.info('[lifecycle] window-ready');

    const win = getMainWindow();
    if (!win) return;

    win.webContents.on('before-input-event', (_event: ElectronEvent, input: Input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i')
      ) {
        win.webContents.toggleDevTools();
      }
    });
  }

  beforeClose(): void {
    logger.info('[lifecycle] before-close');
  }
}
