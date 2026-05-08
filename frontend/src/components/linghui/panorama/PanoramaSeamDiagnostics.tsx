/**
 * 全景 seam 诊断面板。
 *
 * 不当成报错，而是当成"质量仪表"，给用户一眼看清左右是否能拼上、是否有重复主体。
 *
 * 三个视图：
 *   1. 左右边界并排对比：把左 8% 和右 8% 摘出并排显示
 *   2. 横向重复：image repeated 1.5x，暴露重复主体和边界断裂
 *   3. seam score：低分辨率读取左右边缘像素列，用 RGB 平均差做个粗略风险等级
 *
 * 设计上不强制阻塞执行；执行器、节点编辑器都不依赖它。仅供调试 / 调 prompt 使用。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { safeFetch } from '../../../utils/safeFetch';

interface PanoramaSeamDiagnosticsProps {
  imageUrl: string;
  className?: string;
}

type SeamRisk = 'low' | 'medium' | 'high' | 'unknown';

interface SeamAnalysis {
  risk: SeamRisk;
  /** 0-100 数字化得分，越高越像"边缘断裂" */
  delta: number;
}

async function loadImageBitmap(url: string): Promise<HTMLImageElement> {
  let resolvedUrl = url;
  let blobUrl: string | null = null;

  // http(s)/blob/data 走 safeFetch 经主进程，绕开 CORS
  if (/^https?:\/\//i.test(url)) {
    const res = await safeFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    blobUrl = URL.createObjectURL(blob);
    resolvedUrl = blobUrl;
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      resolve(img);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    img.onerror = (err) => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      reject(err);
    };
    img.src = resolvedUrl;
  });
}

function analyzeSeam(image: HTMLImageElement): SeamAnalysis {
  const SAMPLE_HEIGHT = 64;
  const sampleAspect = image.width / image.height;
  const sampleW = Math.max(8, Math.round(SAMPLE_HEIGHT * sampleAspect));
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = SAMPLE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { risk: 'unknown', delta: 0 };
  ctx.drawImage(image, 0, 0, sampleW, SAMPLE_HEIGHT);

  let leftPixels: Uint8ClampedArray;
  let rightPixels: Uint8ClampedArray;
  try {
    leftPixels = ctx.getImageData(0, 0, 1, SAMPLE_HEIGHT).data;
    rightPixels = ctx.getImageData(sampleW - 1, 0, 1, SAMPLE_HEIGHT).data;
  } catch {
    return { risk: 'unknown', delta: 0 };
  }

  let totalDiff = 0;
  for (let i = 0; i < SAMPLE_HEIGHT; i += 1) {
    const ri = i * 4;
    const dr = leftPixels[ri] - rightPixels[ri];
    const dg = leftPixels[ri + 1] - rightPixels[ri + 1];
    const db = leftPixels[ri + 2] - rightPixels[ri + 2];
    totalDiff += Math.sqrt(dr * dr + dg * dg + db * db);
  }
  const avg = totalDiff / SAMPLE_HEIGHT; // 单位约 [0, 441]（max sqrt(255²*3)）
  const delta = Math.round((avg / 441) * 100);

  let risk: SeamRisk = 'low';
  if (delta >= 50) risk = 'high';
  else if (delta >= 25) risk = 'medium';
  return { risk, delta };
}

const RISK_LABEL: Record<SeamRisk, { text: string }> = {
  low: { text: '低' },
  medium: { text: '中' },
  high: { text: '高' },
  unknown: { text: '—' },
};

function resolveDocumentColor(token: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return window.getComputedStyle(window.document.documentElement).getPropertyValue(token).trim() || fallback;
}

export const PanoramaSeamDiagnostics: React.FC<PanoramaSeamDiagnosticsProps> = ({ imageUrl, className }) => {
  const [analysis, setAnalysis] = useState<SeamAnalysis>({ risk: 'unknown', delta: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapPreviewRef = useRef<HTMLCanvasElement | null>(null);
  const edgePreviewRef = useRef<HTMLCanvasElement | null>(null);

  const previewKey = useMemo(() => imageUrl, [imageUrl]);

  useEffect(() => {
    if (!previewKey) return;
    let cancelled = false;
    setLoaded(false);
    setError(null);

    (async () => {
      try {
        const img = await loadImageBitmap(previewKey);
        if (cancelled) return;

        // 横向重复 1.5×
        const wrapCanvas = wrapPreviewRef.current;
        if (wrapCanvas) {
          const targetH = 96;
          const scale = targetH / img.height;
          const targetW = Math.round(img.width * scale);
          wrapCanvas.width = Math.round(targetW * 1.5);
          wrapCanvas.height = targetH;
          const ctx = wrapCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, targetW, targetH);
            ctx.drawImage(img, targetW, 0, Math.round(targetW * 0.5), targetH, 0, 0, 0, 0);
            ctx.drawImage(img, targetW, 0, Math.round(targetW * 0.5), targetH);
          }
        }

        // 左右边界 8% 并排
        const edgeCanvas = edgePreviewRef.current;
        if (edgeCanvas) {
          const targetH = 96;
          const sliceW = Math.max(8, Math.round(img.width * 0.08));
          const scale = targetH / img.height;
          const sliceTarget = Math.max(24, Math.round(sliceW * scale));
          edgeCanvas.width = sliceTarget * 2 + 4;
          edgeCanvas.height = targetH;
          const ctx = edgeCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = resolveDocumentColor('--token-overlay-on-bg', 'white');
            ctx.fillRect(sliceTarget, 0, 4, targetH);
            // 右边缘画在左半边（让用户看到 right-end 之后是 left-start 的过渡）
            ctx.drawImage(img, img.width - sliceW, 0, sliceW, img.height, 0, 0, sliceTarget, targetH);
            ctx.drawImage(img, 0, 0, sliceW, img.height, sliceTarget + 4, 0, sliceTarget, targetH);
          }
        }

        const a = analyzeSeam(img);
        if (!cancelled) {
          setAnalysis(a);
          setLoaded(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewKey]);

  return (
    <div className={`linghuiPanoramaSeamDiagnostics ${className || ''}`}>
      <div className="linghuiPanoramaSeamHeader">
        <span className="linghuiPanoramaSeamTitle">边缘拼接诊断</span>
        <span className={`linghuiPanoramaSeamScore isRisk-${analysis.risk}`}>
          风险 {RISK_LABEL[analysis.risk].text}
          {loaded && analysis.risk !== 'unknown' ? ` · ${analysis.delta}` : ''}
        </span>
      </div>

      {!imageUrl ? (
        <div className="linghuiPanoramaSeamHint">先生成一张全景，再启用诊断</div>
      ) : error ? (
        <div className="linghuiPanoramaSeamHint">诊断不可用：{error}</div>
      ) : (
        <>
          <div className="linghuiPanoramaSeamRow">
            <div className="linghuiPanoramaSeamRowLabel">右边 ↔ 左边（应自然续接）</div>
            <canvas ref={edgePreviewRef} className="linghuiPanoramaSeamCanvas" />
          </div>
          <div className="linghuiPanoramaSeamRow">
            <div className="linghuiPanoramaSeamRowLabel">横向重复 1.5×（暴露重复主体）</div>
            <canvas ref={wrapPreviewRef} className="linghuiPanoramaSeamCanvas" />
          </div>
        </>
      )}
    </div>
  );
};

export default PanoramaSeamDiagnostics;
