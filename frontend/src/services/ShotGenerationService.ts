/**
 * 分镜图片生成服务（收口版）
 *
 * OpenSpec: 分镜生图统一走 workflow + MediaGenerationService，不再走 TaskManager。
 */
import type { Character, Scene, StoredMediaAsset } from '../types';
import { loadEpisodeShots } from '../store/projectStore';
import { shotImageWorkflow } from '../workflow/shotImageWorkflow';
import { runWithConcurrency } from '../utils/concurrency';
import type { StyleSnapshotLike } from '../utils/promptNormalize';

export async function generateShotImage(
  projectId: string,
  episodeId: string,
  shotId: string,
  characters: Character[],
  scenes: Scene[],
  ttiSelection?: string,
  styleOptions?: {
    aspectRatio?: '16:9' | '9:16';
    theme?: string;
    stylePrompt?: string;
    styleSnapshot?: StyleSnapshotLike;
    project?: { styleSnapshot?: StyleSnapshotLike; aspectRatio?: '16:9' | '9:16' };
    onProgress?: (progress: number, step?: string) => void;
  }
): Promise<StoredMediaAsset> {
  const shots = await loadEpisodeShots(projectId, episodeId);
  const shot = shots.find(s => s.id === shotId);
  if (!shot) {
    throw new Error('分镜不存在');
  }

  const workflowParams = {
    projectId,
    episodeId,
    shot,
    characters,
    scenes,
    ttiSelection,
    aspectRatio: styleOptions?.aspectRatio,
    theme: styleOptions?.theme,
    stylePrompt: styleOptions?.stylePrompt,
    styleSnapshot: styleOptions?.styleSnapshot,
    project: styleOptions?.project,
    onProgress: styleOptions?.onProgress,
  };

  return shotImageWorkflow(workflowParams);
}

export async function batchGenerateShotImages(
  projectId: string,
  episodeId: string,
  shotIds: string[],
  characters: Character[],
  scenes: Scene[],
  ttiSelection?: string,
  styleOptions?: {
    aspectRatio?: '16:9' | '9:16';
    theme?: string;
    stylePrompt?: string;
    styleSnapshot?: StyleSnapshotLike;
    project?: { styleSnapshot?: StyleSnapshotLike; aspectRatio?: '16:9' | '9:16' };
    onProgress?: (overall: number, current: { shotId: string; progress: number; step?: string }) => void;
  }
): Promise<Array<{ shotId: string; success: boolean; asset?: StoredMediaAsset; error?: string }>> {
  if (shotIds.length === 0) return [];

  // 预加载 shots，避免并发时 N 次重复 IO
  const allShots = await loadEpisodeShots(projectId, episodeId);

  let completedCount = 0;
  const tasks = shotIds.map((shotId) => async () => {
    const shot = allShots.find(s => s.id === shotId);
    if (!shot) {
      completedCount++;
      return { shotId, success: false as const, error: '分镜不存在' };
    }

    const workflowParams = {
      projectId,
      episodeId,
      shot,
      characters,
      scenes,
      ttiSelection,
      aspectRatio: styleOptions?.aspectRatio,
      theme: styleOptions?.theme,
      stylePrompt: styleOptions?.stylePrompt,
      styleSnapshot: styleOptions?.styleSnapshot,
      project: styleOptions?.project,
      onProgress: (progress: number, step?: string) => {
        const overall = Math.round(((completedCount + progress / 100) / shotIds.length) * 100);
        styleOptions?.onProgress?.(overall, { shotId, progress, step });
      },
    };

    const asset = await shotImageWorkflow(workflowParams);
    completedCount++;
    return { shotId, success: true as const, asset };
  });

  const settled = await runWithConcurrency(tasks, 2);

  return settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { shotId: shotIds[i], success: false, error: (r.reason as Error)?.message || String(r.reason) }
  );
}
