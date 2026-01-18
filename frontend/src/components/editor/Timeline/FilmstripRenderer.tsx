/**
 * 胶片缩略图渲染器
 * 用于在时间线片段上显示视频帧缩略图
 */
import React, { useEffect, useState, useMemo, useRef } from 'react';
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

  // 计算需要显示的帧数（每秒抽 1 帧作为缩略图）
  const duration = (endFrame - startFrame) / fps;
  const frameCount = Math.max(1, Math.ceil(duration));
  const thumbWidth = Math.max(40, height * 16 / 9);

  // 加载帧
  useEffect(() => {
    if (!source) return;

    const loadFrames = async () => {
      setLoading(true);
      try {
        // 计算实际的时间范围（考虑 offsetL）
        const startTime = offsetL / fps;
        const endTime = startTime + duration;

        const loadedFrames = await ffmpegManager.getFrames(
          source,
          resourceId,
          [startTime, endTime]
        );

        setFrames(loadedFrames);
      } catch (err) {
        console.warn('[FilmstripRenderer] Failed to load frames:', err);
        setFrames([]);
      } finally {
        setLoading(false);
      }
    };

    loadFrames();
  }, [source, resourceId, offsetL, duration, fps]);

  // 计算每个缩略图的位置
  const thumbnails = useMemo(() => {
    if (frames.length === 0) return [];

    const result: { src: string; left: number; width: number }[] = [];
    const visibleCount = Math.ceil(width / thumbWidth);
    const framesPerThumb = Math.max(1, Math.floor(frames.length / visibleCount));

    for (let i = 0; i < visibleCount && i * framesPerThumb < frames.length; i++) {
      const frameIndex = Math.min(i * framesPerThumb, frames.length - 1);
      result.push({
        src: frames[frameIndex],
        left: i * thumbWidth,
        width: thumbWidth,
      });
    }

    return result;
  }, [frames, width, thumbWidth]);

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
