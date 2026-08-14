import { importLinghuiWorkspaceAsset } from '../../../../store/linghuiStorage';
import { readDroppedFileAsDataUrl } from '../state/linghuiCanvasShared';

export async function resolveDroppedFileSource(
  file: File,
  workspaceId: string | null | undefined,
): Promise<string> {
  const filePath = (file as File & { path?: string }).path;
  if (filePath) {
    if (workspaceId) {
      return importLinghuiWorkspaceAsset(workspaceId, filePath, file.name);
    }
    return filePath;
  }
  return readDroppedFileAsDataUrl(file);
}

/**
 * 上传的本地文件统一落到工作区资产目录（拿不到 workspaceId 时退回原始路径）。
 * 图床已移除：画布节点一律引用本地副本，下游 provider 自己读字节。
 */
export async function resolveUploadedFileSource(
  filePath: string,
  filename: string,
  workspaceId: string | null | undefined,
): Promise<{ source: string; via: 'workspace' | 'path' }> {
  if (workspaceId) {
    const localSource = await importLinghuiWorkspaceAsset(workspaceId, filePath, filename);
    return { source: localSource, via: 'workspace' };
  }
  return { source: filePath, via: 'path' };
}
