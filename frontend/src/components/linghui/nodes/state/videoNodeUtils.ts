export function isPlayableUrlSource(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://') || source.startsWith('data:') || source.startsWith('blob:');
}

export function inferVideoMimeType(source: string, mimeType?: string): string {
  const normalizedMimeType = String(mimeType ?? '').trim();
  if (normalizedMimeType) return normalizedMimeType;
  const normalizedSource = source.split('?')[0].split('#')[0].toLowerCase();
  if (normalizedSource.endsWith('.webm')) return 'video/webm';
  if (normalizedSource.endsWith('.mov')) return 'video/quicktime';
  if (normalizedSource.endsWith('.m4v')) return 'video/x-m4v';
  return 'video/mp4';
}

export function drawVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): boolean {
  const width = Math.max(1, Math.round(canvas.clientWidth || canvas.offsetWidth || 0));
  const height = Math.max(1, Math.round(canvas.clientHeight || canvas.offsetHeight || 0));
  if (width <= 0 || height <= 0 || video.videoWidth <= 0 || video.videoHeight <= 0 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return false;
  }

  const dpr = window.devicePixelRatio || 1;
  const scaledWidth = Math.max(1, Math.round(width * dpr));
  const scaledHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
  }

  let ctx: CanvasRenderingContext2D | null = null;
  try { ctx = canvas.getContext('2d'); } catch { ctx = null; }
  if (!ctx) return false;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--token-bg-app').trim() || 'Canvas';
  ctx.fillRect(0, 0, width, height);

  const sourceRatio = video.videoWidth / video.videoHeight;
  const targetRatio = width / height;
  let drawWidth = width, drawHeight = height, offsetX = 0, offsetY = 0;
  if (sourceRatio > targetRatio) {
    drawHeight = height;
    drawWidth = height * sourceRatio;
    offsetX = (width - drawWidth) / 2;
  } else {
    drawWidth = width;
    drawHeight = width / sourceRatio;
    offsetY = (height - drawHeight) / 2;
  }

  try { ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight); return true; }
  catch { return false; }
}
