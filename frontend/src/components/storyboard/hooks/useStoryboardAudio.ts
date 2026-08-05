/**
 * 分镜配音逻辑（从 Storyboard.tsx 拆出）。
 *
 * 剧情模式：字幕行已结构化（旁白/台词带说话人），按 buildShotVoiceSegments 拆段，
 * 每段经音色库解析 providerVoiceId（台词→角色音色、旁白→项目级音色），多段 TTS
 * 后由 ffmpeg 顺序拼接；解说模式：沿用 dialogue→scriptLines 单音色整段路径。
 * 解析出的绑定信息回写 shot.audioBindings 供 UI 展示。
 */
import { useCallback } from 'react';
import type { Shot, ShotAudioBinding, Character, StoredMediaAsset } from '../../../types';
import { buildShotVoiceSegments, getShotScriptText } from '../../../types';
import type { VoiceLibrarySnapshot } from '../../../types/voice-library';
import { mediaGenerationService } from '../../../services/MediaGenerationService';
import { prepareShotAudio } from '../../../services/voiceLibrary/shotVoiceCompile';
import { resolveShotLineVoice } from '../../../services/voiceLibrary/shotLineVoice';
import { runWithTask } from '../../../services/taskRunner';
import { runWithConcurrency } from '../../../utils/concurrency';

export interface StoryboardAudioDeps {
  projectId: string;
  episodeId?: string;
  shots: Shot[];
  characters: Character[];
  voiceLibrary: VoiceLibrarySnapshot;
  ttsSelection?: string;
  ttsVoiceId?: string;
  ttsSpeed?: number;
  setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
  setBatchProgress: (p: { current: number; total: number; step?: string } | undefined) => void;
  message: {
    success: (c: string) => void;
    warning: (c: string) => void;
    error: (c: string) => void;
    info: (c: string) => void;
  };
}

/** 单镜配音合成：返回成品 asset 与音色绑定信息（不在 hook 内，纯函数便于复用与测试） */
async function synthesizeShotAudio(params: {
  projectId: string;
  episodeId?: string;
  shot: Shot;
  characters: Character[];
  voiceLibrary: VoiceLibrarySnapshot;
  ttsSelection?: string;
  ttsVoiceId?: string;
  ttsSpeed?: number;
  taskName: string;
}): Promise<{ asset: StoredMediaAsset; audioBindings?: ShotAudioBinding[] }> {
  const {
    projectId, episodeId, shot, characters, voiceLibrary, ttsSelection, ttsVoiceId, taskName,
  } = params;
  const rate = typeof params.ttsSpeed === 'number' ? params.ttsSpeed : 1.2;
  const voiceSegments = buildShotVoiceSegments(shot);
  const legacyText = (shot.dialogue || '').trim() || getShotScriptText(shot).trim();

  if (voiceSegments.length > 0) {
    const resolutions = voiceSegments.map(seg => resolveShotLineVoice({
      role: seg.role,
      characterId: seg.characterId,
      characters,
      projectNarrationVoiceId: ttsVoiceId,
      voiceLibrary,
    }));
    const audioBindings = resolutions.flatMap((r, i) => (r.binding ? [{ index: i, ...r.binding }] : []));
    const asset = await mediaGenerationService.generateShotAudioWithSegments({
      projectId,
      ownerRef: { projectId, ownerType: 'shot', ownerId: shot.id, episodeId, slot: 'audio' },
      segments: voiceSegments.map((seg, i) => ({ text: seg.text, voiceId: resolutions[i].voiceId })),
      options: { rate },
      ttsSelection,
      taskName,
    });
    return { asset, audioBindings };
  }

  const prepared = prepareShotAudio({
    dialogue: legacyText,
    voiceLibrary,
    characters,
    projectFallbackVoiceId: ttsVoiceId,
    defaultVoiceId: ttsVoiceId,
  });
  const asset = await mediaGenerationService.generateAudio({
    projectId,
    ownerRef: { projectId, ownerType: 'shot', ownerId: shot.id, episodeId, slot: 'audio' },
    request: { text: prepared.text, voiceId: prepared.voiceId, options: { rate } },
    ttsSelection,
    taskName,
  });
  return { asset };
}

export function useStoryboardAudio(deps: StoryboardAudioDeps) {
  const {
    projectId, episodeId, shots, characters, voiceLibrary,
    ttsSelection, ttsVoiceId, ttsSpeed,
    setShots, setBatchProgress, message,
  } = deps;

  const handleGenerateShotAudio = useCallback(async (shotId: string) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    const hasVoiceContent = buildShotVoiceSegments(shot).length > 0
      || Boolean((shot.dialogue || '').trim() || getShotScriptText(shot).trim());
    if (!hasVoiceContent) {
      message.warning('该分镜没有可配音的台词或字幕文本');
      return;
    }

    let audioBindings: ShotAudioBinding[] | undefined;
    try {
      const { result: asset } = await runWithTask({
        projectId,
        category: 'asset',
        subType: 'audio',
        targetType: 'shot',
        targetId: shotId,
        targetName: `分镜 #${shotId.slice(-6)} 配音`,
        type: 'audio-generation',
        execute: async (taskCtx) => {
          taskCtx.progress(15, '合成配音...');
          const result = await synthesizeShotAudio({
            projectId, episodeId, shot, characters, voiceLibrary,
            ttsSelection, ttsVoiceId, ttsSpeed,
            taskName: `分镜 #${shotId.slice(-6)} 配音`,
          });
          audioBindings = result.audioBindings;
          taskCtx.progress(100, '完成');
          return result.asset;
        },
      });
      message.success('分镜配音生成完成');
      setShots(prev => prev.map(s => {
        if (s.id !== shotId) return s;
        const existing = s.media?.audios || [];
        return {
          ...s,
          ...(audioBindings ? { audioBindings } : {}),
          media: {
            ...(s.media || {}),
            audios: [...existing, asset],
            currentAudioIndex: existing.length,
          },
        };
      }));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '配音失败');
    }
  }, [projectId, episodeId, shots, characters, voiceLibrary, ttsSelection, ttsVoiceId, ttsSpeed, message, setShots]);

  /**
   * 批量配音：跳过已有配音的分镜（force=false）/ 强制重生成（force=true）。
   * concurrency=2 控制 TTS 并发，避免上游 429。
   */
  const handleBatchAudios = useCallback(async (force: boolean = false, targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const candidates = baseShots.filter((s) => {
      const text = (s.dialogue || '').trim() || getShotScriptText(s).trim();
      if (!text) return false;
      const hasAudio = (s.media?.audios?.length || 0) > 0;
      return force ? hasAudio || !hasAudio : !hasAudio;
    });
    if (candidates.length === 0) {
      message.info(force ? '所选分镜都没有可配音的台词' : '所选分镜要么没台词，要么都已有配音');
      return;
    }

    setBatchProgress({ current: 0, total: candidates.length, step: '准备配音...' });

    try {
      const { result: results } = await runWithTask({
        projectId,
        category: 'asset',
        subType: 'audio',
        targetType: 'episode',
        targetId: episodeId,
        targetName: `批量配音（${candidates.length} 个分镜）`,
        type: 'audio-generation',
        metadata: { shotCount: candidates.length, force },
        execute: async (taskCtx) => {
          let done = 0;
          const inner = candidates.map((shot) => async () => {
            try {
              const { asset, audioBindings } = await synthesizeShotAudio({
                projectId, episodeId, shot, characters, voiceLibrary,
                ttsSelection, ttsVoiceId, ttsSpeed,
                taskName: `分镜 #${shot.id.slice(-6)} 配音`,
              });
              return { shotId: shot.id, asset, audioBindings, success: true as const };
            } catch (err: unknown) {
              return {
                shotId: shot.id,
                success: false as const,
                error: err instanceof Error ? err.message : String(err),
              };
            } finally {
              done += 1;
              const percent = Math.round((done / candidates.length) * 100);
              setBatchProgress({ current: done, total: candidates.length, step: `分镜 ${shot.id.slice(-6)}` });
              taskCtx.progress(percent, `${done}/${candidates.length} 完成`);
            }
          });
          const settled = await runWithConcurrency(inner, 2);
          return settled.map((r) =>
            r.status === 'fulfilled'
              ? r.value
              : { shotId: '', success: false as const, error: String(r.reason) },
          );
        },
      });
      // 回写 UI shots state（避免依赖 TaskManager 监听）
      setShots(prev => prev.map(s => {
        const hit = results.find(r => r.success && r.shotId === s.id);
        if (!hit?.success || !('asset' in hit)) return s;
        const existing = s.media?.audios || [];
        return {
          ...s,
          ...(hit.audioBindings ? { audioBindings: hit.audioBindings } : {}),
          media: {
            ...(s.media || {}),
            audios: [...existing, hit.asset],
            currentAudioIndex: existing.length,
          },
        };
      }));
      const successCount = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success);
      if (failed.length === 0) {
        message.success(`批量配音完成：成功 ${successCount}/${results.length}`);
      } else {
        message.warning(`批量配音完成：成功 ${successCount}/${results.length}，失败 ${failed.length}`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '批量配音失败');
    } finally {
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, shots, characters, voiceLibrary, ttsSelection, ttsVoiceId, ttsSpeed, message, setShots, setBatchProgress]);

  const handleBatchGenerateAudios = useCallback(
    (targetShotIds?: string[]) => handleBatchAudios(false, targetShotIds),
    [handleBatchAudios],
  );
  const handleBatchReGenerateAudios = useCallback(
    (targetShotIds?: string[]) => handleBatchAudios(true, targetShotIds),
    [handleBatchAudios],
  );

  return {
    handleGenerateShotAudio,
    handleBatchAudios,
    handleBatchGenerateAudios,
    handleBatchReGenerateAudios,
  };
}
