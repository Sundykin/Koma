import { app, protocol } from 'electron';
import fs from 'fs';
import path from 'path';

const mimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

let registered = false;

function isPathAllowed(filePath: string): boolean {
  const normalized = path.resolve(filePath);
  const home = app.getPath('home');
  const appData = app.getPath('appData');
  const userData = app.getPath('userData');
  const temp = app.getPath('temp');
  const allowedRoots = [home, appData, userData, temp];
  return allowedRoots.some(root => normalized.startsWith(root + path.sep) || normalized === root);
}

export function registerLocalProtocol(): void {
  if (registered) return;
  registered = true;

  protocol.handle('koma-local', async request => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);

      // Windows: pathname 形如 /C:/Users/... 需要去掉开头的 /
      // macOS/Linux: pathname 形如 /Users/... 需要保留开头的 /
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.slice(1);
      }

      // 特殊处理：plugins-runtime/ 开头的相对路径，解析为 userData/plugins-runtime/
      if (filePath.startsWith('plugins-runtime/') || filePath.startsWith('/plugins-runtime/')) {
        const relativePath = filePath.replace(/^\/?(plugins-runtime\/.*)$/, '$1');
        filePath = path.join(app.getPath('userData'), relativePath);
      }

      const resolvedPath = path.resolve(filePath);
      if (!isPathAllowed(resolvedPath)) {
        return new Response('Forbidden', { status: 403 });
      }

      const stat = await fs.promises.stat(resolvedPath);
      const fileSize = stat.size;
      const ext = path.extname(resolvedPath).toLowerCase();
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          const chunkSize = end - start + 1;
          const fd = await fs.promises.open(resolvedPath, 'r');
          const buffer = Buffer.alloc(chunkSize);
          await fd.read(buffer, 0, chunkSize, start);
          await fd.close();

          return new Response(buffer, {
            status: 206,
            headers: {
              'Content-Type': mimeType,
              'Content-Length': String(chunkSize),
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
            },
          });
        }
      }

      const buffer = await fs.promises.readFile(resolvedPath);
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
        },
      });
    } catch {
      return new Response('File not found', { status: 404 });
    }
  });
}
