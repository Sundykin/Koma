import { useState, useEffect, useCallback } from 'react';
import { listEpisodes, createEpisode, saveEpisode, deleteEpisode } from '../store/projectStore';

// 注意：Episode 类型要从 types.ts 导入，但由于 types.ts 正在被另一个 agent 重构，
// 这里我们直接定义需要的最小接口

interface Episode {
  id: string;
  projectId: string;
  number: number;
  title: string;
  storyText?: string;
  scriptText?: string;
  createdAt: number;
  updatedAt: number;
}

export function useEpisodeData(projectId: string | null) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(false);

  // 加载剧集列表
  const refresh = useCallback(async () => {
    if (!projectId) {
      setEpisodes([]);
      return;
    }
    setLoading(true);
    try {
      const list = await listEpisodes(projectId);
      setEpisodes(list);
      // 如果当前选中的剧集不在列表中，清除选中
      if (currentEpisode && !list.find(e => e.id === currentEpisode.id)) {
        setCurrentEpisode(null);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, currentEpisode]);

  useEffect(() => {
    refresh();
  }, [projectId]); // 仅在 projectId 变化时自动加载

  const selectEpisode = useCallback((episodeId: string) => {
    const ep = episodes.find(e => e.id === episodeId);
    setCurrentEpisode(ep || null);
  }, [episodes]);

  const addEpisode = useCallback(async (data: { number: number; title: string; storyText?: string; scriptText?: string }) => {
    if (!projectId) return null;
    const ep = await createEpisode(projectId, {
      ...data,
      status: 'draft',
    } as any);
    await refresh();
    return ep;
  }, [projectId, refresh]);

  const updateEpisode = useCallback(async (episodeId: string, updates: Partial<Episode>) => {
    if (!projectId) return;
    await saveEpisode(projectId, episodeId, updates as any);
    await refresh();
  }, [projectId, refresh]);

  const removeEpisode = useCallback(async (episodeId: string) => {
    if (!projectId) return;
    await deleteEpisode(projectId, episodeId);
    if (currentEpisode?.id === episodeId) {
      setCurrentEpisode(null);
    }
    await refresh();
  }, [projectId, currentEpisode, refresh]);

  return {
    episodes,
    currentEpisode,
    loading,
    refresh,
    selectEpisode,
    addEpisode,
    updateEpisode,
    removeEpisode,
  };
}
