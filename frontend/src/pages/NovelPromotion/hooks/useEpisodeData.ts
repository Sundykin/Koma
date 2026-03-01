/**
 * Episode Data Hook
 * 管理 Episode 数据加载
 */

import { useState, useEffect, useCallback } from 'react';
import type { Episode, Clip, Storyboard, Character, Location } from '../types';

// TODO: 实现实际的数据服务
// import { novelPromotionService } from '../../../services/novelPromotionService';

interface UseEpisodeDataResult {
  episode: Episode | null;
  clips: Clip[];
  storyboards: Storyboard[];
  characters: Character[];
  locations: Location[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useEpisodeData(
  projectId: string,
  episodeId: string | null
): UseEpisodeDataResult {
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!episodeId) {
      setEpisode(null);
      setClips([]);
      setStoryboards([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // TODO: 实现实际的数据加载
      // const [episodeData, clipsData, storyboardsData, charactersData, locationsData] = await Promise.all([
      //   novelPromotionService.getEpisode(episodeId),
      //   novelPromotionService.listClips(episodeId),
      //   novelPromotionService.listStoryboards(episodeId),
      //   novelPromotionService.listCharacters(projectId),
      //   novelPromotionService.listLocations(projectId),
      // ]);

      // setEpisode(episodeData);
      // setClips(clipsData);
      // setStoryboards(storyboardsData);
      // setCharacters(charactersData);
      // setLocations(locationsData);

      // 临时 Mock 数据
      setEpisode({
        id: episodeId,
        projectId,
        name: 'Episode 1',
        novelText: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setClips([]);
      setStoryboards([]);
      setCharacters([]);
      setLocations([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load episode data');
    } finally {
      setLoading(false);
    }
  }, [projectId, episodeId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return {
    episode,
    clips,
    storyboards,
    characters,
    locations,
    loading,
    error,
    refetch: fetchData,
  };
}
