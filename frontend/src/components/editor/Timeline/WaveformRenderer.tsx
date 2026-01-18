/**
 * 波形渲染器
 * 用于在时间线片段上显示音频波形
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 加载波形图
  useEffect(() => {
    if (!source) return;

    const loadWaveform = async () => {
      setLoading(true);
      try {
        const path = await ffmpegManager.getWaveform(source, resourceId);
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

  // 绘制波形
  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !waveformPath) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // 计算裁切区域
      const duration = (endFrame - startFrame) / fps;
      const totalDuration = img.width;  // 假设波形图宽度与时长成比例
      const clipStart = (offsetL / fps / totalDuration) * img.width;
      const clipWidth = (duration / totalDuration) * img.width;

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(
        img,
        clipStart, 0, clipWidth, img.height,
        0, 0, width, height
      );
    };
    img.src = `koma-local:///${waveformPath.replace(/\\/g, '/')}`;
  }, [waveformPath, width, height, startFrame, endFrame, fps, offsetL]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

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
