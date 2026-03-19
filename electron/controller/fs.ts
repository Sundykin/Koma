/**
 * 文件系统控制器
 */
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import { app } from 'electron';
import { BaseController } from './base';
import { validateUrl } from '../service/url-validator';

function isPathAllowed(filePath: string): boolean {
  const normalized = path.resolve(filePath);
  const home = app.getPath('home');
  const appData = app.getPath('appData');
  const userData = app.getPath('userData');
  const temp = app.getPath('temp');
  const allowedRoots = [home, appData, userData, temp];
  return allowedRoots.some(root => normalized.startsWith(root + path.sep) || normalized === root);
}

function assertPathAllowed(filePath: string): void {
  if (!isPathAllowed(filePath)) {
    throw new Error('Access denied: path outside allowed directories');
  }
}

class FsController extends BaseController {
  async readFile(args: { filePath: string; encoding?: BufferEncoding }) {
    assertPathAllowed(args.filePath);
    const content = await fs.promises.readFile(args.filePath, args.encoding || 'utf-8');
    return { content };
  }

  async readFileAsBase64(args: { filePath: string }) {
    assertPathAllowed(args.filePath);
    const buffer = await fs.promises.readFile(args.filePath);
    return { base64: buffer.toString('base64') };
  }

  async writeFile(args: { filePath: string; data: string; encoding?: BufferEncoding; binary?: boolean }) {
    assertPathAllowed(args.filePath);
    if (args.binary) {
      const buffer = Buffer.from(args.data, 'base64');
      await fs.promises.writeFile(args.filePath, buffer);
    } else {
      await fs.promises.writeFile(args.filePath, args.data, args.encoding || 'utf-8');
    }
    return { success: true };
  }

  // 从 URL 下载文件到本地（绕过 CORS）
  // 最大重定向次数
  private static readonly MAX_REDIRECTS = 5;

  async downloadFile(args: { url: string; destPath: string }): Promise<{ success: boolean; size: number }> {
    assertPathAllowed(args.destPath);
    let currentUrl = args.url;

    for (let redirectCount = 0; redirectCount <= FsController.MAX_REDIRECTS; redirectCount++) {
      // SSRF 防护：每次请求（含重定向）都校验 URL
      await validateUrl(currentUrl);

      console.info('[FsController:downloadFile] url:', currentUrl, 'redirect:', redirectCount);

      const result = await new Promise<
        | { redirect: string }
        | { success: true; size: number }
      >((resolve, reject) => {
        const protocol = currentUrl.startsWith('https') ? https : http;

        protocol.get(currentUrl, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
            const redirectUrl = response.headers.location;
            response.resume(); // drain response
            if (redirectUrl) {
              // 处理相对路径重定向
              const resolved = new URL(redirectUrl, currentUrl).href;
              resolve({ redirect: resolved });
              return;
            }
            reject(new Error('重定向缺少 Location 头'));
            return;
          }

          if (response.statusCode !== 200) {
            response.resume();
            reject(new Error(`下载失败: HTTP ${response.statusCode}`));
            return;
          }

          const fileStream = fs.createWriteStream(args.destPath);
          let downloadedSize = 0;

          response.on('data', (chunk: Buffer) => {
            downloadedSize += chunk.length;
          });

          response.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            console.info('[FsController:downloadFile] 下载完成，大小:', downloadedSize);
            resolve({ success: true, size: downloadedSize });
          });

          fileStream.on('error', (err) => {
            fs.unlink(args.destPath, () => {});
            reject(err);
          });
        }).on('error', (err) => {
          reject(err);
        });
      });

      if ('redirect' in result) {
        currentUrl = result.redirect;
        continue;
      }

      return result;
    }

    throw new Error(`重定向次数超过上限 (${FsController.MAX_REDIRECTS})`);
  }

  async exists(args: { filePath: string }) {
    assertPathAllowed(args.filePath);
    try {
      await fs.promises.access(args.filePath);
      return { exists: true };
    } catch {
      return { exists: false };
    }
  }

  async mkdir(args: { dirPath: string; recursive?: boolean }) {
    assertPathAllowed(args.dirPath);
    await fs.promises.mkdir(args.dirPath, { recursive: args.recursive ?? true });
    return { success: true };
  }

  async readdir(args: { dirPath: string }) {
    assertPathAllowed(args.dirPath);
    const files = await fs.promises.readdir(args.dirPath);
    return { files };
  }

  async stat(args: { filePath: string }) {
    assertPathAllowed(args.filePath);
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
    assertPathAllowed(args.filePath);
    await fs.promises.rm(args.filePath, { recursive: args.recursive ?? true, force: true });
    return { success: true };
  }

  async copy(args: { src: string; dest: string }) {
    assertPathAllowed(args.src);
    assertPathAllowed(args.dest);
    await fs.promises.copyFile(args.src, args.dest);
    return { success: true };
  }
}

export = FsController;
