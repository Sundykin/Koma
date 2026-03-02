/**
 * 窗口控制器
 */
import { BrowserWindow, IpcMainInvokeEvent } from 'electron';

export class WindowController {
  minimize(args: any, event?: IpcMainInvokeEvent) {
    const win = event ? BrowserWindow.fromWebContents(event.sender) : null;
    if (win) win.minimize();
    return { success: true };
  }

  maximize(args: any, event?: IpcMainInvokeEvent) {
    const win = event ? BrowserWindow.fromWebContents(event.sender) : null;
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
    return { success: true };
  }

  close(args: any, event?: IpcMainInvokeEvent) {
    const win = event ? BrowserWindow.fromWebContents(event.sender) : null;
    if (win) win.close();
    return { success: true };
  }

  isMaximized(args: any, event?: IpcMainInvokeEvent) {
    const win = event ? BrowserWindow.fromWebContents(event.sender) : null;
    return { isMaximized: win ? win.isMaximized() : false };
  }
}

WindowController.toString = () => '[class WindowController]';

export default WindowController;
