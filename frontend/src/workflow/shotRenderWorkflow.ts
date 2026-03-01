/**
 * 分镜视频生成工作流
 * 纯 ITV 调用：使用已有参考图片（可选）生成视频
 */
import type { Shot, ShotVersion, Character, Prop } from '../types';
import { getProjectTTSProvider, getProjectITVProvider } from '../providers';
import { saveShotVersion, loadCharacters, loadProps } from '../store/projectStore';
import { createTask, markTaskCompleted, markTaskFailed } from '../store/taskQueueStore';
import { createLogger } from '../store/logger';
import { logITVCall, logTTSCall } from '../store/aiCallLogger';
import { getPromptTemplate, fillTemplate } from '../store/promptTemplates';
import { getThemeStylePrefixAsync } from '../config/themePresets';
import { parseMentions } from '../editor/mentionTypes';
import { taskQueueService } from '../services/taskQueueService';

const logger = createLogger('ShotRender');

interface ShotRenderParams {
  projectId: string;
  shot: Shot;
  projectConfigIds?: {
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  };
  theme?: string;
  stylePrompt?: string;
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
  theme?: string;
  stylePrompt?: string;
  concurrency?: number;
}

interface BatchRenderResult {
  total: number;
  success: number;
  failed: number;
  results: ShotRenderResult[];
}

interface ShotRenderDeps {
  getProjectTTSProvider: typeof getProjectTTSProvider;
  getProjectITVProvider: typeof getProjectITVProvider;
  saveShotVersion: typeof saveShotVersion;
  loadCharacters: typeof loadCharacters;
  loadProps: typeof loadProps;
  createTask: typeof createTask;
  markTaskCompleted: typeof markTaskCompleted;
  markTaskFailed: typeof markTaskFailed;
  getPromptTemplate: typeof getPromptTemplate;
  fillTemplate: typeof fillTemplate;
  getThemeStylePrefixAsync: typeof getThemeStylePrefixAsync;
  parseMentions: typeof parseMentions;
  logITVCall: typeof logITVCall;
  logTTSCall: typeof logTTSCall;
  random: () => number;
}

const defaultShotRenderDeps: ShotRenderDeps = {
  getProjectTTSProvider,
  getProjectITVProvider,
  saveShotVersion,
  loadCharacters,
  loadProps,
  createTask,
  markTaskCompleted,
  markTaskFailed,
  getPromptTemplate,
  fillTemplate,
  getThemeStylePrefixAsync,
  parseMentions,
  logITVCall,
  logTTSCall,
  random: Math.random,
};

/**
 * 从 shot 中获取当前选中的参考图片远程URL
 * 只返回 http/https 开头的远程地址
 */
export function getSelectedImageUrl(shot: Shot): string | undefined {
  const isRemoteUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://');

  if (shot.imagePaths && shot.imagePaths.length > 0) {
    const idx = shot.currentImageIndex || 0;
    const selected = shot.imagePaths[idx];
    if (selected && isRemoteUrl(selected)) {
      logger.info(`使用 imagePaths[${idx}] 远程URL: ${selected}`);
      return selected;
    }
  }

  if (shot.imageUrl && isRemoteUrl(shot.imageUrl)) {
    logger.info(`使用 imageUrl 远程URL: ${shot.imageUrl}`);
    return shot.imageUrl;
  }

  logger.info('没有可用的远程图片URL');
  return undefined;
}

interface ShotRenderRuntimeContext {
  deps: ShotRenderDeps;
  onProgress: (progress: number, step?: string) => void;
  projectId: string;
  shot: Shot;
  projectConfigIds?: ShotRenderParams['projectConfigIds'];
  theme?: string;
  stylePrompt?: string;
  audioPath?: string;
  videoPath?: string;
  remoteVideoUrl?: string;
  referenceImageUrl?: string;
  itvProviderName: string;
  itvTaskId?: string;
  characters: Character[];
  projectProps: Prop[];
  videoPrompt?: string;
  version?: ShotVersion;
}

type ShotRenderStage = (ctx: ShotRenderRuntimeContext) => Promise<void>;

const prepareShotRenderStage: ShotRenderStage = async (ctx) => {
  const { deps, projectId, projectConfigIds, shot, onProgress } = ctx;

  logger.info(`开始生成分镜视频 ${shot.id}`);

  try {
    ctx.characters = await deps.loadCharacters(projectId);
  } catch {
    ctx.characters = [];
  }

  ctx.referenceImageUrl = getSelectedImageUrl(shot);
  logger.info(`参考图片: ${ctx.referenceImageUrl || '无'}`);

  if (!shot.dialogue) {
    onProgress(20, '无台词，跳过语音');
    return;
  }

  onProgress(0, '生成语音...');
  try {
    const ttsProvider = await deps.getProjectTTSProvider(projectConfigIds?.ttsConfigId);
    if (ttsProvider) {
      const voices = await ttsProvider.listVoices();
      const voiceId = voices[0]?.id;

      if (voiceId) {
        deps.logTTSCall(
          ttsProvider.config?.name || 'TTS',
          shot.dialogue,
          voiceId,
          { rate: 1.0, pitch: 1.0 },
          { projectId, targetId: shot.id, targetName: `分镜语音: ${shot.id}` }
        );

        const audioResult = await ttsProvider.synthesize(shot.dialogue, voiceId, {
          rate: 1.0,
          pitch: 1.0,
        });
        ctx.audioPath = audioResult.path;
        logger.info(`语音生成完成: ${ctx.audioPath}`);
      }
    }
    onProgress(20, '语音生成完成');
  } catch (err: any) {
    logger.warn('语音生成失败', { error: err.message });
    onProgress(20, '语音生成跳过');
  }
};

const executeShotRenderStage: ShotRenderStage = async (ctx) => {
  const { deps, projectId, projectConfigIds, theme, stylePrompt, shot, onProgress } = ctx;

  onProgress(20, '生成视频...');

  const itvProvider = await deps.getProjectITVProvider(projectConfigIds?.itvConfigId);
  if (!itvProvider) {
    throw new Error('未配置 ITV 服务');
  }
  ctx.itvProviderName = itvProvider.config?.provider || 'unknown';

  const itvTask = await deps.createTask(projectId, {
    projectId,
    type: 'itv',
    targetType: 'shot',
    targetId: shot.id,
    targetName: `分镜视频: ${shot.id}`,
    remoteTaskId: '',
    status: 'pending',
    progress: 0,
    maxRetries: 3,
  });
  ctx.itvTaskId = itvTask.id;

  const stylePrefix = await deps.getThemeStylePrefixAsync(theme, stylePrompt);

  try {
    ctx.projectProps = await deps.loadProps(projectId);
  } catch {
    ctx.projectProps = [];
  }

  let videoPrompt: string;

  if (shot.videoPrompt) {
    videoPrompt = stylePrefix ? `${stylePrefix}${shot.videoPrompt}` : shot.videoPrompt;
    const processed = processVideoPromptAssets(videoPrompt, shot, ctx.characters, ctx.projectProps, deps.parseMentions);
    videoPrompt = processed.prompt;
  } else {
    try {
      const videoTemplate = await deps.getPromptTemplate('itv_shot_video');
      videoPrompt = deps.fillTemplate(videoTemplate.template, {
        stylePrefix: stylePrefix || '',
        description: shot.description || '',
        cameraMovement: getCameraMovementDesc(shot.cameraMovement),
      });
      videoPrompt = appendCharacterRefs(videoPrompt, shot, ctx.characters);
    } catch {
      videoPrompt = buildVideoPrompt(shot, ctx.characters, stylePrefix);
    }
  }

  ctx.videoPrompt = videoPrompt;
  logger.info(`视频 prompt: ${videoPrompt}`);

  deps.logITVCall(
    itvProvider.config?.name || 'ITV',
    ctx.referenceImageUrl || '',
    videoPrompt,
    { duration: shot.duration, motionPrompt: shot.cameraMovement },
    { projectId, targetId: shot.id, targetName: `分镜视频: ${shot.id}` }
  );

  const result = await itvProvider.generateVideo({
    imageUrl: ctx.referenceImageUrl || '',
    prompt: videoPrompt,
    options: { duration: shot.duration, motionPrompt: shot.cameraMovement },
  });

  if (result.url || (result as any).path) {
    ctx.videoPath = result.url || (result as any).path;
    ctx.remoteVideoUrl = ctx.videoPath;
    await deps.markTaskCompleted(projectId, itvTask.id, ctx.videoPath!, ctx.videoPath!);
    logger.info(`视频生成完成: ${ctx.videoPath}`);
    onProgress(95, '视频生成完成');
    return;
  }

  throw new Error('视频生成失败：未返回有效结果');
};

const persistShotRenderStage: ShotRenderStage = async (ctx) => {
  const { deps, projectId, shot, onProgress } = ctx;

  onProgress(95, '保存版本...');

  ctx.version = await deps.saveShotVersion(projectId, shot.id, {
    imagePath: ctx.referenceImageUrl,
    videoPath: ctx.videoPath,
    audioPath: ctx.audioPath,
    remoteImageUrl: ctx.referenceImageUrl,
    remoteVideoUrl: ctx.remoteVideoUrl,
    prompt: ctx.videoPrompt,
    seed: shot.seed || Math.floor(deps.random() * 1000000),
    model: ctx.itvProviderName,
  });

  logger.info(`分镜 ${shot.id} 视频生成完成，版本 ${ctx.version.version}`);
  onProgress(100, '完成');
};

async function runShotRenderStages(ctx: ShotRenderRuntimeContext, stages: ShotRenderStage[]): Promise<void> {
  for (const stage of stages) {
    await stage(ctx);
  }
}

/**
 * 新增：异步提交接口
 * 提交任务到队列并立即返回 taskId
 */
export async function submitShotRenderJob(
  params: ShotRenderParams,
  onProgress?: (progress: number, step?: string) => void
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  try {
    const taskId = await taskQueueService.submitTask('shot-render', {
      projectId: params.projectId,
      shot: params.shot,
      projectConfigIds: params.projectConfigIds,
      theme: params.theme,
      stylePrompt: params.stylePrompt,
    });

    if (onProgress) {
      taskQueueService.subscribe(taskId, (data) => {
        onProgress(data.progress, data.message);
      });
    }

    return { success: true, taskId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 分镜视频生成工作流
 * 保留原接口，内部调用新的异步接口并等待完成
 */
export async function shotRenderWorkflow(
  params: ShotRenderParams,
  onProgress: (progress: number, step?: string) => void,
  depsOverride?: Partial<ShotRenderDeps>
): Promise<ShotRenderResult> {
  // 如果提供了 depsOverride，使用旧的同步实现
  if (depsOverride) {
    return shotRenderWorkflowSync(params, onProgress, depsOverride);
  }

  // 使用新的异步队列实现
  const result = await submitShotRenderJob(params, onProgress);

  if (!result.success) {
    return {
      success: false,
      shotId: params.shot.id,
      error: result.error || 'Failed to submit task',
    };
  }

  const taskId = result.taskId!;

  return new Promise((resolve) => {
    const unsubscribe = taskQueueService.subscribe(taskId, async (data) => {
      if (data.status === 'completed') {
        unsubscribe();
        resolve({
          shotId: params.shot.id,
          version: data.result?.version || ({} as ShotVersion),
          success: true,
        });
      } else if (data.status === 'failed') {
        unsubscribe();
        resolve({
          shotId: params.shot.id,
          version: {} as ShotVersion,
          success: false,
          error: data.error,
        });
      }
    });
  });
}

/**
 * 旧的同步实现（用于测试和依赖注入场景）
 */
async function shotRenderWorkflowSync(
  params: ShotRenderParams,
  onProgress: (progress: number, step?: string) => void,
  depsOverride?: Partial<ShotRenderDeps>
): Promise<ShotRenderResult> {
  const deps: ShotRenderDeps = { ...defaultShotRenderDeps, ...depsOverride };
  const { projectId, shot, projectConfigIds, theme, stylePrompt } = params;

  const runtimeCtx: ShotRenderRuntimeContext = {
    deps,
    params,
    onProgress,
    projectId,
    shot,
    projectConfigIds,
    theme,
    stylePrompt,
    itvProviderName: 'unknown',
    characters: [],
    projectProps: [],
  };

  try {
    await runShotRenderStages(runtimeCtx, [
      prepareShotRenderStage,
      executeShotRenderStage,
      persistShotRenderStage,
    ]);

    return {
      shotId: shot.id,
      version: runtimeCtx.version as ShotVersion,
      success: true,
    };
  } catch (err: any) {
    if (runtimeCtx.itvTaskId) {
      try {
        await deps.markTaskFailed(projectId, runtimeCtx.itvTaskId, err.message || '未知错误');
      } catch {
        // ignore task failure update errors
      }
    }

    logger.error(`分镜 ${shot.id} 视频生成失败`, { error: err.message });
    return {
      shotId: shot.id,
      version: {} as ShotVersion,
      success: false,
      error: err.message,
    };
  }
}

/**
 * 批量生成视频
 */
export async function batchRenderShots(
  params: BatchRenderParams,
  onProgress: (overall: number, current: { shotId: string; progress: number; step?: string }) => void,
  depsOverride?: Partial<ShotRenderDeps>
): Promise<BatchRenderResult> {
  const { projectId, shots, projectConfigIds, theme, stylePrompt } = params;

  logger.info(`开始批量生成 ${shots.length} 个分镜视频`);

  const results: ShotRenderResult[] = [];
  let completed = 0;

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];

    const result = await shotRenderWorkflow(
      { projectId, shot, projectConfigIds, theme, stylePrompt },
      (progress, step) => {
        const overall = Math.round(((completed + progress / 100) / shots.length) * 100);
        onProgress(overall, { shotId: shot.id, progress, step });
      },
      depsOverride
    );

    results.push(result);
    completed++;

    const overall = Math.round((completed / shots.length) * 100);
    onProgress(overall, { shotId: shot.id, progress: 100, step: result.success ? '完成' : '失败' });
  }

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  logger.info(`批量生成完成: ${successCount} 成功, ${failedCount} 失败`);

  return {
    total: shots.length,
    success: successCount,
    failed: failedCount,
    results,
  };
}

function getCameraMovementDesc(movement?: string): string {
  if (!movement || movement === 'static') return 'static shot';
  const cameraDesc: Record<string, string> = {
    'pan': 'camera panning horizontally',
    'zoom-in': 'camera slowly zooming in',
    'tracking': 'camera tracking the subject',
    'handheld': 'handheld camera movement',
  };
  return cameraDesc[movement] || movement;
}

function processVideoPromptAssets(
  prompt: string,
  shot: Shot,
  characters: Character[],
  props: Prop[] | undefined,
  parseMentionsFn: typeof parseMentions,
): { prompt: string; referenceImages: string[] } {
  let result = prompt;
  const referenceImages: string[] = [];

  const mentions = parseMentionsFn(prompt);
  const sortedMentions = [...mentions].sort((a, b) => b.from - a.from);

  for (const mention of sortedMentions) {
    if (mention.type === 'char') {
      const char = characters.find(c => c.id === mention.id);
      if (char?.costumePhotoUrl) {
        referenceImages.push(char.costumePhotoUrl);
        const replacement = `[${char.name}: ${char.prompt || char.description || char.appearance || ''}]`;
        result = result.slice(0, mention.from) + replacement + result.slice(mention.to);
      }
    } else if (mention.type === 'prop') {
      const prop = props?.find(p => p.id === mention.id);
      if (prop?.imageUrl) {
        referenceImages.push(prop.imageUrl);
        const replacement = `[${prop.name}: ${prop.prompt || prop.description || ''}]`;
        result = result.slice(0, mention.from) + replacement + result.slice(mention.to);
      }
    }
  }

  return { prompt: result, referenceImages };
}

function appendCharacterRefs(prompt: string, shot: Shot, characters: Character[]): string {
  return prompt;
}

function buildVideoPrompt(shot: Shot, characters: Character[], stylePrefix?: string): string {
  let prompt = stylePrefix ? `${stylePrefix}${shot.description || ''}` : (shot.description || '');

  if (shot.cameraMovement && shot.cameraMovement !== 'static') {
    const cameraDesc: Record<string, string> = {
      'pan': 'camera panning horizontally',
      'zoom-in': 'camera slowly zooming in',
      'tracking': 'camera tracking the subject',
      'handheld': 'handheld camera movement',
    };
    if (cameraDesc[shot.cameraMovement]) {
      prompt = `${prompt}, ${cameraDesc[shot.cameraMovement]}`;
    }
  }

  return prompt;
}

export default {
  shotRenderWorkflow,
  batchRenderShots,
};
