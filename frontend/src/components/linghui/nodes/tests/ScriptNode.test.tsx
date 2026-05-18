import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeData, LinghuiNodeRunState } from '../../../../types/linghui';
import { ScriptNode } from '../components/ScriptNode';

const {
  useNodeRunStateMock,
  useLinghuiNodeInteractionMock,
  useLinghuiNodeInteractionApiMock,
  useLinghuiNodeEditorApiMock,
  useLinghuiNodeEditorVisibilityMock,
} = vi.hoisted(() => ({
  useNodeRunStateMock: vi.fn(),
  useLinghuiNodeInteractionMock: vi.fn(),
  useLinghuiNodeInteractionApiMock: vi.fn(),
  useLinghuiNodeEditorApiMock: vi.fn(),
  useLinghuiNodeEditorVisibilityMock: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="handle" />,
  Position: {
    Left: 'left',
    Right: 'right',
  },
}));

vi.mock('../state/LinghuiNodeRunsContext', () => ({
  useNodeRunState: (...args: unknown[]) => useNodeRunStateMock(...args),
  useLinghuiNodeInteraction: (...args: unknown[]) => useLinghuiNodeInteractionMock(...args),
  useLinghuiNodeInteractionApi: () => useLinghuiNodeInteractionApiMock(),
  useLinghuiNodeEditorApi: () => useLinghuiNodeEditorApiMock(),
  useLinghuiNodeEditorVisibility: (...args: unknown[]) => useLinghuiNodeEditorVisibilityMock(...args),
}));

vi.mock('../../editors/components/LinghuiNodeEditor', () => ({
  LinghuiNodeEditor: () => <div data-testid="script-node-editor" />,
}));

vi.mock('../components/EditableCompactNodeLabel', () => ({
  EditableCompactNodeLabel: ({ label, fallbackLabel }: { label: string; fallbackLabel?: string }) => (
    <span>{label || fallbackLabel}</span>
  ),
}));

vi.mock('../../../../services/fileSystemPort', () => ({
  toFileSystemDisplayUrl: (source?: string) => source || '',
}));

function createScriptNodeData(): LinghuiNodeData {
  return {
    linghuiType: 'linghui/storyboard',
    label: '故事板',
    accent: '#a855f7',
    background: '#0f1720',
    active: true,
    inputs: [{ name: '输入', dataType: 'text' }],
    outputs: [{ name: '输出', dataType: 'storyboard' }],
    properties: {
      prompt: '暴雨夜相遇',
      llmSelection: '',
      scene: 'plot_deduction_nine_grid',
      viewMode: 'cards',
      targetShotCount: 9,
    },
  };
}

function renderScriptNode(data = createScriptNodeData()) {
  return render(
    <ScriptNode
      {...({
        id: 'storyboard-node-1',
        data,
        selected: true,
        dragging: false,
        zIndex: 1,
        xPos: 0,
        yPos: 0,
        type: 'linghui-storyboard',
        isConnectable: true,
      } as any)}
    />,
  );
}

describe('ScriptNode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    useLinghuiNodeInteractionMock.mockReturnValue({});
    useLinghuiNodeInteractionApiMock.mockReturnValue({ openNodeEditor: vi.fn() });
    useLinghuiNodeEditorApiMock.mockReturnValue({
      onGenerateScriptImages: vi.fn(),
      onGenerateScriptVideos: vi.fn(),
    });
    useLinghuiNodeEditorVisibilityMock.mockReturnValue(false);
    useNodeRunStateMock.mockReturnValue({
      status: 'succeeded',
      progress: 100,
      result: {
        kind: 'storyboard',
        text: '',
        shots: [{
          id: 'shot-1',
          title: '开场',
          description: '主角推门进入。',
          plotDescription: '主角推门进入。',
          visualDescription: '逆光中景，雨夜门口。',
          imageGenerationPrompt: '电影感逆光室内，中景构图。',
          videoMotionPrompt: '镜头从门把手推到主角侧脸。',
          durationSec: 10,
        }],
      },
    } satisfies LinghuiNodeRunState);
  });

  it('renders storyboard content inside the node body and switches to table view', () => {
    renderScriptNode();

    expect(screen.getByText('1镜头')).toBeInTheDocument();
    expect(screen.getByText('开场')).toBeInTheDocument();
    expect(screen.getAllByText('主角推门进入。').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '表格视图' }));

    expect(screen.getByRole('columnheader', { name: '剧情描述' })).toBeInTheDocument();
    expect(screen.getByText('逆光中景，雨夜门口。')).toBeInTheDocument();
    expect(screen.getByText('电影感逆光室内，中景构图。')).toBeInTheDocument();
    expect(screen.getByText('镜头从门把手推到主角侧脸。')).toBeInTheDocument();
  });

  it('runs image/video derivation from node inline actions with selected storyboard rows', () => {
    const editorApi = {
      onGenerateScriptImages: vi.fn(),
      onGenerateScriptVideos: vi.fn(),
    };
    useLinghuiNodeEditorApiMock.mockReturnValue(editorApi);
    renderScriptNode();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('已选 1/1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /生成分镜/ }));
    fireEvent.click(screen.getByRole('button', { name: /生成视频组/ }));

    expect(editorApi.onGenerateScriptImages).toHaveBeenCalledWith('storyboard-node-1', [expect.objectContaining({
      imageGenerationPrompt: '电影感逆光室内，中景构图。',
    })]);
    expect(editorApi.onGenerateScriptVideos).toHaveBeenCalledWith('storyboard-node-1', [expect.objectContaining({
      videoMotionPrompt: '镜头从门把手推到主角侧脸。',
    })]);
  });

  it('keeps the aggregated generator hidden until a storyboard row is selected', () => {
    renderScriptNode();

    expect(screen.queryByText('已选 1/1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('已选 1/1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭分镜生成器' }));
    expect(screen.queryByText('已选 1/1')).not.toBeInTheDocument();
  });
});
