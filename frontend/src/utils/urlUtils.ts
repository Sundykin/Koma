/**
 * URL 工具函数
 */

/**
 * 将本地路径转换为 koma-local:// 协议 URL
 * 用于 Electron 环境中加载本地文件
 */
export function toKomaLocalUrl(path: string): string {
  if (!path) return '';

  // 已经是 URL，直接返回
  if (path.startsWith('http://') ||
      path.startsWith('https://') ||
      path.startsWith('koma-local://') ||
      path.startsWith('data:') ||
      path.startsWith('blob:')) {
    return path;
  }

  // 转换本地路径为 koma-local:// 协议
  // Windows 路径需要处理反斜杠
  return `koma-local:///${path.replace(/\\/g, '/')}`;
}

/**
 * 从 koma-local:// URL 提取本地路径
 */
export function fromKomaLocalUrl(url: string): string {
  if (!url) return '';

  if (url.startsWith('koma-local:///')) {
    return url.slice('koma-local:///'.length);
  }

  return url;
}
