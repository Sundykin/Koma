import {
  app as electronApp,
  Menu,
  type Event as ElectronEvent,
  type Input,
  type MenuItemConstructorOptions,
} from 'electron';
import { eventBus, Preload } from 'ee-core/app/events';
import { createMainWindow, getMainWindow, loadServer, restoreMainWindow } from 'ee-core/electron/window';
import { logger } from 'ee-core/log';
import { closeServices } from '../service';

const isMac = process.platform === 'darwin';

function configureApplicationMenu(): void {
  if (!isMac) return;

  const template: MenuItemConstructorOptions[] = [
    {
      label: electronApp.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function hideMacWindowControls(): void {
  if (!isMac) return;

  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;

  win.setWindowButtonVisibility(false);
}

export class Lifecycle {
  ready(): void {
    logger.info('[lifecycle] ready');
  }

  electronAppReady(): void {
    logger.info('[lifecycle] electron-app-ready');
    configureApplicationMenu();

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
    hideMacWindowControls();

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
    closeServices();
  }
}
