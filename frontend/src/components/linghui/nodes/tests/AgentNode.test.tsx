import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeData, LinghuiNodeRunState } from '../../../../types/linghui';
import { AgentNode } from '../components/AgentNode';

const {
  useNodeRunStateMock,
  useLinghuiNodeInteractionMock,
  useLinghuiNodeEditorVisibilityMock,
  useLinghuiNodeEditorApiMock,
  useLinghuiNodeInteractionApiMock,
  useLinghuiNodeMutationMock,
} = vi.hoisted(() => ({
  useNodeRunStateMock: vi.fn(),
  useLinghuiNodeInteractionMock: vi.fn(),
  useLinghuiNodeEditorVisibilityMock: vi.fn(),
  useLinghuiNodeEditorApiMock: vi.fn(),
  useLinghuiNodeInteractionApiMock: vi.fn(),
  useLinghuiNodeMutationMock: vi.fn(),
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
  useLinghuiNodeEditorVisibility: (...args: unknown[]) => useLinghuiNodeEditorVisibilityMock(...args),
  useLinghuiNodeEditorApi: () => useLinghuiNodeEditorApiMock(),
  useLinghuiNodeInteractionApi: () => useLinghuiNodeInteractionApiMock(),
  useLinghuiNodeMutation: () => useLinghuiNodeMutationMock(),
}));

vi.mock('../../editors/components/LinghuiNodeEditor', () => ({
  LinghuiNodeEditor: () => <div data-testid="agent-node-editor" />,
}));

vi.mock('../components/EditableCompactNodeLabel', () => ({
  EditableCompactNodeLabel: ({ label, fallbackLabel }: { label: string; fallbackLabel?: string }) => (
    <span>{label || fallbackLabel}</span>
  ),
}));

function createAgentNodeData(overrides: Partial<LinghuiNodeData['properties']> = {}): LinghuiNodeData {
  return {
    linghuiType: 'linghui/agent',
    label: 'Agent 节点',
    accent: '#8b5cf6',
    background: '#0f1720',
    active: true,
    inputs: [{ name: '上下文', dataType: 'text' }],
    outputs: [{ name: '输出', dataType: 'text' }],
    properties: {
      prompt: '',
      systemPrompt: '',
      llmSelection: '',
      enabledTools: [],
      maxIterations: 6,
      ...overrides,
    },
  };
}

function renderAgentNode(data = createAgentNodeData()) {
  return render(
    <AgentNode
      {...({
        id: 'agent-node-1',
        data,
        selected: false,
        dragging: false,
        zIndex: 1,
        xPos: 0,
        yPos: 0,
        type: 'linghui-agent',
        isConnectable: true,
      } as any)}
    />,
  );
}

describe('AgentNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNodeRunStateMock.mockReturnValue(undefined);
    useLinghuiNodeInteractionMock.mockReturnValue({});
    useLinghuiNodeEditorVisibilityMock.mockReturnValue(false);
    useLinghuiNodeEditorApiMock.mockReturnValue({ onRunNode: vi.fn() });
    useLinghuiNodeInteractionApiMock.mockReturnValue({ openNodeEditor: vi.fn() });
    useLinghuiNodeMutationMock.mockReturnValue({ updateNodeData: vi.fn() });
  });

  it('renders LibTV-style in-node preset actions and run control', () => {
    renderAgentNode(createAgentNodeData({ prompt: '分析这组分镜' }));

    expect(screen.getByLabelText('Agent 任务模板')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '执行 Agent' })).not.toBeDisabled();
    expect(screen.getByText('素材分析')).toBeInTheDocument();
    expect(screen.getByText('生成方案')).toBeInTheDocument();
  });

  it('runs the current Agent node from the compact node body', () => {
    const onRunNode = vi.fn();
    useLinghuiNodeEditorApiMock.mockReturnValue({ onRunNode });
    renderAgentNode(createAgentNodeData({ prompt: '检查提示词' }));

    fireEvent.click(screen.getByRole('button', { name: '执行 Agent' }));

    expect(onRunNode).toHaveBeenCalledWith('agent-node-1');
  });

  it('applies prompt presets without marking the node stale', () => {
    const updateNodeData = vi.fn();
    useLinghuiNodeMutationMock.mockReturnValue({ updateNodeData });
    const data = createAgentNodeData({ prompt: '补充要求', systemPrompt: '保持中文输出' });
    renderAgentNode(data);

    fireEvent.click(screen.getByRole('button', { name: /素材分析/ }));

    expect(updateNodeData).toHaveBeenCalledWith('agent-node-1', expect.any(Function), { markStale: false });
    const updater = updateNodeData.mock.calls[0][1] as (prev: LinghuiNodeData) => LinghuiNodeData;
    const next = updater(data);
    expect(String(next.properties.prompt)).toContain('分析我引用的素材');
    expect(String(next.properties.prompt)).toContain('用户补充');
    expect(String(next.properties.systemPrompt)).toContain('灵绘素材分析助手');
    expect(next.properties.maxIterations).toBe(4);
  });

  it('shows running state text from node result stream', () => {
    const runState: LinghuiNodeRunState = {
      status: 'running',
      progress: 35,
      result: {
        kind: 'text',
        text: '正在分析素材与分镜关系',
      },
    };
    useNodeRunStateMock.mockReturnValue(runState);

    renderAgentNode(createAgentNodeData({ prompt: '分析素材' }));

    expect(screen.getByText(/Agent 推理中/)).toBeInTheDocument();
    expect(screen.getByText(/正在分析素材与分镜关系/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '执行 Agent' })).toBeDisabled();
  });
});
