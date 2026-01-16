/**
 * 文件系统控制器
 */
import * as fs from 'fs';
import { BaseController } from './base';

export class FsController extends BaseController {
  async readFile(args: { filePath: string; encoding?: BufferEncoding }) {
    const content = await fs.promises.readFile(args.filePath, args.encoding || 'utf-8');
    return { content };
  }

  async writeFile(args: { filePath: string; data: string; encoding?: BufferEncoding }) {
    await fs.promises.writeFile(args.filePath, args.data, args.encoding || 'utf-8');
    return { success: true };
  }

  async exists(args: { filePath: string }) {
    try {
      await fs.promises.access(args.filePath);
      return { exists: true };
    } catch {
      return { exists: false };
    }
  }

  async mkdir(args: { dirPath: string; recursive?: boolean }) {
    await fs.promises.mkdir(args.dirPath, { recursive: args.recursive ?? true });
    return { success: true };
  }

  async readdir(args: { dirPath: string }) {
    const files = await fs.promises.readdir(args.dirPath);
    return { files };
  }

  async stat(args: { filePath: string }) {
    const stats = await fs.promises.stat(args.filePath);
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      createdAt: stats.birthtimeMs,
      modifiedAt: stats.mtimeMs,
    };
  }

  async remove(args: { filePath: string; recursive?: boolean }) {
    await fs.promises.rm(args.filePath, { recursive: args.recursive ?? true, force: true });
    return { success: true };
  }

  async copy(args: { src: string; dest: string }) {
    await fs.promises.copyFile(args.src, args.dest);
    return { success: true };
  }
}

export default FsController;
