/**
 * 视频帧提取 Hook
 * 使用 ffmpegManager 异步提取视频帧用于时间线预览
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { ffmpegManager } from '../../services/ffmpegManager';
import { toKomaLocalUrl } from '../../utils/urlUtils';

interface FrameCache {
  frames: string[];
  loading: boolean;
  error: string | null;
}

interface UseVideoFramesOptions {
  maxConcurrent?: number;  // 最大并发提取数
  fps?: number;            // 帧率
  frameWidth?: number;     // 帧宽度
}

// 全局帧缓存
const globalFrameCache = new Map<string, FrameCache>();
// 正在提取的任务
const pendingTasks = new Map<string, Promise<string[]>>();

/**
 * 提取视频帧
 */
async function extractVideoFrames(
  videoPath: string,
  resourceId: string,
  fps: number = 1,
  width: number = 320
): Promise<string[]> {
  // 检查缓存
  const cacheKey = `${videoPath}:${fps}:${width}`;
  const cached = globalFrameCache.get(cacheKey);
  if (cached?.frames.length > 0) {
    return cached.frames;
  }

  // 检查是否已在提取中
  const pending = pendingTasks.get(cacheKey);
  if (pending) {
    return pending;
  }

  // 开始提取
  const task = (async () => {
    try {
      await ffmpegManager.init();

      // 检查 ffmpeg 是否可用
      const available = await ffmpegManager.isAvailable();
      if (!available) {
        console.warn('[useVideoFrames] FFmpeg 不可用，跳过帧提取');
        return [];
      }

      const frames = await ffmpegManager.getFrames(videoPath, resourceId);

      // 将帧路径转换为可用的 URL
      const frameUrls = frames.map(f => toKomaLocalUrl(f));

      globalFrameCache.set(cacheKey, {
        frames: frameUrls,
        loading: false,
        error: null
      });

      return frameUrls;
    } catch (err) {
      console.error('[useVideoFrames] 帧提取失败:', err);
      globalFrameCache.set(cacheKey, {
        frames: [],
        loading: false,
        error: err instanceof Error ? err.message : '提取失败'
      });
      return [];
    } finally {
      pendingTasks.delete(cacheKey);
    }
  })();

  pendingTasks.set(cacheKey, task);
  return task;
}

/**
 * 获取单个视频的帧
 */
export function useVideoFrames(
  videoPath: string | null,
  resourceId: string,
  options: UseVideoFramesOptions = {}
): { frames: string[]; loading: boolean; error: string | null } {
  const { fps = 1, frameWidth = 320 } = options;

  const [state, setState] = useState<FrameCache>({
    frames: [],
    loading: false,
    error: null
  });

  useEffect(() => {
    if (!videoPath) {
      setState({ frames: [], loading: false, error: null });
      return;
    }

    const cacheKey = `${videoPath}:${fps}:${frameWidth}`;
    const cached = globalFrameCache.get(cacheKey);

    if (cached?.frames.length > 0) {
      setState(cached);
      return;
    }

    setState({ frames: [], loading: true, error: null });

    extractVideoFrames(videoPath, resourceId, fps, frameWidth)
      .then(frames => {
        setState({ frames, loading: false, error: null });
      })
      .catch(err => {
        setState({
          frames: [],
          loading: false,
          error: err instanceof Error ? err.message : '提取失败'
        });
      });
  }, [videoPath, resourceId, fps, frameWidth]);

  return state;
}

/**
 * 批量管理视频帧的 Hook
 * 用于时间线组件批量预加载帧
 */
export function useVideoFramesBatch(
  clips: Array<{ id: string; src: string; type: string }>,
  options: UseVideoFramesOptions = {}
): Map<string, FrameCache> {
  const { fps = 1, frameWidth = 320, maxConcurrent = 3 } = options;

  const [frameMap, setFrameMap] = useState<Map<string, FrameCache>>(new Map());
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef<Set<string>>(new Set());

  // 处理队列
  const processQueue = useCallback(async () => {
    while (queueRef.current.length > 0 && processingRef.current.size < maxConcurrent) {
      const clipId = queueRef.current.shift();
      if (!clipId) break;

      const clip = clips.find(c => c.id === clipId);
      if (!clip || clip.type !== 'video') continue;

      processingRef.current.add(clipId);

      try {
        const frames = await extractVideoFrames(clip.src, clipId, fps, frameWidth);

        setFrameMap(prev => {
          const next = new Map(prev);
          next.set(clipId, { frames, loading: false, error: null });
          return next;
        });
      } catch (err) {
        setFrameMap(prev => {
          const next = new Map(prev);
          next.set(clipId, {
            frames: [],
            loading: false,
            error: err instanceof Error ? err.message : '提取失败'
          });
          return next;
        });
      } finally {
        processingRef.current.delete(clipId);
        // 继续处理队列
        processQueue();
      }
    }
  }, [clips, fps, frameWidth, maxConcurrent]);

  // 当 clips 变化时，更新队列
  useEffect(() => {
    const videoClips = clips.filter(c => c.type === 'video');

    for (const clip of videoClips) {
      const cacheKey = `${clip.src}:${fps}:${frameWidth}`;
      const cached = globalFrameCache.get(cacheKey);

      if (cached?.frames.length > 0) {
        // 已有缓存
        setFrameMap(prev => {
          const next = new Map(prev);
          next.set(clip.id, cached);
          return next;
        });
      } else if (!processingRef.current.has(clip.id) && !queueRef.current.includes(clip.id)) {
        // 加入队列
        queueRef.current.push(clip.id);
        setFrameMap(prev => {
          const next = new Map(prev);
          next.set(clip.id, { frames: [], loading: true, error: null });
          return next;
        });
      }
    }

    processQueue();
  }, [clips, fps, frameWidth, processQueue]);

  return frameMap;
}

/**
 * 清除帧缓存
 */
export function clearFrameCache(videoPath?: string): void {
  if (videoPath) {
    for (const key of globalFrameCache.keys()) {
      if (key.startsWith(videoPath)) {
        globalFrameCache.delete(key);
      }
    }
  } else {
    globalFrameCache.clear();
  }
}

export default useVideoFrames;
