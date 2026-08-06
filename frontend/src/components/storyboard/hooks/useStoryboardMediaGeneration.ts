/**
 * 分镜媒体生成逻辑（从 Storyboard.tsx 拆出）：单镜图片/视频 + 批量图片/视频。
 *
 * 批量按 force 参数化：false=只补没有媒体的分镜；true=强制重生成已有的。
 * 图片批量与视频批量共享 type='shot-generation' 的活跃任务去重（ensureNoActiveBatch），
 * 避免 LLM/上游 provider 互相挤压。
 */
import { useCallback } from 'react';
import { App as AntApp } from 'antd';
import type {
  Shot, Character, Scene, Prop, AppSettings, ProjectStyleSnapshot,
} from '../../../types';
import { generateShotImage, batchGenerateShotImages } from '../../../services/ShotGenerationService';
import { findShotAssetsMissingImages, formatMissingAssetWarning } from '../../../services/shotReference/readiness';
import { shotRenderWorkflow, batchRenderShots } from '../../../workflow/shotRenderWorkflow';
import { runWithTask } from '../../../services/taskRunner';

export interface ShotVideoSupportEntry {
  disabledReason?: string;
}

export interface StoryboardMediaGenerationDeps {
  projectId: string;
  episodeId?: string;
  characters: Character[];
  scenes: Scene[];
  props?: Prop[];
  ttiSelection?: string;
  itvSelection?: string;
  ttsSelection?: string;
  aspectRatio?: '16:9' | '9:16';
  styleSnapshot?: ProjectStyleSnapshot;
  effectiveSettings: AppSettings;
  shotsRef: React.MutableRefObject<Shot[]>;
  setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
  setSubmittingShots: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSubmittingRenderShots: React.Dispatch<React.SetStateAction<Set<string>>>;
  setShotVideoProgress: React.Dispatch<React.SetStateAction<Map<string, { progress: number; step: string }>>>;
  setBatchProgress: (p: { current: number; total: number; step?: string } | undefined) => void;
  flushQueuedShotSaves: () => Promise<void>;
  queueRefreshShotsFromStore: () => Promise<void>;
  refreshShotsFromStore: () => Promise<void>;
  shotVideoSupportMap: Map<string, ShotVideoSupportEntry | undefined>;
  buildUnsupportedShotVideoMessage: (targetShots: Shot[]) => string | undefined;
  ensureNoActiveBatch: (type: string, label: string) => Promise<boolean>;
  getShotImageCount: (shot: Shot) => number;
  getShotVideoCount: (shot: Shot) => number;
  message: {
    success: (c: string) => void;
    warning: (c: string) => void;
    error: (c: string) => void;
    info: (c: string) => void;
  };
}

export function useStoryboardMediaGeneration(deps: StoryboardMediaGenerationDeps) {
  const { modal } = AntApp.useApp();
  const {
    projectId, episodeId, characters, scenes, props,
    ttiSelection, itvSelection, ttsSelection, aspectRatio, styleSnapshot, effectiveSettings,
    shotsRef, setShots,
    setSubmittingShots, setSubmittingRenderShots, setShotVideoProgress, setBatchProgress,
    flushQueuedShotSaves, queueRefreshShotsFromStore, refreshShotsFromStore,
    shotVideoSupportMap, buildUnsupportedShotVideoMessage, ensureNoActiveBatch,
    getShotImageCount, getShotVideoCount,
    message,
  } = deps;

  /** 单镜图片生成 */
  const handleGenerateShotImage = useCallback(async (shotId: string) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const shot = shotsRef.current.find(s => s.id === shotId);
    if (!shot) {
      message.error('分镜不存在');
      return;
    }
    if (!shot.imagePrompt?.trim()) {
      message.warning('请先填写图片提示词');
      return;
    }
    setSubmittingShots(prev => new Set(prev).add(shotId));
    try {
      await flushQueuedShotSaves();
      const asset = await generateShotImage(projectId, episodeId, shotId, characters, scenes, ttiSelection, {
        aspectRatio,
        styleSnapshot,
        shotSnapshot: shot,
        shotsSnapshot: shotsRef.current,
      });
      message.success('分镜图片生成完成');
      const updatedShots = shotsRef.current.map(s => {
        if (s.id !== shotId) return s;
        const existing = s.media?.images || [];
        return {
          ...s,
          media: {
            ...(s.media || {}),
            images: [...existing, asset],
            currentImageIndex: existing.length,
          },
        };
      });
      shotsRef.current = updatedShots;
      setShots(updatedShots);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '启动生成失败');
    } finally {
      setSubmittingShots(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, characters, scenes, ttiSelection, aspectRatio, styleSnapshot, message, flushQueuedShotSaves, shotsRef, setShots, setSubmittingShots]);

  /** 单镜视频渲染 */
  const handleRenderShotVideo = useCallback(async (shotId: string) => {
    const shot = shotsRef.current.find(s => s.id === shotId);
    if (!shot) return;
    if (!shot.videoPrompt?.trim()) {
      message.warning('请先填写视频提示词');
      return;
    }
    const support = shotVideoSupportMap.get(shotId);
    if (support?.disabledReason) {
      message.error(support.disabledReason);
      return;
    }
    setSubmittingRenderShots(prev => new Set(prev).add(shotId));
    setShotVideoProgress(prev => {
      const next = new Map(prev);
      next.set(shotId, { progress: 0, step: '准备渲染...' });
      return next;
    });
    try {
      await flushQueuedShotSaves();
      const { result } = await runWithTask({
        projectId,
        category: 'analysis',
        subType: 'shot-generation',
        targetType: 'shot',
        targetId: shotId,
        targetName: `分镜 #${shotId.slice(-6)} 视频生成`,
        type: 'shot-generation',
        execute: async (taskCtx) => shotRenderWorkflow(
          {
            projectId,
            episodeId,
            shot,
            settings: effectiveSettings,
            aspectRatio,
            mediaSelections: { ttiSelection, itvSelection, ttsSelection },
            styleSnapshot,
            allShots: shotsRef.current,
          },
          (progress, step) => {
            setShotVideoProgress(prev => {
              const next = new Map(prev);
              next.set(shotId, { progress, step: step || '' });
              return next;
            });
            taskCtx.progress(progress, step);
          },
        ),
      });
      if (result.success && result.version) {
        await refreshShotsFromStore();
        message.success('分镜渲染完成');
      } else {
        message.error(result.error || '渲染失败');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '渲染失败');
    } finally {
      setSubmittingRenderShots(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
      setShotVideoProgress(prev => {
        const next = new Map(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shotVideoSupportMap, effectiveSettings, ttiSelection, itvSelection, ttsSelection, aspectRatio, styleSnapshot, message, refreshShotsFromStore, flushQueuedShotSaves, shotsRef, setSubmittingRenderShots, setShotVideoProgress]);

  /** 批量图片生成（force=true 重新生成已有图片的） */
  const runBatchImages = useCallback(async (force: boolean, targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    // batchGenerateShotImages 与 batchRenderShots 共享 type='shot-generation'，所以
    // 图片批量与视频批量任意一个在跑都要拦下，避免提交链路里 LLM/上游 provider 互相挤压。
    if (!(await ensureNoActiveBatch('shot-generation', '批量图片/视频生成'))) return;
    await flushQueuedShotSaves();
    const currentShots = shotsRef.current;
    const baseShots = targetShotIds
      ? currentShots.filter(s => targetShotIds.includes(s.id))
      : currentShots;
    const targetShots = baseShots.filter(s =>
      (force ? getShotImageCount(s) > 0 : getShotImageCount(s) === 0) && s.imagePrompt?.trim());
    if (targetShots.length === 0) {
      message.info(force
        ? '所选分镜都没有图片，或没有可用图片提示词'
        : '所选分镜都已有图片，或没有可用图片提示词');
      return;
    }
    // 资产就绪检查：被引用但还没有定妆照/场景图/道具图的资产列出来，
    // 让用户选择"仍然生成"还是先去补图（缺参考图是角色不一致的最大来源）
    const missingAssets = findShotAssetsMissingImages(targetShots, characters, scenes, props ?? []);
    if (missingAssets.length > 0) {
      const proceed = await modal.confirm({
        title: '部分被引用的资产还没有图片',
        content: `${formatMissingAssetWarning(missingAssets)}。`
          + '没有资产图时生成将缺少参考图，角色/场景外观容易前后不一致。'
          + '建议先在资产面板生成定妆照与场景图。',
        okText: '仍然生成',
        cancelText: '去补图',
      });
      if (!proceed) return;
    }
    const shotIds = targetShots.map(s => s.id);
    setSubmittingShots(new Set(shotIds));
    const action = force ? '重新生成' : '生成';
    try {
      const indexMap = new Map(shotIds.map((id, idx) => [id, idx]));
      setBatchProgress({ current: 0, total: shotIds.length, step: `准备${action}...` });
      const results = await batchGenerateShotImages(projectId, episodeId, shotIds, characters, scenes, ttiSelection, {
        aspectRatio,
        styleSnapshot,
        shotsSnapshot: currentShots,
        onItemComplete: async (item) => {
          setSubmittingShots(prev => {
            const next = new Set(prev);
            next.delete(item.shotId);
            return next;
          });
          if (item.success) {
            void queueRefreshShotsFromStore();
          }
        },
        onProgress: (_overall, current) => {
          const idx = (indexMap.get(current.shotId) ?? 0) + 1;
          setBatchProgress({
            current: idx,
            total: shotIds.length,
            step: current.step ? `分镜 ${current.shotId}: ${current.step}` : `分镜 ${current.shotId}`,
          });
        },
      });

      const successCount = results.filter(r => r.success).length;
      if (successCount > 0) {
        await queueRefreshShotsFromStore();
      }
      const failed = results.filter(r => !r.success);
      if (failed.length === 0) {
        message.success(`批量${action}完成：成功 ${successCount}/${results.length}`);
      } else {
        message.warning(`批量${action}完成：成功 ${successCount}/${results.length}，失败 ${failed.length}`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || `批量${action}失败`);
    } finally {
      setSubmittingShots(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, characters, scenes, props, ttiSelection, aspectRatio, styleSnapshot, queueRefreshShotsFromStore, ensureNoActiveBatch, message, modal, flushQueuedShotSaves, shotsRef, setSubmittingShots, setBatchProgress, getShotImageCount]);

  /** 批量视频渲染（force=true 重新渲染已有视频的） */
  const runBatchVideos = useCallback(async (force: boolean, targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    if (!(await ensureNoActiveBatch('shot-generation', '批量图片/视频生成'))) return;
    await flushQueuedShotSaves();
    const currentShots = shotsRef.current;
    const baseShots = targetShotIds
      ? currentShots.filter(s => targetShotIds.includes(s.id))
      : currentShots;
    const targetShots = baseShots.filter(s =>
      (force ? getShotVideoCount(s) > 0 : getShotVideoCount(s) === 0) && s.videoPrompt?.trim());
    if (targetShots.length === 0) {
      message.info(force
        ? '所选分镜都没有视频，或没有可用视频提示词'
        : '所选分镜都已有视频，或没有可用视频提示词');
      return;
    }
    const unsupportedMessage = buildUnsupportedShotVideoMessage(targetShots);
    if (unsupportedMessage) {
      message.error(unsupportedMessage);
      return;
    }
    const shotIds = targetShots.map(s => s.id);
    setSubmittingRenderShots(new Set(shotIds));
    const action = force ? '重新渲染' : '渲染';
    setBatchProgress({ current: 0, total: shotIds.length, step: `准备批量${action}...` });
    try {
      const indexMap = new Map(shotIds.map((id, idx) => [id, idx]));
      const { result } = await runWithTask({
        projectId,
        category: 'analysis',
        subType: 'shot-generation',
        targetType: 'episode',
        targetId: episodeId,
        targetName: `批量${action}视频（${targetShots.length} 个分镜）`,
        type: 'shot-generation',
        metadata: { shotCount: targetShots.length, shotIds, batchKind: 'video', ...(force ? { regenerate: true } : {}) },
        execute: async (taskCtx) => batchRenderShots(
          {
            projectId,
            episodeId,
            shots: targetShots,
            settings: effectiveSettings,
            aspectRatio,
            mediaSelections: { ttiSelection, itvSelection, ttsSelection },
            styleSnapshot,
            allShots: currentShots,
            onShotComplete: async (item) => {
              setSubmittingRenderShots(prev => {
                const next = new Set(prev);
                next.delete(item.shotId);
                return next;
              });
              if (item.success) {
                void queueRefreshShotsFromStore();
              }
            },
          },
          (overall, current) => {
            const idx = (indexMap.get(current.shotId) ?? 0) + 1;
            setBatchProgress({
              current: idx,
              total: shotIds.length,
              step: `分镜 ${current.shotId.slice(-6)}: ${current.step || ''}`,
            });
            taskCtx.progress(overall, `${current.shotId.slice(-6)}: ${current.step || ''}`);
          },
        ),
      });
      await queueRefreshShotsFromStore();
      message.success(`批量${action}完成: ${result.success} 成功, ${result.failed} 失败`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || `批量${action}失败`);
    } finally {
      setSubmittingRenderShots(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, effectiveSettings, ttiSelection, itvSelection, ttsSelection, aspectRatio, styleSnapshot, buildUnsupportedShotVideoMessage, message, queueRefreshShotsFromStore, ensureNoActiveBatch, flushQueuedShotSaves, shotsRef, setSubmittingRenderShots, setBatchProgress, getShotVideoCount]);

  const handleBatchGenerate = useCallback(
    (targetShotIds?: string[]) => runBatchImages(false, targetShotIds),
    [runBatchImages],
  );
  const handleBatchReGenerateImages = useCallback(
    (targetShotIds?: string[]) => runBatchImages(true, targetShotIds),
    [runBatchImages],
  );
  const handleBatchRenderVideos = useCallback(
    (targetShotIds?: string[]) => runBatchVideos(false, targetShotIds),
    [runBatchVideos],
  );
  const handleBatchReGenerateVideos = useCallback(
    (targetShotIds?: string[]) => runBatchVideos(true, targetShotIds),
    [runBatchVideos],
  );

  return {
    handleGenerateShotImage,
    handleRenderShotVideo,
    handleBatchGenerate,
    handleBatchReGenerateImages,
    handleBatchRenderVideos,
    handleBatchReGenerateVideos,
  };
}
