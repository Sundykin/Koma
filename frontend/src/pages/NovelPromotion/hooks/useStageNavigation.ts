/**
 * Stage Navigation Hook
 * 管理 Stage 导航状态
 */

import { useState, useCallback, useMemo } from 'react';
import type { Stage, StageStatus, StageNavItem, UnifiedStageStatus } from '../types';

interface UseStageNavigationOptions {
  initialStage?: Stage;
  episodeData?: {
    novelText?: string;
    clips?: unknown[];
    storyboards?: unknown[];
    videos?: unknown[];
  };
  runtimeSignals?: {
    runningStages?: Stage[];
    errorStages?: Stage[];
  };
}

function semanticToLegacyStatus(status: UnifiedStageStatus): StageStatus {
  switch (status) {
    case 'running':
      return 'processing';
    case 'ready':
    case 'done':
      return 'ready';
    case 'blocked':
    case 'error':
    default:
      return 'empty';
  }
}

export function useStageNavigation(options: UseStageNavigationOptions = {}) {
  const { initialStage = 'config', episodeData, runtimeSignals } = options;
  const [currentStage, setCurrentStage] = useState<Stage>(initialStage);

  const runningSet = useMemo(
    () => new Set<Stage>(runtimeSignals?.runningStages || []),
    [runtimeSignals?.runningStages]
  );
  const errorSet = useMemo(
    () => new Set<Stage>(runtimeSignals?.errorStages || []),
    [runtimeSignals?.errorStages]
  );

  const getBaseSemanticStatus = useCallback((stage: Stage): UnifiedStageStatus => {
    if (!episodeData) return 'blocked';

    const hasNovel = !!episodeData.novelText;
    const hasClips = !!(episodeData.clips && episodeData.clips.length > 0);
    const hasStoryboards = !!(episodeData.storyboards && episodeData.storyboards.length > 0);
    const hasVideos = !!(episodeData.videos && episodeData.videos.length > 0);

    switch (stage) {
      case 'config':
        return hasNovel ? 'done' : 'ready';
      case 'script':
        if (!hasNovel) return 'blocked';
        return hasClips ? 'done' : 'ready';
      case 'storyboard':
        if (!hasClips) return 'blocked';
        return hasStoryboards ? 'done' : 'ready';
      case 'video':
        if (!hasStoryboards) return 'blocked';
        return hasVideos ? 'done' : 'ready';
      case 'editor':
        return 'blocked';
      default:
        return 'blocked';
    }
  }, [episodeData]);

  const getSemanticStatus = useCallback((stage: Stage): UnifiedStageStatus => {
    if (errorSet.has(stage)) return 'error';
    if (runningSet.has(stage)) return 'running';
    return getBaseSemanticStatus(stage);
  }, [errorSet, runningSet, getBaseSemanticStatus]);

  const buildItem = useCallback((id: Stage, icon: string, label: string, extras?: Pick<StageNavItem, 'disabled' | 'disabledLabel'>): StageNavItem => {
    const semanticStatus = getSemanticStatus(id);
    return {
      id,
      icon,
      label,
      status: semanticToLegacyStatus(semanticStatus),
      semanticStatus,
      ...extras,
    };
  }, [getSemanticStatus]);

  const stageNavItems = useMemo<StageNavItem[]>(() => [
    buildItem('config', 'S', '故事'),
    buildItem('script', 'A', '剧本'),
    buildItem('storyboard', 'B', '分镜'),
    buildItem('video', 'V', '视频'),
    buildItem('editor', 'E', '编辑器', { disabled: true, disabledLabel: '即将推出' }),
  ], [buildItem]);

  const handleStageChange = useCallback((stage: Stage) => {
    setCurrentStage(stage);
  }, []);

  return {
    currentStage,
    stageNavItems,
    handleStageChange,
  };
}
