/**
 * 分镜数据加载与保存逻辑（从 Storyboard.tsx 拆出）。
 *
 * 职责：
 *   - loadData：剧集分镜 + 角色/场景/道具（按剧集分析 refs 过滤）+ shotMetas 的首次加载
 *   - refreshShotsFromStore / queueRefreshShotsFromStore：任务完成后从 DB 重拉（队列防并发抖动）
 *   - saveAllShots：统一写入路径——本地立即更新（输入法不被打断）+ 队列化异步落库
 *   - flushQueuedShotSaves：保存队列消费（同一时间最多一个在跑，期间新改动重新排队）
 *   - handleDeleteShot / handleBatchDelete：删除分镜
 */
import { useCallback, useRef } from 'react';
import type { Shot, ShotMeta, Character, Scene, Prop } from '../../../types';
import {
  loadEpisodeShots,
  saveEpisodeShots,
  loadCharacters,
  loadScenes,
  loadProps,
  loadEpisodeAnalysis,
  listShots,
} from '../../../store/projectStore';
import { clampDurationToSpec, type VideoDurationSpec } from '../../../providers/itv/durationSpec';
import { createLogger } from '../../../store/logger';

const logger = createLogger('StoryboardPersistence');

export interface StoryboardPersistenceDeps {
  projectId: string;
  episodeId?: string;
  itvDurationSpec: VideoDurationSpec;
  shots: Shot[];
  shotsRef: React.MutableRefObject<Shot[]>;
  setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
  setShotMetas: React.Dispatch<React.SetStateAction<ShotMeta[]>>;
  setCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  setProps: React.Dispatch<React.SetStateAction<Prop[]>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  message: {
    success: (c: string) => void;
    warning: (c: string) => void;
    error: (c: string) => void;
    info: (c: string) => void;
  };
}

export function useStoryboardPersistence(deps: StoryboardPersistenceDeps) {
  const {
    projectId, episodeId, itvDurationSpec,
    shots, shotsRef, setShots, setShotMetas, setCharacters, setScenes, setProps, setLoading,
    message,
  } = deps;

  const queuedShotsSaveRef = useRef<{ projectId: string; episodeId: string; shots: Shot[] } | null>(null);
  const activeShotsSaveRef = useRef<Promise<void> | null>(null);
  const shotStoreRefreshRef = useRef<Promise<void>>(Promise.resolve());

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const loadedShots = episodeId ? await loadEpisodeShots(projectId, episodeId) : [];
      const [loadedCharacters, loadedScenes, loadedProps, episodeAnalysis, loadedShotMetas] = await Promise.all([
        loadCharacters(projectId),
        loadScenes(projectId),
        loadProps(projectId),
        episodeId ? loadEpisodeAnalysis(projectId, episodeId) : Promise.resolve(null),
        listShots(projectId),
      ]);

      // 根据剧集分析结果筛选资产
      let filteredCharacters = loadedCharacters;
      let filteredScenes = loadedScenes;
      let filteredProps = loadedProps;

      if (episodeAnalysis) {
        // 构建 refs 集合：从 episodeAnalysis.xxxRefs + shots 中的资产 ID 合并
        const charRefs = new Set(episodeAnalysis.characterRefs || []);
        const sceneRefs = new Set(episodeAnalysis.sceneRefs || []);
        const propRefs = new Set(episodeAnalysis.propRefs || []);

        // 补充：从 shots 中提取所有引用的资产 ID（兜底 refs 为空的情况）
        for (const shot of loadedShots) {
          for (const id of shot.characters || []) { if (id) charRefs.add(id); }
          for (const id of shot.scenes || []) { if (id) sceneRefs.add(id); }
          for (const id of shot.props || []) { if (id) propRefs.add(id); }
        }

        // 仅在有 refs 时过滤，否则保留全部资产
        if (charRefs.size > 0) {
          filteredCharacters = loadedCharacters.filter(c => charRefs.has(c.id));
        }
        if (sceneRefs.size > 0) {
          filteredScenes = loadedScenes.filter(s => sceneRefs.has(s.id));
        }
        if (propRefs.size > 0) {
          filteredProps = loadedProps.filter(p => propRefs.has(p.id));
        }
      }

      // 分镜资产绑定与提示词 @mention 统一使用项目内 ID。
      // duration 按当前 ITV 渠道 spec 吸附（grok 枚举 / seedance 范围），不再固定 grok
      const normalizedShots = loadedShots.map(shot => ({ ...shot, duration: clampDurationToSpec(shot.duration, itvDurationSpec) }));
      shotsRef.current = normalizedShots;
      setShots(normalizedShots);
      setShotMetas(loadedShotMetas);
      setCharacters(filteredCharacters);
      setScenes(filteredScenes);
      setProps(filteredProps);
    } catch (err) {
      logger.error('加载失败', err);
      message.error('加载分镜数据失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, episodeId, itvDurationSpec, shotsRef, setShots, setShotMetas, setCharacters, setScenes, setProps, setLoading, message]);

  const refreshShotsFromStore = useCallback(async () => {
    if (!projectId || !episodeId) {
      return;
    }
    const [latestShots, latestShotMetas] = await Promise.all([
      loadEpisodeShots(projectId, episodeId),
      listShots(projectId),
    ]);
    const normalizedShots = latestShots.map(shot => ({ ...shot, duration: clampDurationToSpec(shot.duration, itvDurationSpec) }));
    shotsRef.current = normalizedShots;
    setShots(normalizedShots);
    setShotMetas(latestShotMetas);
  }, [projectId, episodeId, itvDurationSpec, shotsRef, setShots, setShotMetas]);

  const queueRefreshShotsFromStore = useCallback((): Promise<void> => {
    const next = shotStoreRefreshRef.current
      .catch(() => undefined)
      .then(() => refreshShotsFromStore())
      .catch((error: unknown) => {
        logger.warn('刷新分镜存储失败', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    shotStoreRefreshRef.current = next;
    return next;
  }, [refreshShotsFromStore]);

  const flushQueuedShotSaves = useCallback((): Promise<void> => {
    if (activeShotsSaveRef.current) {
      return activeShotsSaveRef.current;
    }

    const task = (async () => {
      while (queuedShotsSaveRef.current) {
        const snapshot = queuedShotsSaveRef.current;
        queuedShotsSaveRef.current = null;
        await saveEpisodeShots(snapshot.projectId, snapshot.episodeId, snapshot.shots);
        // 注：剧本（episode.scriptText）和分镜各自独立持久化，互不影响；
        // 分镜内编辑/拖动字幕行不会反向同步到剧本步。
      }
    })();

    activeShotsSaveRef.current = task
      .catch((error: unknown) => {
        logger.error('保存分镜失败', error);
        message.error('保存失败');
      })
      .finally(() => {
        activeShotsSaveRef.current = null;
        if (queuedShotsSaveRef.current) {
          void flushQueuedShotSaves();
        }
      });

    return activeShotsSaveRef.current;
  }, [message]);

  /** 保存分镜数据：先本地更新（输入法不被异步回写打断），再队列化落库 */
  const saveAllShots = useCallback((updatedShots: Shot[]) => {
    if (!episodeId) {
      message.warning('未选择剧集，无法保存分镜');
      return Promise.resolve();
    }

    const normalizedShots = updatedShots.map(shot => ({
      ...shot,
      duration: clampDurationToSpec(shot.duration, itvDurationSpec),
    }));

    shotsRef.current = normalizedShots;
    setShots(normalizedShots);
    queuedShotsSaveRef.current = {
      projectId,
      episodeId,
      shots: normalizedShots,
    };

    return flushQueuedShotSaves();
  }, [projectId, episodeId, message, flushQueuedShotSaves, itvDurationSpec, shotsRef, setShots]);

  const handleDeleteShot = useCallback(async (shotId: string) => {
    const updatedShots = shots.filter(s => s.id !== shotId);
    await saveAllShots(updatedShots);
    message.success('分镜已删除');
  }, [shots, saveAllShots, message]);

  const handleBatchDelete = useCallback(async (shotIds: string[]) => {
    const updatedShots = shots.filter(s => !shotIds.includes(s.id));
    await saveAllShots(updatedShots);
    message.success(`已删除 ${shotIds.length} 个分镜`);
  }, [shots, saveAllShots, message]);

  return {
    loadData,
    refreshShotsFromStore,
    queueRefreshShotsFromStore,
    flushQueuedShotSaves,
    saveAllShots,
    handleDeleteShot,
    handleBatchDelete,
  };
}
