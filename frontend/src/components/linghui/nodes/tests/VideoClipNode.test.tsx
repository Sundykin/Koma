import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeData, LinghuiNodeRunState } from '../../../../types/linghui';
import { VideoClipNode } from '../components/VideoClipNode';

const {
  useNodeRunStateMock,
  useLinghuiNodeInteractionMock,
  useLinghuiNodeEditorApiMock,
  useLinghuiNodeMutationMock,
  useStoreMock,
} = vi.hoisted(() => ({
  useNodeRunStateMock: vi.fn(),
  useLinghuiNodeInteractionMock: vi.fn(),
  useLinghuiNodeEditorApiMock: vi.fn(),
  useLinghuiNodeMutationMock: vi.fn(),
  useStoreMock: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="handle" />,
  Position: {
    Left: 'left',
    Right: 'right',
  },
  useStore: (selector: (state: { edges: unknown[]; nodes: unknown[]; connection?: unknown }) => unknown) => (
    useStoreMock(selector)
  ),
}));

vi.mock('../state/LinghuiNodeRunsContext', () => ({
  useNodeRunState: (...args: unknown[]) => useNodeRunStateMock(...args),
  useLinghuiNodeInteraction: (...args: unknown[]) => useLinghuiNodeInteractionMock(...args),
  useLinghuiNodeEditorApi: () => useLinghuiNodeEditorApiMock(),
  useLinghuiNodeMutation: () => useLinghuiNodeMutationMock(),
}));

vi.mock('../components/EditableCompactNodeLabel', () => ({
  EditableCompactNodeLabel: ({ label, fallbackLabel }: { label: string; fallbackLabel?: string }) => (
    <span>{label || fallbackLabel}</span>
  ),
}));

function createVideoClipNodeData(overrides: Partial<LinghuiNodeData['properties']> = {}): LinghuiNodeData {
  return {
    linghuiType: 'linghui/video-clip',
    label: '视频合成',
    accent: '#38bdf8',
    background: '#0f1720',
    active: true,
    inputs: [
      { name: '视频片段', dataType: 'video' },
      { name: '图片片段', dataType: 'image' },
      { name: '音频', dataType: 'audio' },
    ],
    outputs: [{ name: 'video', dataType: 'video' }],
    properties: {
      clips: [],
      resolution: '1080p',
      fps: 30,
      imageDurationSec: 3,
      source: '',
      posterSource: '',
      status: 'idle',
      ...overrides,
    },
  };
}

function renderVideoClipNode(data = createVideoClipNodeData()) {
  return render(
    <VideoClipNode
      {...({
        id: 'video-clip-1',
        data,
        selected: false,
        dragging: false,
        zIndex: 1,
        xPos: 0,
        yPos: 0,
        type: 'linghui-video-clip',
        isConnectable: true,
      } as any)}
    />
  );
}

describe('VideoClipNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNodeRunStateMock.mockReturnValue(undefined);
    useLinghuiNodeInteractionMock.mockReturnValue({});
    useLinghuiNodeEditorApiMock.mockReturnValue({ onRunNode: vi.fn() });
    useLinghuiNodeMutationMock.mockReturnValue({ updateNodeData: vi.fn() });
    useStoreMock.mockImplementation((selector: (state: { edges: unknown[]; nodes: unknown[]; connection?: unknown }) => unknown) => (
      selector({ edges: [], nodes: [], connection: { inProgress: false } })
    ));
  });

  it('empty state uses LibTV video composition wording', () => {
    renderVideoClipNode();

    expect(screen.getByText('空空如也，请连接多个视频节点后操作')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /打开视频合成/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /合成视频/ })).toBeDisabled();
  });

  it('one video clip keeps compose disabled with the LibTV insufficient-input hint', () => {
    renderVideoClipNode(createVideoClipNodeData({
      clips: [
        { id: 'clip-1', kind: 'video', source: '/tmp/a.mp4', label: '片段 A', durationSec: 2 },
      ],
    }));

    const composeButton = screen.getByRole('button', { name: /合成视频/ });
    expect(composeButton).toBeDisabled();
    expect(composeButton).toHaveAttribute('title', '请连接2个及以上的视频/音频后操作');
  });

  it('result state shows video preview and floating open composition action', () => {
    const runState: LinghuiNodeRunState = {
      status: 'succeeded',
      result: {
        kind: 'video',
        primary: {
          kind: 'video',
          source: 'https://cdn.example.com/out.mp4',
          posterSource: 'https://cdn.example.com/out.jpg',
        },
      },
    };
    useNodeRunStateMock.mockReturnValue(runState);

    renderVideoClipNode(createVideoClipNodeData({
      clips: [
        { id: 'clip-1', kind: 'video', source: '/tmp/a.mp4', label: '片段 A', durationSec: 2 },
        { id: 'clip-2', kind: 'video', source: '/tmp/b.mp4', label: '片段 B', durationSec: 3 },
      ],
    }));

    const preview = document.querySelector('video');
    expect(preview).toBeInstanceOf(HTMLVideoElement);
    expect(preview?.getAttribute('src')).toBe('https://cdn.example.com/out.mp4');
    expect(screen.getAllByRole('button', { name: /打开视频合成/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('下载')).toBeInTheDocument();
  });

  it('two visual clips can trigger real composition execution', () => {
    const onRunNode = vi.fn();
    useLinghuiNodeEditorApiMock.mockReturnValue({ onRunNode });
    renderVideoClipNode(createVideoClipNodeData({
      clips: [
        { id: 'clip-1', kind: 'video', source: '/tmp/a.mp4', label: '片段 A', durationSec: 2 },
        { id: 'clip-2', kind: 'image', source: '/tmp/b.png', label: '片段 B', durationSec: 3 },
      ],
    }));

    const composeButton = screen.getByRole('button', { name: /合成视频/ });
    expect(composeButton).not.toBeDisabled();
    fireEvent.click(composeButton);
    expect(onRunNode).toHaveBeenCalledWith('video-clip-1');
  });
});
