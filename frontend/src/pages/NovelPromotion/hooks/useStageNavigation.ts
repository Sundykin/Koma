/**
 * Stage Navigation Hook
 * 管理 Stage 导航状态
 */

import { useState, useCallback, useMemo } from 'react';
import type { Stage, StageStatus, StageNavItem } from '../types';

interface UseStageNavigationOptions {
  initialStage?: Stage;
  episodeData?: {
    novelText?: string;
    clips?: unknown[];
    storyboards?: unknown[];
    videos?: unknown[];
  };
}

export function useStageNavigation(options: UseStageNavigationOptions = {}) {
  const { initialStage = 'config', episodeData } = options;
  const [currentStage, setCurrentStage] = useState<Stage>(initialStage);

  const getStageStatus = useCallback((stage: Stage): StageStatus => {
    if (!episodeData) return 'empty';

    switch (stage) {
      case 'config':
        return episodeData.novelText ? 'ready' : 'empty';
      case 'script':
        return episodeData.clips && episodeData.clips.length > 0 ? 'ready' : 'empty';
      case 'storyboard':
        return episodeData.storyboards && episodeData.storyboards.length > 0 ? 'ready' : 'empty';
      case 'video':
        return episodeData.videos && episodeData.videos.length > 0 ? 'ready' : 'empty';
      case 'editor':
        return 'empty';
      default:
        return 'empty';
    }
  }, [episodeData]);

  const stageNavItems = useMemo<StageNavItem[]>(() => [
    { id: 'config', icon: 'S', label: '故事', status: getStageStatus('config') },
    { id: 'script', icon: 'A', label: '剧本', status: getStageStatus('script') },
    { id: 'storyboard', icon: 'B', label: '分镜', status: getStageStatus('storyboard') },
    { id: 'video', icon: 'V', label: '视频', status: getStageStatus('video') },
    {
      id: 'editor',
      icon: 'E',
      label: '编辑器',
      status: 'empty',
      disabled: true,
      disabledLabel: '即将推出',
    },
  ], [getStageStatus]);

  const handleStageChange = useCallback((stage: Stage) => {
    setCurrentStage(stage);
  }, []);

  return {
    currentStage,
    stageNavItems,
    handleStageChange,
  };
}
