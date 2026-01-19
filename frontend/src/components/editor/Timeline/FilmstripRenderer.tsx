/**
 * 胶片缩略图渲染器
 * 用于在时间线片段上显示视频帧缩略图
 */
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ffmpegManager } from '../../../services/ffmpegManager';

interface FilmstripRendererProps {
  source: string;           // 视频文件路径
  resourceId: string;       // 资源ID，用于缓存
  width: number;            // 容器宽度（像素）
  height: number;           // 容器高度（像素）
  startFrame: number;       // 起始帧
  endFrame: number;         // 结束帧
  fps: number;              // 帧率
  offsetL?: number;         // 左侧裁切帧数
  scale: number;            // 缩放比例（像素/帧）
}

// 帧缓存：source + resourceId → frames
const frameCache = new Map<string, string[]>();

export function FilmstripRenderer({
  source,
  resourceId,
  width,
  height,
  startFrame,
  endFrame,
  fps,
  offsetL = 0,
  scale,
}: FilmstripRendererProps) {
  const [frames, setFrames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算需要显示的帧数
  const duration = (endFrame - startFrame) / fps;
  const thumbWidth = Math.max(40, height * 16 / 9);

  // 缓存 key
  const cacheKey = `${resourceId}:${source}`;

  // 加载帧 - 只依赖 source 和 resourceId，不依赖 duration
  useEffect(() => {
    if (!source) return;

    // 检查缓存
    const cached = frameCache.get(cacheKey);
    if (cached) {
      setFrames(cached);
      setLoading(false);
      return;
    }

    const loadFrames = async () => {
      setLoading(true);
      try {
        // 加载整个资源的帧（范围扩大以支持裁剪）
        const loadedFrames = await ffmpegManager.getFrames(
          source,
          resourceId,
          [0, 60]  // 加载前 60 秒的帧
        );

        frameCache.set(cacheKey, loadedFrames);
        setFrames(loadedFrames);
      } catch (err) {
        console.warn('[FilmstripRenderer] Failed to load frames:', err);
        setFrames([]);
      } finally {
        setLoading(false);
      }
    };

    loadFrames();
  }, [source, resourceId, cacheKey]);

  // 计算每个缩略图的位置 - 使用缓存的帧
  const thumbnails = useMemo(() => {
    if (frames.length === 0) return [];

    const result: { src: string; left: number; width: number }[] = [];
    const visibleCount = Math.ceil(width / thumbWidth);

    // 根据 offsetL 计算起始帧索引
    const startFrameIndex = Math.floor(offsetL / fps);
    const framesPerThumb = Math.max(1, Math.floor(duration));

    for (let i = 0; i < visibleCount; i++) {
      const frameIndex = Math.min(startFrameIndex + i * framesPerThumb, frames.length - 1);
      if (frameIndex < 0 || frameIndex >= frames.length) continue;

      result.push({
        src: frames[frameIndex],
        left: i * thumbWidth,
        width: thumbWidth,
      });
    }

    return result;
  }, [frames, width, thumbWidth, offsetL, fps, duration]);

  if (loading && frames.length === 0) {
    return (
      <div className="filmstripLoading" style={{ width, height }}>
        <div className="filmstripPlaceholder" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="filmstripContainer" style={{ width, height }}>
      {thumbnails.map((thumb, idx) => (
        <div
          key={idx}
          className="filmstripThumb"
          style={{
            left: thumb.left,
            width: thumb.width,
            height,
          }}
        >
          <img
            src={`koma-local:///${thumb.src.replace(/\\/g, '/')}`}
            alt=""
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}

export default FilmstripRenderer;
