import { protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

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

let protocolRegistered = false;

export function registerLocalProtocol(): void {
  if (protocolRegistered) {
    return;
  }
  protocol.handle('koma-local', async (request) => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);
      if (filePath.startsWith('/')) {
        filePath = filePath.slice(1);
      }

      const stat = await fs.promises.stat(filePath);
      const fileSize = stat.size;
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          const fd = await fs.promises.open(filePath, 'r');
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

      const buffer = await fs.promises.readFile(filePath);
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

  protocolRegistered = true;
}
