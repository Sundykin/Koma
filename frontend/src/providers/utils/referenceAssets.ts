/**
 * 参考素材字节提取（multipart 直传场景共用）。
 *
 * 穗禾（Suihe）直连等渠道推荐用 multipart/form-data 把原始参考文件直接上传到本站，
 * 而不是先托管到公网对象存储再填外链。本 helper 把 ProviderAssetInput 统一解析成
 * (bytes, mimeType)：
 *   - data-url   → parseDataUrl 直接解出字节
 *   - remote-url → safeFetch 下载字节（渲染端下载，避开 fs controller 路径白名单）
 *
 * 与 OpenAICompatibleTTIProvider 里的私有 fetchReferenceBytes 同一模式，独立成模块
 * 供多个 Provider 复用。
 */
import { safeFetch } from '../../utils/safeFetch';
import { parseDataUrl } from '../../utils/encoding';

export interface ReferenceBytes {
  bytes: Uint8Array;
  mimeType: string;
}

export async function fetchReferenceBytes(ref: {
  transport: string;
  value: string;
  mimeType?: string;
}): Promise<ReferenceBytes> {
  if (!ref?.value) {
    throw new Error('参考素材为空');
  }
  if (ref.value.startsWith('data:')) {
    const parsed = parseDataUrl(ref.value);
    return {
      bytes: parsed.bytes,
      mimeType: parsed.mimeType || ref.mimeType || 'image/png',
    };
  }
  if (ref.transport === 'remote-url' || /^https?:\/\//i.test(ref.value)) {
    const resp = await safeFetch(ref.value);
    if (!resp || !resp.ok) {
      throw new Error(`下载参考素材失败 (${resp?.status ?? 'no response'}): ${ref.value}`);
    }
    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const mimeType = ref.mimeType
      || resp.headers.get('content-type')?.split(';')[0]
      || 'image/png';
    return { bytes, mimeType };
  }
  throw new Error(`不支持的参考素材输入: ${ref.transport}:${ref.value}`);
}

export function extFromMime(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('quicktime') || m.includes('mov')) return 'mov';
  if (m.includes('mpeg') && m.includes('audio')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'png';
}
