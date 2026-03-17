/**
 * 应用控制器
 */
import { app, shell } from 'electron';
import { BaseController } from './base';

const ALLOWED_PATH_NAMES = new Set([
  'home', 'appData', 'userData', 'temp', 'desktop',
  'documents', 'downloads', 'music', 'pictures', 'videos',
]);

class AppController extends BaseController {
  getPath(args: { name: string }) {
    if (!ALLOWED_PATH_NAMES.has(args.name)) {
      throw new Error(`Invalid path name: ${args.name}`);
    }
    const pathValue = app.getPath(args.name as any);
    return { path: pathValue };
  }

  getVersion() {
    return { version: app.getVersion() };
  }

  async openExternal(args: { url: string }) {
    const parsed = new URL(args.url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http/https URLs are allowed');
    }
    await shell.openExternal(args.url);
    return { success: true };
  }

  showItemInFolder(args: { filePath: string }) {
    shell.showItemInFolder(args.filePath);
    return { success: true };
  }
}

export = AppController;
