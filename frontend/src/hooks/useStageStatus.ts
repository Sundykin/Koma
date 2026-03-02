import { useState, useEffect, useCallback } from 'react';
import { loadCharacters, loadScenes, loadEpisodeShots } from '../store/projectStore';

export type StageStatus = 'empty' | 'active' | 'processing' | 'ready';

export interface StageStatuses {
  story: StageStatus;
  script: StageStatus;
  storyboard: StageStatus;
  video: StageStatus;
  edit: StageStatus;
}

interface Episode {
  id: string;
  storyText?: string;
  scriptText?: string;
}

export function useStageStatus(projectId: string | null, episode: Episode | null) {
  const [statuses, setStatuses] = useState<StageStatuses>({
    story: 'empty',
    script: 'empty',
    storyboard: 'empty',
    video: 'empty',
    edit: 'empty',
  });

  const refresh = useCallback(async () => {
    if (!projectId || !episode) {
      setStatuses({ story: 'empty', script: 'empty', storyboard: 'empty', video: 'empty', edit: 'empty' });
      return;
    }

    const newStatuses: StageStatuses = { story: 'empty', script: 'empty', storyboard: 'empty', video: 'empty', edit: 'empty' };

    // Story: 有故事文本就 ready
    if (episode.storyText?.trim() || episode.scriptText?.trim()) {
      newStatuses.story = 'ready';
    }

    // Script: 有剧本文本就 active，有资产就 ready
    if (episode.scriptText?.trim()) {
      const [characters, scenes] = await Promise.all([
        loadCharacters(projectId),
        loadScenes(projectId),
      ]);
      if (characters.length > 0 || scenes.length > 0) {
        newStatuses.script = 'ready';
      } else {
        newStatuses.script = 'active';
      }
    }

    // Storyboard: 有分镜数据就 ready
    try {
      const shots = await loadEpisodeShots(projectId, episode.id);
      if (shots.length > 0) {
        newStatuses.storyboard = shots.some(s => s.imagePath || s.imagePaths?.length) ? 'ready' : 'active';
      }

      // Video: 有视频就 ready
      const hasVideo = shots.some(s => s.videoPath || (s as any).videoPaths?.length || (s as any).videos?.length);
      if (hasVideo) {
        newStatuses.video = 'ready';
      } else if (shots.length > 0 && shots.some(s => s.imagePath)) {
        newStatuses.video = 'active';
      }

      // Edit: video ready 之后才能 active
      if (hasVideo) {
        newStatuses.edit = 'active';
      }
    } catch {
      // 忽略错误
    }

    setStatuses(newStatuses);
  }, [projectId, episode?.id, episode?.storyText, episode?.scriptText]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { statuses, refreshStatuses: refresh };
}
