import { importLinghuiWorkspaceAsset } from '../../../../store/linghuiStorage';
import { uploadLocalFileToImageHosting } from '../../../../services/imageHostingService';
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

export async function resolveUploadedFileSource(
  filePath: string,
  filename: string,
  options: {
    workspaceId: string | null | undefined;
    ossEnabled: boolean;
    kind: 'image' | 'video';
  },
): Promise<{ source: string; via: 'oss' | 'workspace' | 'path'; ossError?: string }> {
  if (options.ossEnabled) {
    const ossResult = await uploadLocalFileToImageHosting(filePath, { filename });
    if (ossResult.success && ossResult.url) {
      return { source: ossResult.url, via: 'oss' };
    }

    const ossError = ossResult.error || '图床上传失败';
    if (options.workspaceId) {
      const localSource = await importLinghuiWorkspaceAsset(options.workspaceId, filePath, filename);
      return { source: localSource, via: 'workspace', ossError };
    }
    return { source: filePath, via: 'path', ossError };
  }

  if (options.workspaceId) {
    const localSource = await importLinghuiWorkspaceAsset(options.workspaceId, filePath, filename);
    return { source: localSource, via: 'workspace' };
  }
  return { source: filePath, via: 'path' };
}
