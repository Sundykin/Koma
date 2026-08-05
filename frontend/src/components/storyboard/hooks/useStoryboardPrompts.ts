/**
 * 分镜提示词生成 / 优化逻辑（从 Storyboard.tsx 拆出）。
 *
 * 单镜与批量共享同一套流程，按 (kind: image|video) × (force 是否重生成) 参数化：
 *   - 单镜：flush 队列保存 → 取最新 shot 快照 → generateShotPrompt → 回写
 *   - 批量：活跃任务去重守门 → batchGenerateShotPrompts → 逐条回写 + 聚合进度
 */
import { useCallback } from 'react';
import type { Shot, ProjectStyleSnapshot } from '../../../types';
import { generateShotPrompt, batchGenerateShotPrompts } from '../../../services/ShotPromptService';
import { findActiveTask } from '../../../services/tasksIPC';

export interface StoryboardPromptsDeps {
  projectId: string;
  episodeId?: string;
  llmSelection?: string;
  projectStylePrompt: string;
  styleSnapshot?: ProjectStyleSnapshot;
  shotsRef: React.MutableRefObject<Shot[]>;
  setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
  setSubmittingImagePrompts: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSubmittingVideoPrompts: React.Dispatch<React.SetStateAction<Set<string>>>;
  setBatchProgress: (p: { current: number; total: number; step?: string } | undefined) => void;
  flushQueuedShotSaves: () => Promise<void>;
  message: {
    success: (c: string) => void;
    warning: (c: string) => void;
    error: (c: string) => void;
    info: (c: string) => void;
  };
}

type PromptKind = 'image' | 'video';

const KIND_LABEL: Record<PromptKind, string> = { image: '图片', video: '视频' };
const KIND_FLAG: Record<PromptKind, { image: boolean; video: boolean }> = {
  image: { image: true, video: false },
  video: { image: false, video: true },
};
const KIND_TASK_TYPE: Record<PromptKind, string> = {
  image: 'prompt-generation:image',
  video: 'prompt-generation:video',
};

export function useStoryboardPrompts(deps: StoryboardPromptsDeps) {
  const {
    projectId, episodeId, llmSelection, projectStylePrompt, styleSnapshot,
    shotsRef, setShots,
    setSubmittingImagePrompts, setSubmittingVideoPrompts, setBatchProgress,
    flushQueuedShotSaves, message,
  } = deps;

  const getSubmittingSetter = useCallback(
    (kind: PromptKind) => (kind === 'image' ? setSubmittingImagePrompts : setSubmittingVideoPrompts),
    [setSubmittingImagePrompts, setSubmittingVideoPrompts],
  );

  /** 批量入口前置守门：DB 里已有同 (type, episode) 活跃任务时不再创建第二条 */
  const ensureNoActiveBatch = useCallback(async (
    type: string,
    label: string,
  ): Promise<boolean> => {
    if (!projectId || !episodeId) return true;
    const existing = await findActiveTask({
      scope: `project:${projectId}`,
      type,
      targetKind: 'episode',
      targetId: episodeId,
    });
    if (existing) {
      message.info(`已有${label}任务在执行中，请等待完成（可在任务面板查看进度）`);
      return false;
    }
    return true;
  }, [projectId, episodeId, message]);

  /** 单镜提示词生成（force=true 即"优化/重新生成"） */
  const runSinglePrompt = useCallback(async (kind: PromptKind, shotId: string, force: boolean) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const shot = shotsRef.current.find(s => s.id === shotId);
    if (!shot) return;
    const label = KIND_LABEL[kind];
    const setSubmitting = getSubmittingSetter(kind);
    setSubmitting(prev => new Set(prev).add(shotId));
    try {
      await flushQueuedShotSaves();
      const shotsSnapshot = shotsRef.current;
      const latestShot = shotsSnapshot.find(s => s.id === shotId) || shot;
      const result = await generateShotPrompt(
        projectId,
        episodeId,
        latestShot,
        projectStylePrompt,
        llmSelection,
        KIND_FLAG[kind],
        { force, shotsSnapshot },
        styleSnapshot,
      );
      if (result.success) {
        const promptField = kind === 'image' ? 'imagePrompt' : 'videoPrompt';
        const updatedShots = shotsRef.current.map(s => s.id === shotId ? {
          ...s,
          [promptField]: kind === 'image' ? result.imagePrompt : result.videoPrompt,
        } : s);
        shotsRef.current = updatedShots;
        setShots(updatedShots);
        message.success(`${label}提示词${force ? '优化' : '生成'}完成`);
      } else {
        message.error(result.error || (force ? '优化失败' : '生成失败'));
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || (force ? '优化失败' : '生成失败'));
    } finally {
      setSubmitting(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, llmSelection, projectStylePrompt, styleSnapshot, flushQueuedShotSaves, shotsRef, setShots, getSubmittingSetter, message]);

  /** 批量提示词生成（force=true 即"重新生成已有提示词的"） */
  const runBatchPrompts = useCallback(async (kind: PromptKind, force: boolean, targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const label = KIND_LABEL[kind];
    // batchGenerateShotPrompts 的 task type 固定是 prompt-generation:*（不区分 force），
    // 所以 re-generate 与 generate 共享同一去重 key。
    if (!(await ensureNoActiveBatch(KIND_TASK_TYPE[kind], `批量${label}提示词`))) return;
    await flushQueuedShotSaves();
    const currentShots = shotsRef.current;
    const baseShots = targetShotIds
      ? currentShots.filter(s => targetShotIds.includes(s.id))
      : currentShots;
    const promptField = kind === 'image' ? 'imagePrompt' : 'videoPrompt';
    const targetShots = baseShots.filter(s => force ? Boolean(s[promptField]?.trim()) : !s[promptField]?.trim());
    if (targetShots.length === 0) {
      message.info(force ? `所选分镜都没有${label}提示词` : `所选分镜都已有${label}提示词`);
      return;
    }
    const setSubmitting = getSubmittingSetter(kind);
    setSubmitting(new Set(targetShots.map(s => s.id)));
    setBatchProgress({ current: 0, total: targetShots.length, step: force ? '准备重新生成...' : '准备生成...' });
    try {
      const action = force ? '重新生成' : '生成';
      const results = await batchGenerateShotPrompts(
        projectId,
        episodeId,
        targetShots,
        projectStylePrompt,
        (current, total, result) => {
          setBatchProgress({ current, total, step: `${action}中 ${current}/${total}` });
          if (result.success) {
            setShots(prev => prev.map(s => s.id === result.shotId ? {
              ...s,
              [promptField]: kind === 'image' ? result.imagePrompt : result.videoPrompt,
            } : s));
          }
        },
        llmSelection,
        styleSnapshot,
        KIND_FLAG[kind],
        { force, shotsSnapshot: currentShots },
      );
      const successCount = results.filter(r => r.success).length;
      if (successCount === 0 && results.length > 0) {
        const firstError = results.find(r => r.error)?.error;
        message.error(`${label}提示词${action}全部失败${firstError ? `: ${firstError}` : ''}`);
      } else {
        message.success(`${label}提示词${action}完成: ${successCount}/${results.length} 成功`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || `批量${force ? '重新' : ''}生成失败`);
    } finally {
      setSubmitting(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, llmSelection, projectStylePrompt, styleSnapshot, ensureNoActiveBatch, message, flushQueuedShotSaves, shotsRef, setShots, getSubmittingSetter, setBatchProgress]);

  const handleGenerateImagePrompt = useCallback(
    (shotId: string) => runSinglePrompt('image', shotId, false),
    [runSinglePrompt],
  );
  const handleGenerateVideoPrompt = useCallback(
    (shotId: string) => runSinglePrompt('video', shotId, false),
    [runSinglePrompt],
  );
  const handleOptimizeImagePrompt = useCallback(
    (shotId: string, _currentPrompt: string) => runSinglePrompt('image', shotId, true),
    [runSinglePrompt],
  );
  const handleOptimizeVideoPrompt = useCallback(
    (shotId: string, _currentPrompt: string) => runSinglePrompt('video', shotId, true),
    [runSinglePrompt],
  );
  const handleBatchGenerateImagePrompts = useCallback(
    (targetShotIds?: string[]) => runBatchPrompts('image', false, targetShotIds),
    [runBatchPrompts],
  );
  const handleBatchReGenerateImagePrompts = useCallback(
    (targetShotIds?: string[]) => runBatchPrompts('image', true, targetShotIds),
    [runBatchPrompts],
  );
  const handleBatchGenerateVideoPrompts = useCallback(
    (targetShotIds?: string[]) => runBatchPrompts('video', false, targetShotIds),
    [runBatchPrompts],
  );
  const handleBatchReGenerateVideoPrompts = useCallback(
    (targetShotIds?: string[]) => runBatchPrompts('video', true, targetShotIds),
    [runBatchPrompts],
  );

  return {
    ensureNoActiveBatch,
    handleGenerateImagePrompt,
    handleGenerateVideoPrompt,
    handleOptimizeImagePrompt,
    handleOptimizeVideoPrompt,
    handleBatchGenerateImagePrompts,
    handleBatchReGenerateImagePrompts,
    handleBatchGenerateVideoPrompts,
    handleBatchReGenerateVideoPrompts,
  };
}
