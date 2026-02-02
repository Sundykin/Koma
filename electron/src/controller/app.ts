/**
 * 应用控制器
 */
import { app, shell } from 'electron';
import { BaseController } from './base';

export class AppController extends BaseController {
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

export default AppController;
