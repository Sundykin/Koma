import { electronService } from './electronService';
import { getProjectTTSProvider, getProjectITVProvider } from '../providers';
import { saveShotVersion } from '../store/projectStore';
import { getSelectedImageUrl } from '../workflow/shotRenderWorkflow';
import { getThemeStylePrefixAsync } from '../config/themePresets';

export function setupDelegateHandler() {
  if (!electronService.isElectron()) return;

  (window as any).electronAPI?.task?.onDelegate?.(async (event: any, request: any) => {
    const { delegateId, taskId, phase, payload } = request;

    try {
      let result;

      switch (phase) {
        case 'prepareShotRenderStage':
          result = await handlePrepareStage(payload);
          break;
        case 'executeShotRenderStage':
          result = await handleExecuteStage(payload);
          break;
        case 'persistShotRenderStage':
          result = await handlePersistStage(payload);
          break;
        default:
          throw new Error(`Unknown delegate phase: ${phase}`);
      }

      (window as any).electronAPI.task.sendDelegateResult(delegateId, result);
    } catch (error: any) {
      (window as any).electronAPI.task.sendDelegateResult(delegateId, null, error.message);
    }
  });
}

async function handlePrepareStage(payload: any) {
  const { params } = payload;
  const { shot, projectConfigIds } = params;

  let audioPath = null;

  if (shot.dialogue) {
    const ttsProvider = await getProjectTTSProvider(projectConfigIds?.ttsConfigId);
    if (ttsProvider) {
      const voices = await ttsProvider.listVoices();
      const voiceId = voices[0]?.id;
      if (voiceId) {
        const audioResult = await ttsProvider.synthesize(shot.dialogue, voiceId, {
          rate: 1.0,
          pitch: 1.0,
        });
        audioPath = audioResult.path;
      }
    }
  }

  return { audioPath };
}

async function handleExecuteStage(payload: any) {
  const { params, prepare } = payload;
  const { shot, projectConfigIds, theme, stylePrompt } = params;

  const itvProvider = await getProjectITVProvider(projectConfigIds?.itvConfigId);
  if (!itvProvider) {
    throw new Error('未配置 ITV 服务');
  }

  const imageUrl = getSelectedImageUrl(shot);
  const stylePrefix = await getThemeStylePrefixAsync(theme, stylePrompt);
  const videoPrompt = buildVideoPrompt(shot, stylePrefix);

  const result = await itvProvider.generateVideo({
    imageUrl: imageUrl || '',
    prompt: videoPrompt,
    options: { duration: shot.duration, motionPrompt: shot.cameraMovement },
  });

  return {
    url: result.url || (result as any).path,
    prompt: videoPrompt,
    model: itvProvider.config?.provider || 'unknown',
  };
}

async function handlePersistStage(payload: any) {
  const { params, prepare, execute } = payload;
  const { projectId, shot } = params;

  const version = await saveShotVersion(projectId, shot.id, {
    audioPath: prepare?.audioPath,
    videoPath: execute?.url,
    remoteVideoUrl: execute?.url,
    prompt: execute?.prompt,
    seed: shot.seed || Math.floor(Math.random() * 1000000),
    model: execute?.model,
  });

  return { version };
}

function buildVideoPrompt(shot: any, stylePrefix?: string): string {
  let prompt = shot.videoPrompt || shot.description || '';
  if (stylePrefix && !prompt.startsWith(stylePrefix)) {
    prompt = `${stylePrefix}${prompt}`;
  }
  return prompt;
}
