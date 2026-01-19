/**
 * 波形渲染器
 * 用于在时间线片段上显示音频波形
 */
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ffmpegManager } from '../../../services/ffmpegManager';

interface WaveformRendererProps {
  source: string;           // 音频/视频文件路径
  resourceId: string;       // 资源ID，用于缓存
  width: number;            // 容器宽度（像素）
  height: number;           // 容器高度（像素）
  startFrame: number;       // 起始帧
  endFrame: number;         // 结束帧
  fps: number;              // 帧率
  offsetL?: number;         // 左侧裁切帧数
  color?: string;           // 波形颜色
}

// 波形图缓存：resourceId → waveformPath
const waveformCache = new Map<string, string>();
// 图片缓存：waveformPath → HTMLImageElement
const imageCache = new Map<string, HTMLImageElement>();

export function WaveformRenderer({
  source,
  resourceId,
  width,
  height,
  startFrame,
  endFrame,
  fps,
  offsetL = 0,
  color = '#22c55e',
}: WaveformRendererProps) {
  const [waveformPath, setWaveformPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [waveformImage, setWaveformImage] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 加载波形图 - 只依赖 source 和 resourceId
  useEffect(() => {
    if (!source) return;

    // 检查缓存
    const cached = waveformCache.get(resourceId);
    if (cached) {
      setWaveformPath(cached);
      setLoading(false);
      return;
    }

    const loadWaveform = async () => {
      setLoading(true);
      try {
        const path = await ffmpegManager.getWaveform(source, resourceId);
        waveformCache.set(resourceId, path);
        setWaveformPath(path);
      } catch (err) {
        console.warn('[WaveformRenderer] Failed to load waveform:', err);
        setWaveformPath(null);
      } finally {
        setLoading(false);
      }
    };

    loadWaveform();
  }, [source, resourceId]);

  // 加载波形图片并缓存
  useEffect(() => {
    if (!waveformPath) return;

    // 检查图片缓存
    const cachedImg = imageCache.get(waveformPath);
    if (cachedImg) {
      setWaveformImage(cachedImg);
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageCache.set(waveformPath, img);
      setWaveformImage(img);
    };
    img.src = `koma-local:///${waveformPath.replace(/\\/g, '/')}`;
  }, [waveformPath]);

  // 绘制波形 - 使用缓存的图片
  useEffect(() => {
    if (!canvasRef.current || !waveformImage) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 计算裁切区域
    const duration = (endFrame - startFrame) / fps;
    const totalDuration = waveformImage.width;
    const clipStart = (offsetL / fps / totalDuration) * waveformImage.width;
    const clipWidth = (duration / totalDuration) * waveformImage.width;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(
      waveformImage,
      clipStart, 0, clipWidth, waveformImage.height,
      0, 0, width, height
    );
  }, [waveformImage, width, height, startFrame, endFrame, fps, offsetL]);

  if (loading && !waveformPath) {
    return (
      <div className="waveformLoading" style={{ width, height }}>
        <div className="waveformPlaceholder" />
      </div>
    );
  }

  // 如果有预生成的波形图，直接显示
  if (waveformPath) {
    return (
      <div className="waveformContainer" style={{ width, height }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="waveformCanvas"
        />
      </div>
    );
  }

  // 降级：显示简单的波形占位
  return (
    <div className="waveformContainer" style={{ width, height }}>
      <svg width={width} height={height} className="waveformSvg">
        <rect
          x="0"
          y={height * 0.3}
          width={width}
          height={height * 0.4}
          fill={color}
          opacity={0.3}
        />
        {/* 简单的波形模拟 */}
        {Array.from({ length: Math.floor(width / 4) }).map((_, i) => {
          const h = Math.random() * height * 0.6 + height * 0.2;
          const y = (height - h) / 2;
          return (
            <rect
              key={i}
              x={i * 4}
              y={y}
              width={2}
              height={h}
              fill={color}
              opacity={0.7}
            />
          );
        })}
      </svg>
    </div>
  );
}

export default WaveformRenderer;
