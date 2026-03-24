import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaType, type Clip, type Track } from '../types/editor';
import { SimpleExportRenderer } from '../services/simpleExportRenderer';
import { SimpleMediaEngine, SimpleVideoRenderer } from './simpleEngine';

vi.mock('antd', () => ({
  message: {
    error: vi.fn(),
  },
}));

vi.mock('./simpleKeyframe', () => ({
  getAnimatedProperties: vi.fn((clip: Clip) => ({
    x: clip.x,
    y: clip.y,
    scale: clip.scale,
    rotation: clip.rotation,
    opacity: clip.opacity,
  })),
}));

function createTextClip(id: string, start: number, duration: number, trackId = 'track-1'): Clip {
  return {
    id,
    assetId: `asset-${id}`,
    trackId,
    start,
    duration,
    offset: 0,
    name: id,
    type: MediaType.TEXT,
    src: id,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    text: id,
  };
}

function createTrack(): Track {
  return {
    id: 'track-1',
    type: 'video',
    order: 0,
    clips: [
      createTextClip('clip-a', 0, 3),
      createTextClip('clip-b', 3, 3),
      createTextClip('clip-c', 6, 2),
    ],
    transitions: [
      {
        id: 'transition-1',
        fromClipId: 'clip-a',
        toClipId: 'clip-b',
        type: 'fade',
        duration: 1,
      },
    ],
  };
}

function createCanvasContext() {
  const alphaSnapshots: number[] = [];
  const ctx = {
    fillStyle: '#000',
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    fillText: vi.fn(() => {
      alphaSnapshots.push(ctx.globalAlpha);
    }),
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    textAlign: 'center',
    textBaseline: 'middle',
    font: '',
  } as unknown as CanvasRenderingContext2D;

  return { ctx, alphaSnapshots };
}

function createExportRenderer() {
  return new SimpleExportRenderer({
    width: 1920,
    height: 1080,
    fps: 30,
    format: 'mp4',
    quality: 'medium',
    outputPath: '/tmp/out.mp4',
  });
}

describe('SimpleVideoRenderer preview/export alignment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => createCanvasContext().ctx);
  });

  it('matches visible clips during overlap with export renderer', () => {
    const previewCanvas = {
      width: 1920,
      height: 1080,
      getContext: vi.fn(() => createCanvasContext().ctx),
    } as unknown as HTMLCanvasElement;
    const previewEngine = new SimpleMediaEngine(8);
    const previewRenderer = new SimpleVideoRenderer(previewEngine, previewCanvas) as any;
    const exportRenderer = createExportRenderer() as any;
    const track = createTrack();

    previewRenderer.setTracks([track]);
    exportRenderer.tracks = [track];
    exportRenderer.resolvedWindows = previewRenderer.resolvedWindows;

    const previewVisible = previewRenderer.getVisibleClips(2.5).map((clip: Clip) => clip.id);
    const exportVisible = exportRenderer.getVisibleClips(2.5).map((entry: { clip: Clip }) => entry.clip.id);

    expect(previewVisible).toEqual(['clip-a', 'clip-b']);
    expect(exportVisible).toEqual(previewVisible);
  });

  it('matches transition opacity with export renderer at key timestamps', async () => {
    const previewContext = createCanvasContext();
    const exportContext = createCanvasContext();
    const previewCanvas = {
      width: 1920,
      height: 1080,
      getContext: vi.fn(() => previewContext.ctx),
    } as unknown as HTMLCanvasElement;
    const previewEngine = new SimpleMediaEngine(8);
    const previewRenderer = new SimpleVideoRenderer(previewEngine, previewCanvas) as any;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(exportContext.ctx);
    const exportRenderer = createExportRenderer() as any;
    const track = createTrack();
    const checkpoints = [2.25, 2.5, 2.75];

    previewRenderer.setTracks([track]);
    exportRenderer.tracks = [track];
    exportRenderer.resolvedWindows = previewRenderer.resolvedWindows;
    exportRenderer.transitionPlansByTrack = previewRenderer.transitionPlansByTrack;

    for (const time of checkpoints) {
      previewContext.alphaSnapshots.length = 0;
      exportContext.alphaSnapshots.length = 0;

      previewRenderer.renderClip(track.clips[0], time);
      previewRenderer.renderClip(track.clips[1], time);
      await exportRenderer.renderClip(track.clips[0], time);
      await exportRenderer.renderClip(track.clips[1], time);

      expect(previewContext.alphaSnapshots).toHaveLength(2);
      expect(exportContext.alphaSnapshots).toHaveLength(2);
      expect(previewContext.alphaSnapshots[0]).toBeCloseTo(exportContext.alphaSnapshots[0], 5);
      expect(previewContext.alphaSnapshots[1]).toBeCloseTo(exportContext.alphaSnapshots[1], 5);
    }
  });
});
