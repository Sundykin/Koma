/**
 * 分镜页的任务订阅逻辑（从 Storyboard.tsx 拆出）。
 *
 * 两块 edge-triggered 订阅：
 *  1. shot-analysis 终态：完成 → 提示并 loadData 重拉；失败 → 报错
 *  2. shot/episode 级提示词与媒体任务终态 → refreshShotsFromStore，
 *     解决"await 期间切走页面、setShots 落空导致回来看不到新数据"的问题
 *     （DB 才是真相，组件重挂载时靠 transition 再校验一次）。
 */
import { useEffect, useMemo } from 'react';
import { useActiveTask, useTaskTransitions } from '../../../hooks';
import { createLogger } from '../../../store/logger';

const logger = createLogger('StoryboardTasks');

export interface StoryboardTaskSubscriptionsDeps {
  projectId: string;
  episodeId?: string;
  isSubmittingAnalysis: boolean;
  setIsSubmittingAnalysis: (v: boolean) => void;
  loadData: () => Promise<void>;
  refreshShotsFromStore: () => Promise<void>;
  message: {
    success: (c: string) => void;
    error: (c: string) => void;
  };
}

export function useStoryboardTaskSubscriptions(deps: StoryboardTaskSubscriptionsDeps) {
  const {
    projectId, episodeId, isSubmittingAnalysis, setIsSubmittingAnalysis,
    loadData, refreshShotsFromStore, message,
  } = deps;

  const activeAnalysisTask = useActiveTask({
    scope: `project:${projectId}`,
    type: 'shot-analysis',
    targetKind: 'episode',
    targetId: episodeId,
  });
  const isAnalyzing = isSubmittingAnalysis || !!activeAnalysisTask;

  // 任务被 useActiveTask 接管后清掉提交中标志（避免成功路径不归零）
  useEffect(() => {
    if (activeAnalysisTask) setIsSubmittingAnalysis(false);
  }, [activeAnalysisTask?.id]);

  // 监听分析任务终态转换（edge-triggered 副作用）
  useTaskTransitions(
    {
      scope: `project:${projectId}`,
      type: 'shot-analysis',
      targetKind: 'episode',
      targetId: episodeId,
      to: ['completed', 'failed'],
    },
    (event) => {
      const payload = (event.record.payload || {}) as { result?: { shotsCount?: number } };
      if (event.currStatus === 'completed') {
        message.success(`AI 分镜生成完成，共 ${payload.result?.shotsCount || 0} 个分镜`);
        loadData();
      } else if (event.currStatus === 'failed') {
        logger.error('AI 分镜生成失败', event.record.error);
        message.error('AI 分镜生成失败，请检查 LLM 配置后重试');
      }
    },
  );

  const PROMPT_OR_MEDIA_SHOT_TYPES = useMemo(() => new Set([
    'prompt-generation:image', 'prompt-generation:video',
    'prompt-optimization:image', 'prompt-optimization:video',
    'tti', 'itv',
  ]), []);
  // 批量任务用 episode-level task（type='shot-generation' / 'prompt-generation:*'），
  // 终态时也要刷新一次本地 shots。
  const BATCH_SHOT_PARENT_TYPES = useMemo(() => new Set([
    'shot-generation',
    'prompt-generation:image', 'prompt-generation:video',
    'prompt-optimization:image', 'prompt-optimization:video',
  ]), []);

  useTaskTransitions(
    {
      scope: `project:${projectId}`,
      to: ['completed', 'failed'],
    },
    (event) => {
      const t = event.record;
      if (PROMPT_OR_MEDIA_SHOT_TYPES.has(t.type) && t.targetKind === 'shot' && t.targetId) {
        void refreshShotsFromStore();
        return;
      }
      // episode-level 批量任务终态：本剧集 batch 完成或失败都要刷新 — 期间组件
      // 可能 unmount 过，setShots 进度回调落空，DB 才是真相。
      if (
        BATCH_SHOT_PARENT_TYPES.has(t.type)
        && t.targetKind === 'episode'
        && t.targetId === episodeId
      ) {
        void refreshShotsFromStore();
      }
    },
  );

  return { activeAnalysisTask, isAnalyzing };
}
