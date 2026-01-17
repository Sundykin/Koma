/**
 * 分镜渲染工作流
 * 完整的 Shot 渲染流程：图片 -> TTS -> 视频
 */
import type { Shot, AppSettings, ShotVersion } from '../types';
import { getProjectTTIProvider, getProjectTTSProvider, getProjectITVProvider } from '../providers';
import { saveShotVersion, loadShotMeta } from '../store/projectStore';
import { createLogger } from '../store/logger';

const logger = createLogger('ShotRender');

interface ShotRenderParams {
  projectId: string;
  shot: Shot;
  projectConfigIds?: {
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  };
}

interface ShotRenderResult {
  shotId: string;
  version: ShotVersion;
  success: boolean;
  error?: string;
}

interface BatchRenderParams {
  projectId: string;
  shots: Shot[];
  projectConfigIds?: {
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  };
  concurrency?: number;
}

interface BatchRenderResult {
  total: number;
  success: number;
  failed: number;
  results: ShotRenderResult[];
}

/**
 * 分镜渲染工作流处理器
 */
export async function shotRenderWorkflow(
  params: ShotRenderParams,
  onProgress: (progress: number, step?: string) => void
): Promise<ShotRenderResult> {
  const { projectId, shot, projectConfigIds } = params;

  logger.info(`开始渲染分镜 ${shot.id}`);

  let imagePath: string | undefined;
  let audioPath: string | undefined;
  let videoPath: string | undefined;
  let itvProviderName = 'unknown';

  try {
    // 步骤1: 生成图片 (0-30%)
    onProgress(0, '生成图片...');
    try {
      const ttiProvider = await getProjectTTIProvider(projectConfigIds?.ttiConfigId);
      if (!ttiProvider) {
        throw new Error('未配置 TTI 服务');
      }
      const imageResult = await ttiProvider.generateImage(shot.description, {
        width: 1280,
        height: 720,
      });
      imagePath = imageResult.path;
      logger.info(`图片生成完成: ${imagePath}`);
      onProgress(30, '图片生成完成');
    } catch (err: any) {
      logger.warn('图片生成失败', { error: err.message });
      onProgress(30, '图片生成跳过');
    }

    // 步骤2: 生成语音 (30-50%)
    if (shot.dialogue) {
      onProgress(30, '生成语音...');
      try {
        const ttsProvider = await getProjectTTSProvider(projectConfigIds?.ttsConfigId);
        if (!ttsProvider) {
          throw new Error('未配置 TTS 服务');
        }
        const voices = await ttsProvider.getVoices();
        const voiceId = voices[0]?.id;

        const audioResult = await ttsProvider.synthesize(shot.dialogue, voiceId!, {
          rate: 1.0,
          pitch: 1.0,
        });
        audioPath = audioResult.path;
        logger.info(`语音生成完成: ${audioPath}`);
        onProgress(50, '语音生成完成');
      } catch (err: any) {
        logger.warn('语音生成失败', { error: err.message });
        onProgress(50, '语音生成跳过');
      }
    } else {
      onProgress(50, '无台词，跳过语音');
    }

    // 步骤3: 生成视频 (50-95%)
    if (imagePath) {
      onProgress(50, '生成视频...');
      try {
        const itvProvider = await getProjectITVProvider(projectConfigIds?.itvConfigId);
        if (!itvProvider) {
          throw new Error('未配置 ITV 服务');
        }
        itvProviderName = itvProvider.config?.provider || 'unknown';

        const taskId = await itvProvider.submitTask(imagePath, {
          duration: shot.duration,
          motionPrompt: shot.cameraMovement,
        });

        // 轮询进度
        let videoProgress = await itvProvider.getProgress(taskId);
        while (videoProgress.status === 'processing' || videoProgress.status === 'queued') {
          await sleep(2000);
          videoProgress = await itvProvider.getProgress(taskId);
          const p = 50 + (videoProgress.progress || 0) * 0.45;
          onProgress(p, `视频生成中 ${Math.round(videoProgress.progress || 0)}%`);
        }

        if (videoProgress.status === 'completed' && videoProgress.resultUrl) {
          videoPath = videoProgress.resultUrl;
          logger.info(`视频生成完成: ${videoPath}`);
          onProgress(95, '视频生成完成');
        }
      } catch (err: any) {
        logger.warn('视频生成失败', { error: err.message });
        onProgress(95, '视频生成失败');
      }
    } else {
      onProgress(95, '无图片，跳过视频');
    }

    // 步骤4: 保存版本到 shots/{shotId}/versions/
    onProgress(95, '保存版本...');

    // 获取当前版本号
    const shotMeta = await loadShotMeta(projectId, shot.id);
    const currentVersion = shotMeta?.currentVersion || 0;

    const version = await saveShotVersion(projectId, shot.id, {
      imagePath,
      videoPath,
      audioPath,
      prompt: shot.description,
      seed: shot.seed || Math.floor(Math.random() * 1000000),
      model: itvProviderName,
    });

    logger.info(`分镜 ${shot.id} 渲染完成，版本 ${version.version}`);
    onProgress(100, '完成');

    return {
      shotId: shot.id,
      version,
      success: true,
    };
  } catch (err: any) {
    logger.error(`分镜 ${shot.id} 渲染失败`, { error: err.message });
    return {
      shotId: shot.id,
      version: {} as ShotVersion,
      success: false,
      error: err.message,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 批量渲染分镜
 */
export async function batchRenderShots(
  params: BatchRenderParams,
  onProgress: (overall: number, current: { shotId: string; progress: number; step?: string }) => void
): Promise<BatchRenderResult> {
  const { projectId, shots, settings, concurrency = 1 } = params;

  logger.info(`开始批量渲染 ${shots.length} 个分镜，并发数 ${concurrency}`);

  const results: ShotRenderResult[] = [];
  let completed = 0;

  // 简单实现：串行渲染（concurrency 参数预留给未来并行实现）
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];

    const result = await shotRenderWorkflow(
      { projectId, shot, settings },
      (progress, step) => {
        const overall = Math.round(((completed + progress / 100) / shots.length) * 100);
        onProgress(overall, { shotId: shot.id, progress, step });
      }
    );

    results.push(result);
    completed++;

    const overall = Math.round((completed / shots.length) * 100);
    onProgress(overall, { shotId: shot.id, progress: 100, step: result.success ? '完成' : '失败' });
  }

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  logger.info(`批量渲染完成: ${successCount} 成功, ${failedCount} 失败`);

  return {
    total: shots.length,
    success: successCount,
    failed: failedCount,
    results,
  };
}

export default {
  shotRenderWorkflow,
  batchRenderShots,
};
