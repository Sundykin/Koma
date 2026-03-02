/**
 * 应用控制器
 */
import { app, shell } from 'electron';

export class AppController {
  getPath(args: { name: string }) {
    const pathValue = app.getPath(args.name as any);
    return { path: pathValue };
  }

  getVersion() {
    return { version: app.getVersion() };
  }

  async openExternal(args: { url: string }) {
    await shell.openExternal(args.url);
    return { success: true };
  }

  showItemInFolder(args: { filePath: string }) {
    shell.showItemInFolder(args.filePath);
    return { success: true };
  }
}

AppController.toString = () => '[class AppController]';

export default AppController;
