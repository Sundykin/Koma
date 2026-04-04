import type { AsyncTask, MediaOwnerRef, StoredMediaAsset } from '../types';
import { electronService } from './electronService';

export async function bindCompletedMediaTask(
  projectId: string,
  task: AsyncTask,
  asset: StoredMediaAsset,
): Promise<void> {
  const ownerRef = task.ownerRef;
  if (!ownerRef || ownerRef.projectId !== projectId) return;
  await bindOwnerRefMedia(projectId, ownerRef, asset);
}

export async function bindOwnerRefMedia(
  projectId: string,
  ownerRef: MediaOwnerRef,
  asset: StoredMediaAsset,
): Promise<void> {
  if (!electronService.isElectron()) return;
  if (!ownerRef || ownerRef.projectId !== projectId) return;
  await electronService.project.bindOwnerRefMedia(projectId, ownerRef, asset);
}
