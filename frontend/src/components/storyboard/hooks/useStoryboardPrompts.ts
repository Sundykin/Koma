/**
 * 分镜提示词生成 / 优化逻辑（从 Storyboard.tsx 拆出）。
 *
 * 单镜与批量共享同一套流程，按 (kind: image|video) × (force 是否重生成) 参数化：
 *   - 单镜：flush 队列保存 → 取最新 shot 快照 → generateShotPrompt → 回写
 *   - 批量：活跃任务去重守门 → batchGenerateShotPrompts → 逐条回写 + 聚合进度
 */
import { useCallback, useState } from 'react';
import { upgradeShotScript } from '../../../services/shotScriptUpgrade';
import { extractShotPhotography } from '../../../services/photographyElements';
import { runWithConcurrency } from '../../../utils/concurrency';
import { computeShotScriptHash } from '../../../services/shotFreshness';
import type { Shot, ProjectStyleSnapshot, ShotScriptLine } from '../../../types';
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
          // 记录生成时的脚本指纹：之后脚本被改动 → ShotCard 提示"提示词已滞后"
          promptScriptHash: computeShotScriptHash(s.scriptLines),
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
              promptScriptHash: computeShotScriptHash(s.scriptLines),
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

  // 分镜脚本升级（补摄影语言）的进行态
  const [upgradingShots, setUpgradingShots] = useState<Set<string>>(new Set());

  /** 升级单个分镜脚本为专业描述（保留剧情/台词，补景别/机位/光线） */
  const handleUpgradeShotScript = useCallback(async (shotId: string) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const shot = shotsRef.current.find(s => s.id === shotId);
    if (!shot) return;
    setUpgradingShots(prev => new Set(prev).add(shotId));
    try {
      await flushQueuedShotSaves();
      const result = await upgradeShotScript(projectId, episodeId, shot, llmSelection);
      if (result.success && result.scriptLines) {
        const updatedShots = shotsRef.current.map(s => s.id === shotId ? {
          ...s,
          scriptLines: result.scriptLines!,
          // 脚本变了 → 提示词/配音新鲜度标记清掉（等待重新生成）
          promptScriptHash: undefined,
          voiceScriptHash: undefined,
        } : s);
        shotsRef.current = updatedShots;
        setShots(updatedShots);
        message.success('分镜脚本已升级（补全景别/机位/光线）');
      } else {
        message.error(result.error || '脚本升级失败');
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUpgradingShots(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, llmSelection, flushQueuedShotSaves, message, setShots, shotsRef]);

  /** 批量补全摄影语言：只处理缺景别+机位的分镜，并发 2，成功时更新脚本 */
  const handleBatchUpgradeShotScripts = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    await flushQueuedShotSaves();
    const currentShots = shotsRef.current;
    const baseShots = targetShotIds
      ? currentShots.filter(s => targetShotIds.includes(s.id))
      : currentShots;
    // 只升级缺景别且缺机位的分镜（画面感不足的）；已有完整摄影语言的不动
    const targetShots = baseShots.filter(s => {
      const el = extractShotPhotography(s);
      return el.shotSizes.length === 0 && el.cameraAngles.length === 0;
    });
    if (targetShots.length === 0) {
      message.info('所选分镜都有摄影语言，无需补全');
      return;
    }
    setUpgradingShots(new Set(targetShots.map(s => s.id)));
    setBatchProgress({ current: 0, total: targetShots.length, step: '准备补全摄影语言...' });
    try {
      const results = (await runWithConcurrency(
        targetShots.map(shot => async () => {
          const result = await upgradeShotScript(projectId, episodeId, shot, llmSelection);
          return { shotId: shot.id, success: result.success, scriptLines: result.scriptLines, error: result.error };
        }),
        2,
      )).map((settled, index) => {
        const shotId = targetShots[index]?.id ?? '';
        if (settled.status === 'rejected') {
          return { shotId, success: false, scriptLines: undefined as ShotScriptLine[] | undefined, error: String(settled.reason) };
        }
        return settled.value;
      });

      const successCount = results.filter(r => r.success).length;
      // 逐项回写（统一在全部完成后一次更新，避免并发 setShots 竞态）
      const upgradeById = new Map<string, ShotScriptLine[]>(
        results
          .filter((r): r is typeof r & { scriptLines: ShotScriptLine[] } => Boolean(r.success && r.scriptLines))
          .map(r => [r.shotId, r.scriptLines]),
      );
      if (upgradeById.size > 0) {
        const updatedShots = shotsRef.current.map(s => upgradeById.has(s.id) ? {
          ...s,
          scriptLines: upgradeById.get(s.id)!,
          promptScriptHash: undefined,
          voiceScriptHash: undefined,
        } : s);
        shotsRef.current = updatedShots;
        setShots(updatedShots);
      }
      if (successCount === 0 && results.length > 0) {
        const firstError = results.find(r => r.error)?.error;
        message.error(`补全摄影语言全部失败${firstError ? `: ${firstError}` : ''}`);
      } else {
        message.success(`补全摄影语言完成: ${successCount}/${results.length} 成功`);
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUpgradingShots(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, llmSelection, flushQueuedShotSaves, message, setShots, shotsRef, setBatchProgress]);

  return {
    ensureNoActiveBatch,
    upgradingShots,
    handleUpgradeShotScript,
    handleBatchUpgradeShotScripts,
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
