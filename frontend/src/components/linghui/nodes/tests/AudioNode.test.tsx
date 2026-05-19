import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeData } from '../../../../types/linghui';
import { AudioNode } from '../components/AudioNode';

const {
  useNodeRunStateMock,
  useLinghuiNodeInteractionMock,
  useLinghuiNodeEditorVisibilityMock,
  useLinghuiNodeEditorApiMock,
  useStoreMock,
} = vi.hoisted(() => ({
  useNodeRunStateMock: vi.fn(),
  useLinghuiNodeInteractionMock: vi.fn(),
  useLinghuiNodeEditorVisibilityMock: vi.fn(),
  useLinghuiNodeEditorApiMock: vi.fn(),
  useStoreMock: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="handle" />,
  Position: {
    Left: 'left',
    Right: 'right',
  },
  useStore: (selector: (state: { edges: unknown[]; connection?: unknown }) => unknown) => (
    useStoreMock(selector)
  ),
}));

vi.mock('../state/LinghuiNodeRunsContext', () => ({
  useNodeRunState: (...args: unknown[]) => useNodeRunStateMock(...args),
  useLinghuiNodeInteraction: (...args: unknown[]) => useLinghuiNodeInteractionMock(...args),
  useLinghuiNodeEditorVisibility: (...args: unknown[]) => useLinghuiNodeEditorVisibilityMock(...args),
  useLinghuiNodeEditorApi: () => useLinghuiNodeEditorApiMock(),
  useLinghuiNodeMutation: () => ({
    clearNodeRunState: vi.fn(),
    updateNodeData: vi.fn(),
  }),
}));

vi.mock('../../editors/components/LinghuiNodeEditor', () => ({
  LinghuiNodeEditor: () => <div data-testid="audio-node-editor" />,
}));

vi.mock('../components/EditableCompactNodeLabel', () => ({
  EditableCompactNodeLabel: ({ label, fallbackLabel }: { label: string; fallbackLabel?: string }) => (
    <span>{label || fallbackLabel}</span>
  ),
}));

function createAudioNodeData(overrides: Partial<LinghuiNodeData['properties']> = {}): LinghuiNodeData {
  return {
    linghuiType: 'linghui/audio',
    label: '音频节点',
    accent: '#f59e0b',
    background: '#0f1720',
    active: true,
    inputs: [{ name: '文本', dataType: 'text' }],
    outputs: [{ name: '输出', dataType: 'audio' }],
    properties: {
      source: '',
      prompt: '',
      ttsSelection: '',
      voiceId: '',
      mode: 'generate',
      ...overrides,
    },
  };
}

function renderAudioNode(data = createAudioNodeData(), selected = false) {
  return render(
    <AudioNode
      {...({
        id: 'audio-node-1',
        data,
        selected,
        dragging: false,
        zIndex: 1,
        xPos: 0,
        yPos: 0,
        type: 'linghui-audio',
        isConnectable: true,
      } as any)}
    />
  );
}

describe('AudioNode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    useNodeRunStateMock.mockReturnValue(undefined);
    useLinghuiNodeInteractionMock.mockReturnValue({});
    useLinghuiNodeEditorVisibilityMock.mockReturnValue(false);
    useLinghuiNodeEditorApiMock.mockReturnValue({ workspaceId: null, onApplyAudioEmptyAction: vi.fn() });
    useStoreMock.mockImplementation((selector: (state: { edges: unknown[]; connection?: unknown }) => unknown) => (
      selector({ edges: [], connection: { inProgress: false } })
    ));
  });

  it('空生成态显示 LibTV 音频 EmptyState 和上传浮按钮', () => {
    const { container } = renderAudioNode();

    expect(container.querySelector('[data-audio-view="empty_generate"]')).toBeTruthy();
    expect(screen.getByText('音频生视频')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /上传/ })).toBeInTheDocument();
  });

  it('有上游且无音频时进入 pending 态，不显示等待文案', () => {
    useStoreMock.mockImplementation((selector: (state: { edges: unknown[]; connection?: unknown }) => unknown) => (
      selector({ edges: [{ source: 'text-1', target: 'audio-node-1' }], connection: { inProgress: false } })
    ));
    const { container } = renderAudioNode();

    expect(container.querySelector('[data-audio-view="pending"]')).toBeTruthy();
    expect(screen.queryByText(/等待上游/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /上传/ })).toBeInTheDocument();
  });

  it('资源态渲染音频播放器并隐藏 target handle', () => {
    renderAudioNode(createAudioNodeData({
      mode: 'import',
      source: 'https://cdn.example.com/audio.mp3',
    }));

    expect(document.querySelector('audio')).toBeInstanceOf(HTMLAudioElement);
    expect(screen.getAllByTestId('handle')).toHaveLength(1);
    expect(screen.getByText('音频')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换播放速度' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '下载音频' })).toHaveAttribute('download', 'audio.mp3');
  });

  it('资源态速度按钮按 LibTV 节奏在 1x / 1.5x / 2x 间切换', () => {
    renderAudioNode(createAudioNodeData({
      mode: 'import',
      source: 'https://cdn.example.com/audio.mp3',
    }));

    const speedButton = screen.getByRole('button', { name: '切换播放速度' });
    expect(speedButton).toHaveTextContent('1x');

    fireEvent.click(speedButton);
    expect(speedButton).toHaveTextContent('1.5x');

    fireEvent.click(speedButton);
    expect(speedButton).toHaveTextContent('2x');
  });

  it('选中资源态音频时可从节点本体触发音频生视频', () => {
    const onApplyAudioEmptyAction = vi.fn();
    useLinghuiNodeEditorApiMock.mockReturnValue({ workspaceId: null, onApplyAudioEmptyAction });

    renderAudioNode(createAudioNodeData({
      mode: 'import',
      source: 'https://cdn.example.com/audio.mp3',
    }), true);

    fireEvent.click(screen.getByRole('button', { name: '音频生视频' }));

    expect(onApplyAudioEmptyAction).toHaveBeenCalledWith('audio-node-1', 'audio-to-video');
  });
});
