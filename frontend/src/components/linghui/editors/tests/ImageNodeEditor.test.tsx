import React from 'react';
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeData, LinghuiNodeRunState } from '../../../../types/linghui';
import { ImageNodeEditor } from '../components/ImageNodeEditor';

const {
  loadSettingsMock,
  listConfiguredModelSelectOptionsMock,
  clearNodeRunStateMock,
  updateNodeDataMock,
  useLinghuiNodeEditorApiMock,
} = vi.hoisted(() => ({
  loadSettingsMock: vi.fn(),
  listConfiguredModelSelectOptionsMock: vi.fn(),
  clearNodeRunStateMock: vi.fn(),
  updateNodeDataMock: vi.fn(),
  useLinghuiNodeEditorApiMock: vi.fn(),
}));

vi.mock('../../../../store/settings/core', () => ({
  loadSettings: (...args: unknown[]) => loadSettingsMock(...args),
}));

vi.mock('../../../../providers/channel/resolver', () => ({
  listConfiguredModelSelectOptions: (...args: unknown[]) => listConfiguredModelSelectOptionsMock(...args),
}));

vi.mock('../components/LinghuiPromptEditor', () => ({
  LinghuiPromptEditor: ({
    value,
    placeholder,
  }: {
    value: string;
    placeholder?: string;
  }) => (
    <textarea
      aria-label="提示词输入"
      defaultValue={value}
      placeholder={placeholder}
      readOnly
    />
  ),
}));

vi.mock('../components/LinghuiMultiAngleModal', () => ({
  LinghuiMultiAngleModal: () => null,
}));

vi.mock('../../nodes/state/LinghuiNodeRunsContext', () => ({
  useLinghuiNodeMutation: () => ({
    clearNodeRunState: clearNodeRunStateMock,
    updateNodeData: updateNodeDataMock,
  }),
  useLinghuiNodeEditorApi: () => useLinghuiNodeEditorApiMock(),
}));

function createImageNodeData(overrides?: Partial<LinghuiNodeData['properties']>): LinghuiNodeData {
  return {
    linghuiType: 'linghui/image',
    label: '图片节点',
    accent: '#4ade80',
    background: '#0f1720',
    active: true,
    inputs: [
      { name: '图片', dataType: 'image' },
      { name: '文本', dataType: 'text' },
    ],
    outputs: [{ name: '输出', dataType: 'image' }],
    properties: {
      mode: 'generate',
      source: '',
      prompt: '主提示词',
      ttiSelection: 'image-main::model-1',
      aspectRatio: '3:4',
      resolution: 'auto',
      batchCount: 1,
      ...overrides,
    },
  };
}

function renderEditor(
  nodeData: LinghuiNodeData,
  options?: {
    activeTool?: 'focus' | 'mark' | 'multi-angle' | null;
    nodeRun?: LinghuiNodeRunState;
    onToolChange?: (tool: any) => void;
    onRun?: () => void;
  },
) {
  return render(
    <App>
      <ImageNodeEditor
        nodeId="image-node-1"
        nodeData={nodeData}
        nodeRun={options?.nodeRun}
        referenceImages={[]}
        promptReferences={[]}
        activeTool={options?.activeTool ?? null}
        onToolChange={options?.onToolChange ?? vi.fn()}
        onRun={options?.onRun ?? vi.fn()}
      />
    </App>,
  );
}

describe('ImageNodeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSettingsMock.mockResolvedValue({});
    listConfiguredModelSelectOptionsMock.mockReturnValue([
      {
        value: 'image-main::model-1',
        label: 'Flux Pro',
        channelLabel: '灵绘图像',
        modelLabel: 'flux-pro',
      },
    ]);
    useLinghuiNodeEditorApiMock.mockReturnValue({ executionQueue: null });
  });

  it('命中当前执行队列时会禁用生成按钮、显示等待文案并阻止重复点击', async () => {
    const onRun = vi.fn();
    useLinghuiNodeEditorApiMock.mockReturnValue({
      executionQueue: {
        status: 'running',
        total: 1,
        targetNodeIds: ['image-node-1'],
        queuedNodeIds: ['image-node-1'],
        runningNodeIds: [],
        completedNodeIds: [],
        failedNodeIds: [],
        canceledNodeIds: [],
      },
    });

    renderEditor(createImageNodeData(), { onRun });

    const button = await screen.findByRole('button', { name: /等待图片生成/ });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('ant-btn-loading');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getAllByText('等待图片生成…').length).toBeGreaterThan(0);
  });

  it('连续双击生成按钮只触发一次生图提交', async () => {
    const onRun = vi.fn();
    renderEditor(createImageNodeData(), { onRun });

    const button = await screen.findByRole('button', { name: '生成' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('运行中时会把图片进度文案显示到生成按钮上并保持 loading', async () => {
    useLinghuiNodeEditorApiMock.mockReturnValue({
      executionQueue: {
        status: 'running',
        total: 1,
        targetNodeIds: ['image-node-1'],
        queuedNodeIds: [],
        runningNodeIds: ['image-node-1'],
        completedNodeIds: [],
        failedNodeIds: [],
        canceledNodeIds: [],
      },
    });

    renderEditor(createImageNodeData({ batchCount: 4 }), {
      nodeRun: {
        status: 'running',
        progress: 42,
        message: '图片生成中',
      },
    });

    const button = await screen.findByRole('button', { name: /图片生成中 42%/ });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('ant-btn-loading');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '3:4 · auto · 4张' })).toBeInTheDocument();
    });
  });

  it('聚焦工具会显示选区面板并把标记区域写入节点属性', async () => {
    renderEditor(createImageNodeData({
      source: 'https://cdn.example.com/original.png',
      primaryResultSource: 'https://cdn.example.com/original.png',
      focusRegion: {
        enabled: true,
        x: 0.2,
        y: 0.15,
        width: 0.3,
        height: 0.25,
        source: 'https://cdn.example.com/original.png',
      },
    }), {
      activeTool: 'focus',
    });

    expect(await screen.findByText('红框区域会作为下一次局部补全重点')).toBeInTheDocument();
    expect(screen.getByText('30% × 25%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '脸部' }));

    expect(updateNodeDataMock).toHaveBeenCalledTimes(1);
    const updater = updateNodeDataMock.mock.calls[0]?.[1];
    expect(typeof updater).toBe('function');
    const next = updater(createImageNodeData({
      source: 'https://cdn.example.com/original.png',
    }));
    expect(next.properties).toEqual(expect.objectContaining({
      focusRegion: expect.objectContaining({
        enabled: true,
        x: 0.32,
        y: 0.12,
        width: 0.36,
        height: 0.32,
        source: 'https://cdn.example.com/original.png',
      }),
    }));
  });

  it('标记工具会在图片点击位置写入归一化焦点点位', async () => {
    renderEditor(createImageNodeData({
      source: 'https://cdn.example.com/original.png',
      primaryResultSource: 'https://cdn.example.com/original.png',
    }), {
      activeTool: 'mark',
    });

    const markStage = await screen.findByRole('button', { name: '添加标记点' });
    Object.defineProperty(markStage, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 10,
        top: 20,
        width: 200,
        height: 100,
        right: 210,
        bottom: 120,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(markStage, { clientX: 60, clientY: 45 });

    expect(updateNodeDataMock).toHaveBeenCalledTimes(1);
    const updater = updateNodeDataMock.mock.calls[0]?.[1];
    expect(typeof updater).toBe('function');
    const next = updater(createImageNodeData({
      source: 'https://cdn.example.com/original.png',
    }));
    expect(next.properties.markPoints).toHaveLength(1);
    expect(next.properties.markPoints?.[0]).toEqual(expect.objectContaining({
      enabled: true,
      x: 0.25,
      y: 0.25,
      source: 'https://cdn.example.com/original.png',
      label: '标记 1',
    }));
  });
});
