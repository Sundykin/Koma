/**
 * 文件系统控制器
 */
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { BaseController } from './base';

class FsController extends BaseController {
  async readFile(args: { filePath: string; encoding?: BufferEncoding }) {
    const content = await fs.promises.readFile(args.filePath, args.encoding || 'utf-8');
    return { content };
  }

  async readFileAsBase64(args: { filePath: string }) {
    const buffer = await fs.promises.readFile(args.filePath);
    return { base64: buffer.toString('base64') };
  }

  async writeFile(args: { filePath: string; data: string; encoding?: BufferEncoding; binary?: boolean }) {
    console.log('[FsController:writeFile] path:', args.filePath, 'binary:', args.binary, 'dataLen:', args.data?.length);
    if (args.binary) {
      // binary 模式：data 是 base64 编码的二进制数据
      const buffer = Buffer.from(args.data, 'base64');
      console.log('[FsController:writeFile] 解码后 buffer 大小:', buffer.length);
      await fs.promises.writeFile(args.filePath, buffer);
    } else {
      await fs.promises.writeFile(args.filePath, args.data, args.encoding || 'utf-8');
    }
    return { success: true };
  }

  // 从 URL 下载文件到本地（绕过 CORS）
  async downloadFile(args: { url: string; destPath: string }): Promise<{ success: boolean; size: number }> {
    const parsed = new URL(args.url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http/https URLs are allowed for download');
    }

    console.log('[FsController:downloadFile] url:', args.url);
    console.log('[FsController:downloadFile] destPath:', args.destPath);

    return new Promise((resolve, reject) => {
      const protocol = args.url.startsWith('https') ? https : http;

      protocol.get(args.url, (response) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            console.log('[FsController:downloadFile] 重定向到:', redirectUrl);
            this.downloadFile({ url: redirectUrl, destPath: args.destPath })
              .then(resolve)
              .catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${response.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(args.destPath);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log('[FsController:downloadFile] 下载完成，大小:', downloadedSize);
          resolve({ success: true, size: downloadedSize });
        });

        fileStream.on('error', (err) => {
          fs.unlink(args.destPath, () => {}); // 删除不完整的文件
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
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

export = FsController;
