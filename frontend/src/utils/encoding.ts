/**
 * Base64 / data-url 编解码工具
 */

/** 将 base64 字符串解码为 Uint8Array */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** 将 Uint8Array 编码为 base64 字符串（分块避免栈溢出） */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    let part = '';
    for (let j = 0; j < chunk.length; j += 1) part += String.fromCharCode(chunk[j]);
    binary += part;
  }
  return btoa(binary);
}

/** 解析 data-url，返回 mimeType 和原始字节 */
export function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) {
    throw new Error('不支持的 data-url 格式（需要 base64）');
  }
  return { mimeType: m[1] || 'application/octet-stream', bytes: base64ToBytes(m[2] || '') };
}

/** 从 data-url 中拆出 mimeType 和 base64 原始串 */
export function stripDataHeader(dataUrl: string): { mimeType?: string; base64: string } {
  const match = /^data:([^;,]+);base64,(.*)$/i.exec(dataUrl);
  if (match) return { mimeType: match[1], base64: match[2] };
  // 无标准 header 时尝试按逗号分割
  const idx = dataUrl.indexOf(',');
  return { base64: idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl };
}
