/**
 * 分镜图片生成服务（收口版）
 *
 * OpenSpec: 分镜生图统一走 workflow + MediaGenerationService，不再走 TaskManager。
 */
import type { Character, Scene, StoredMediaAsset } from '../types';
import { loadEpisodeShots } from '../store/projectStore';
import { shotImageWorkflow } from '../workflow/shotImageWorkflow';

interface StyleSnapshotLike {
  ttiStylePrefix?: string;
}

export async function generateShotImage(
  projectId: string,
  episodeId: string,
  shotId: string,
  characters: Character[],
  scenes: Scene[],
  ttiConfigId?: string,
  styleOptions?: {
    theme?: string;
    stylePrompt?: string;
    styleSnapshot?: StyleSnapshotLike;
    project?: { styleSnapshot?: StyleSnapshotLike };
    onProgress?: (progress: number, step?: string) => void;
  }
): Promise<StoredMediaAsset> {
  const shots = await loadEpisodeShots(projectId, episodeId);
  const shot = shots.find(s => s.id === shotId);
  if (!shot) {
    throw new Error('分镜不存在');
  }

  return shotImageWorkflow({
    projectId,
    episodeId,
    shot,
    characters,
    scenes,
    ttiConfigId,
    theme: styleOptions?.theme,
    stylePrompt: styleOptions?.stylePrompt,
    styleSnapshot: styleOptions?.styleSnapshot,
    project: styleOptions?.project,
    onProgress: styleOptions?.onProgress,
  });
}

export async function batchGenerateShotImages(
  projectId: string,
  episodeId: string,
  shotIds: string[],
  characters: Character[],
  scenes: Scene[],
  ttiConfigId?: string,
  styleOptions?: {
    theme?: string;
    stylePrompt?: string;
    styleSnapshot?: StyleSnapshotLike;
    project?: { styleSnapshot?: StyleSnapshotLike };
    onProgress?: (overall: number, current: { shotId: string; progress: number; step?: string }) => void;
  }
): Promise<Array<{ shotId: string; success: boolean; asset?: StoredMediaAsset; error?: string }>> {
  const results: Array<{ shotId: string; success: boolean; asset?: StoredMediaAsset; error?: string }> = [];

  for (let i = 0; i < shotIds.length; i++) {
    const shotId = shotIds[i];
    try {
      const asset = await generateShotImage(projectId, episodeId, shotId, characters, scenes, ttiConfigId, {
        theme: styleOptions?.theme,
        stylePrompt: styleOptions?.stylePrompt,
        styleSnapshot: styleOptions?.styleSnapshot,
        project: styleOptions?.project,
        onProgress: (progress, step) => {
          const overall = Math.round(((i + progress / 100) / shotIds.length) * 100);
          styleOptions?.onProgress?.(overall, { shotId, progress, step });
        },
      });
      results.push({ shotId, success: true, asset });
    } catch (err: any) {
      results.push({ shotId, success: false, error: err?.message || String(err) });
    }
  }

  return results;
}

