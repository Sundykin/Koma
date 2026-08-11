/**
 * 分镜提示词生成 / 优化逻辑（从 Storyboard.tsx 拆出）。
 *
 * 单镜与批量共享同一套流程，按 (kind: image|video) × (force 是否重生成) 参数化：
 *   - 单镜：flush 队列保存 → 取最新 shot 快照 → generateShotPrompt → 回写
 *   - 批量：活跃任务去重守门 → batchGenerateShotPrompts → 逐条回写 + 聚合进度
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { computeShotScriptHash } from '../../../services/shotFreshness';
import type { Shot, ProjectStyleSnapshot } from '../../../types';
import {
  generateShotPrompt,
  batchGenerateShotPrompts,
  type ShotPromptStreamHandler,
} from '../../../services/ShotPromptService';
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

/** 单个分镜某一类提示词的流式状态（浮层要的全部信息） */
export interface PromptStreamSlot {
  /** 已到达的文本：思考阶段是思维链，正文阶段是提示词本体 */
  text?: string;
  phase: 'reasoning' | 'output';
  /** 生成开始时刻，用于浮层显示"已等待 N 秒" */
  startedAt: number;
}

export type PromptStreamMap = Map<string, { image?: PromptStreamSlot; video?: PromptStreamSlot }>;

const KIND_LABEL: Record<PromptKind, string> = { image: '图片', video: '视频' };
const KIND_FLAG: Record<PromptKind, { image: boolean; video: boolean }> = {
  image: { image: true, video: false },
  video: { image: false, video: true },
};
const KIND_TASK_TYPE: Record<PromptKind, string> = {
  image: 'prompt-generation:image',
  video: 'prompt-generation:video',
};

/**
 * 流式分片合批间隔。
 * LLM 分片是逐 token 到的，直接 setState 会在长输出 + 批量并跑时打出上千次渲染；
 * 攒到这个间隔再刷一次，肉眼看仍是连续出字。
 */
const STREAM_FLUSH_INTERVAL_MS = 120;

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

  // ---- 推理流式预览：分片先攒进 ref，再按 STREAM_FLUSH_INTERVAL_MS 合批刷进 state ----
  const [promptStreamMap, setPromptStreamMap] = useState<PromptStreamMap>(new Map());
  const streamBufferRef = useRef<PromptStreamMap>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const publishStream = useCallback(() => {
    setPromptStreamMap(new Map(streamBufferRef.current));
  }, []);

  const writeStreamSlot = useCallback((
    shotId: string,
    kind: PromptKind,
    patch: Partial<PromptStreamSlot>,
  ) => {
    const entry = streamBufferRef.current.get(shotId) || {};
    streamBufferRef.current.set(shotId, {
      ...entry,
      [kind]: { ...(entry[kind] || { startedAt: Date.now(), phase: 'reasoning' as const }), ...patch },
    });
  }, []);

  const scheduleStreamFlush = useCallback(() => {
    if (flushTimerRef.current !== undefined) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = undefined;
      publishStream();
    }, STREAM_FLUSH_INTERVAL_MS);
  }, [publishStream]);

  /**
   * 生成一开始就把槽位建出来（还没有任何分片）。
   * 推理模型吐正文前会先思考几十秒，这段"什么都没有"的时间正是等待焦虑的来源——
   * 浮层必须在 t=0 就出现并开始计时，而不是等第一个字。
   */
  const beginPromptStream = useCallback((shotIds: string[], kind: PromptKind) => {
    for (const shotId of shotIds) {
      writeStreamSlot(shotId, kind, { startedAt: Date.now(), phase: 'reasoning', text: '' });
    }
    publishStream();
  }, [writeStreamSlot, publishStream]);

  const handlePromptStream = useCallback<ShotPromptStreamHandler>(({ shotId, kind, accumulated, phase }) => {
    writeStreamSlot(shotId, kind, { text: accumulated, phase });
    scheduleStreamFlush();
  }, [writeStreamSlot, scheduleStreamFlush]);

  /** 推理结束（成功或失败）后清掉浮层，编辑器随即显示最终稿 */
  const clearPromptStream = useCallback((shotIds: string[]) => {
    for (const shotId of shotIds) streamBufferRef.current.delete(shotId);
    if (flushTimerRef.current !== undefined) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    publishStream();
  }, [publishStream]);

  useEffect(() => () => {
    if (flushTimerRef.current !== undefined) clearTimeout(flushTimerRef.current);
  }, []);

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
    beginPromptStream([shotId], kind);
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
        { force, shotsSnapshot, onStream: handlePromptStream },
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
      clearPromptStream([shotId]);
    }
  }, [projectId, episodeId, llmSelection, projectStylePrompt, styleSnapshot, flushQueuedShotSaves, shotsRef, setShots, getSubmittingSetter, message, handlePromptStream, beginPromptStream, clearPromptStream]);

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
    beginPromptStream(targetShots.map(s => s.id), kind);
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
          // 这一条已出结果，浮层交还给编辑器
          clearPromptStream([result.shotId]);
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
        { force, shotsSnapshot: currentShots, onStream: handlePromptStream },
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
      clearPromptStream(targetShots.map(s => s.id));
    }
  }, [projectId, episodeId, llmSelection, projectStylePrompt, styleSnapshot, ensureNoActiveBatch, message, flushQueuedShotSaves, shotsRef, setShots, getSubmittingSetter, setBatchProgress, handlePromptStream, beginPromptStream, clearPromptStream]);

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
    promptStreamMap,
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
