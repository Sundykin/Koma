import { electronService } from '../../../../services/electronService';
import { importLinghuiWorkspaceAsset } from '../../../../store/linghuiStorage';

export function getFileNameHint(filePath: string): string | undefined {
  return filePath.split(/[\\/]/).pop();
}

export function shouldImportLocalImageToWorkspace(
  workspaceId: string | null | undefined,
  filePath: string,
): boolean {
  return Boolean(
    workspaceId
      && electronService.isElectron()
      && filePath
      && !filePath.startsWith('http://')
      && !filePath.startsWith('https://')
      && !filePath.startsWith('data:')
      && !filePath.startsWith('blob:'),
  );
}

export async function resolveImageFileSource(params: {
  workspaceId: string | null | undefined;
  filePath: string;
}): Promise<string> {
  const { workspaceId, filePath } = params;
  if (!shouldImportLocalImageToWorkspace(workspaceId, filePath)) {
    return filePath;
  }
  return importLinghuiWorkspaceAsset(workspaceId as string, filePath, getFileNameHint(filePath));
}
