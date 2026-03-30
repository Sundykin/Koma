import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeData } from '../../../types/linghui';
import { VideoNode } from './VideoNode';

const {
  useNodeRunStateMock,
  useLinghuiNodeInteractionMock,
  useLinghuiNodeEditorVisibilityMock,
} = vi.hoisted(() => ({
  useNodeRunStateMock: vi.fn(),
  useLinghuiNodeInteractionMock: vi.fn(),
  useLinghuiNodeEditorVisibilityMock: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="handle" />,
  Position: {
    Left: 'left',
    Right: 'right',
  },
}));

vi.mock('./LinghuiNodeRunsContext', () => ({
  useNodeRunState: (...args: unknown[]) => useNodeRunStateMock(...args),
  useLinghuiNodeInteraction: (...args: unknown[]) => useLinghuiNodeInteractionMock(...args),
  useLinghuiNodeEditorVisibility: (...args: unknown[]) => useLinghuiNodeEditorVisibilityMock(...args),
}));

vi.mock('../LinghuiNodeEditor', () => ({
  LinghuiNodeEditor: () => <div data-testid="video-node-editor" />,
}));

vi.mock('./EditableCompactNodeLabel', () => ({
  EditableCompactNodeLabel: ({ label, fallbackLabel }: { label: string; fallbackLabel?: string }) => (
    <span>{label || fallbackLabel}</span>
  ),
}));

function createVideoNodeData(): LinghuiNodeData {
  return {
    linghuiType: 'linghui/video',
    label: '视频节点',
    accent: '#38bdf8',
    background: '#0f1720',
    active: true,
    inputs: [
      { name: '图片', dataType: 'image' },
      { name: '文本', dataType: 'text' },
      { name: '音频', dataType: 'audio' },
      { name: '视频', dataType: 'video' },
    ],
    outputs: [{ name: '输出', dataType: 'video' }],
    properties: {
      prompt: '',
      itvSelection: '',
      source: '',
      posterSource: '',
      videoCapability: 'video.image-to-video',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: 5,
    },
  };
}

describe('VideoNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLinghuiNodeEditorVisibilityMock.mockReturnValue(false);
  });

  it('在节点内联渲染视频并隔离播放按钮事件', async () => {
    const surfaceClickSpy = vi.fn();
    const surfacePointerDownSpy = vi.fn();
    const playMock = vi.fn().mockResolvedValue(undefined);
    const pauseMock = vi.fn();

    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: playMock,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: pauseMock,
    });

    useNodeRunStateMock.mockReturnValue({
      status: 'succeeded',
      result: {
        kind: 'video',
        primary: {
          kind: 'video',
          source: 'https://cdn.example.com/cat.mp4',
          posterSource: 'https://cdn.example.com/cat-poster.jpg',
        },
        metadata: {
          aspectRatio: '16:9',
        },
      },
    });
    useLinghuiNodeInteractionMock.mockReturnValue({
      onClick: surfaceClickSpy,
      onPointerDown: surfacePointerDownSpy,
    });

    render(
      <VideoNode
        {...({
          id: 'video-node-1',
          data: createVideoNodeData(),
          selected: false,
          dragging: false,
          zIndex: 1,
          xPos: 0,
          yPos: 0,
          type: 'linghui-video',
          isConnectable: true,
        } as any)}
      />
    );

    const video = document.querySelector('video');
    expect(video).toBeInstanceOf(HTMLVideoElement);

    const playButton = screen.getByRole('button', { name: '播放视频' });
    const nodeSurface = playButton.closest('.linghuiCompactNode');
    expect(nodeSurface).toBeTruthy();

    fireEvent.click(nodeSurface as HTMLElement);
    expect(surfaceClickSpy).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(playButton);
    fireEvent.click(playButton);

    expect(surfacePointerDownSpy).not.toHaveBeenCalled();
    expect(surfaceClickSpy).toHaveBeenCalledTimes(1);
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('暂停后再次播放会重新启动节点帧刷新循环', () => {
    const requestAnimationFrameMock = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => window.setTimeout(() => callback(performance.now()), 0));
    const cancelAnimationFrameMock = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(handle => window.clearTimeout(handle));

    const drawImageMock = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: drawImageMock,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D);

    useNodeRunStateMock.mockReturnValue({
      status: 'succeeded',
      result: {
        kind: 'video',
        primary: {
          kind: 'video',
          source: 'https://cdn.example.com/cat.mp4',
          posterSource: 'https://cdn.example.com/cat-poster.jpg',
        },
        metadata: {
          aspectRatio: '16:9',
        },
      },
    });
    useLinghuiNodeInteractionMock.mockReturnValue({});

    render(
      <VideoNode
        {...({
          id: 'video-node-2',
          data: createVideoNodeData(),
          selected: false,
          dragging: false,
          zIndex: 1,
          xPos: 0,
          yPos: 0,
          type: 'linghui-video',
          isConnectable: true,
        } as any)}
      />
    );

    const video = document.querySelector('video') as HTMLVideoElement;
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    expect(video).toBeTruthy();
    expect(canvas).toBeTruthy();

    let paused = true;
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused,
    });
    Object.defineProperty(video, 'ended', {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(video, 'readyState', {
      configurable: true,
      get: () => HTMLMediaElement.HAVE_ENOUGH_DATA,
    });
    Object.defineProperty(video, 'videoWidth', {
      configurable: true,
      get: () => 1280,
    });
    Object.defineProperty(video, 'videoHeight', {
      configurable: true,
      get: () => 720,
    });
    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      get: () => 320,
    });
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      get: () => 180,
    });
    Object.defineProperty(canvas, 'offsetWidth', {
      configurable: true,
      get: () => 320,
    });
    Object.defineProperty(canvas, 'offsetHeight', {
      configurable: true,
      get: () => 180,
    });

    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockImplementation(function play(this: HTMLMediaElement) {
        paused = false;
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
      }),
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: vi.fn().mockImplementation(function pause(this: HTMLMediaElement) {
        paused = true;
        this.dispatchEvent(new Event('pause'));
      }),
    });

    const playButton = screen.getByRole('button', { name: '播放视频' });

    fireEvent.click(playButton);
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

    const pauseButton = screen.getByRole('button', { name: '暂停视频' });
    fireEvent.click(pauseButton);
    expect(cancelAnimationFrameMock).toHaveBeenCalledTimes(1);

    const replayButton = screen.getByRole('button', { name: '播放视频' });
    fireEvent.click(replayButton);
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2);
    expect(drawImageMock).toHaveBeenCalled();
  });
});
