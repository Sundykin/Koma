import React from 'react';
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeData, LinghuiNodeRunState } from '../../../../types/linghui';
import { ImageNodeEditor } from '../components/ImageNodeEditor';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

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

vi.mock('../components/LinghuiMultiAngle3DViewport', () => ({
  LinghuiMultiAngle3DViewport: () => <div data-testid="multi-angle-viewport" />,
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
    activeTool?: 'focus' | 'mark' | 'multi-angle' | 'outpaint' | 'relight' | 'repaint' | 'crop' | 'remove-bg' | 'erase' | null;
    nodeRun?: LinghuiNodeRunState;
    onToolChange?: (tool: any) => void;
    onExecuteMultiAngle?: (options?: any) => void;
    onApplyImageToolPreset?: (preset: any) => void;
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
        onExecuteMultiAngle={options?.onExecuteMultiAngle}
        onApplyImageToolPreset={options?.onApplyImageToolPreset}
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

  it('图片比例参数菜单不再混入打光，镜头参数通过独立菜单更新', async () => {
    const baseNode = createImageNodeData({
      cinematic: {
        lighting: 'rembrandt',
        focalLength: 'wide-24mm',
        aperture: 'shallow-f14',
      },
    });

    renderEditor(baseNode);

    const paramsTrigger = await screen.findByRole('button', { name: '3:4 · auto · 1张' });
    expect(paramsTrigger).toBeInTheDocument();
    fireEvent.click(paramsTrigger);

    expect(await screen.findByText('比例')).toBeInTheDocument();
    expect(screen.queryByText('打光')).not.toBeInTheDocument();
    expect(screen.queryByText('焦距 / 镜头')).not.toBeInTheDocument();
    expect(screen.queryByText('景深 / 光圈')).not.toBeInTheDocument();

    updateNodeDataMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /镜头 · 广角 24mm · 浅景深 f\/1\.4/ }));

    expect(await screen.findByText('焦距 / 镜头')).toBeInTheDocument();
    expect(screen.getByText('光圈 / 景深')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '标头 50mm' }));

    const updater = updateNodeDataMock.mock.calls[0]?.[1];
    expect(typeof updater).toBe('function');
    const nextNode = updater(baseNode);
    expect(nextNode.properties.cinematic).toEqual(expect.objectContaining({
      lighting: 'rembrandt',
      focalLength: 'standard-50mm',
      aperture: 'shallow-f14',
    }));
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

  it('打光工具会显示可视化面板并按选中风格派生执行', async () => {
    const onApplyImageToolPreset = vi.fn();
    const onToolChange = vi.fn();
    renderEditor(createImageNodeData({
      source: 'https://cdn.example.com/original.png',
      primaryResultSource: 'https://cdn.example.com/original.png',
      aspectRatio: '1:1',
      resolution: 'auto',
      batchCount: 2,
    }), {
      activeTool: 'relight',
      onApplyImageToolPreset,
      onToolChange,
    });

    expect(await screen.findByRole('dialog', { name: '打光效果' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /伦勃朗光/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成' }));

    expect(onApplyImageToolPreset).toHaveBeenCalledWith(expect.objectContaining({
      label: '伦勃朗光',
      promptSnippet: expect.stringContaining('伦勃朗光'),
      properties: expect.objectContaining({
        aspectRatio: '1:1',
        resolution: 'auto',
        batchCount: 2,
      }),
    }));
    expect(onToolChange).toHaveBeenCalledWith(null);
  });

  it('打光蓝色逆光会提交 LibTV 结构化参数并渲染光球预览', async () => {
    const onApplyImageToolPreset = vi.fn();
    renderEditor(createImageNodeData({
      source: 'https://cdn.example.com/original.png',
      primaryResultSource: 'https://cdn.example.com/original.png',
    }), {
      activeTool: 'relight',
      onApplyImageToolPreset,
    });

    expect(await screen.findByLabelText('打光光球预览')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /蓝色逆光/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成' }));

    expect(onApplyImageToolPreset).toHaveBeenCalledWith(expect.objectContaining({
      label: '蓝色逆光',
      promptSnippet: '蓝色逆光',
      properties: expect.objectContaining({
        relight: expect.objectContaining({
          presetId: '2',
          direction: 'low-back',
          brightness: 50,
          lightColor: '#2d34fa',
          rimLight: false,
          smartMode: true,
          prompt: '',
        }),
      }),
    }));
  });

  it('多角度鱼眼 preset 会写入 LibTV 字段并提交新配置', async () => {
    const onExecuteMultiAngle = vi.fn();
    const onToolChange = vi.fn();
    const baseNode = createImageNodeData({
      source: 'https://cdn.example.com/original.png',
      primaryResultSource: 'https://cdn.example.com/original.png',
      multiAngle: {
        enabled: true,
        mode: 'object',
        rotation: 0,
        tilt: 0,
        scale: 50,
        isWideAngle: false,
        presetKey: 'custom',
        prompt: '',
        promptEnabled: false,
        azimuth: 0,
        elevation: 0,
        distance: 1,
        ttiSelection: 'image-main::model-1',
        promptProtocol: 'sks-camera-v1',
        endpointPath: '/v1/images/multi-angle',
      },
    });
    const view = renderEditor(baseNode, {
      activeTool: 'multi-angle',
      onExecuteMultiAngle,
      onToolChange,
    });

    expect(await screen.findByRole('dialog', { name: '多角度编辑器' })).toBeInTheDocument();
    expect(screen.queryByText(/⚡|积分|消耗/)).not.toBeInTheDocument();
    updateNodeDataMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '鱼眼视角' }));

    const updater = updateNodeDataMock.mock.calls[0]?.[1];
    expect(typeof updater).toBe('function');
    const nextNode = updater(baseNode);
    expect(nextNode.properties.multiAngle).toEqual(expect.objectContaining({
      presetKey: 'fisheye',
      rotation: 0,
      tilt: 30,
      scale: 100,
      isWideAngle: true,
      promptEnabled: true,
      prompt: '极度特写镜头，广角镜头，边缘带有鱼眼畸变效果',
    }));

    view.rerender(
      <App>
        <ImageNodeEditor
          nodeId="image-node-1"
          nodeData={nextNode}
          referenceImages={[]}
          promptReferences={[]}
          activeTool="multi-angle"
          onToolChange={onToolChange}
          onExecuteMultiAngle={onExecuteMultiAngle}
          onRun={vi.fn()}
        />
      </App>,
    );
    fireEvent.click(screen.getByRole('button', { name: '生成' }));

    expect(onExecuteMultiAngle).toHaveBeenCalledWith(expect.objectContaining({
      ttiSelection: 'image-main::model-1',
      label: '鱼眼视角',
      multiAngle: expect.objectContaining({
        presetKey: 'fisheye',
        rotation: 0,
        tilt: 30,
        scale: 100,
        isWideAngle: true,
        promptEnabled: true,
      }),
    }));
    expect(onToolChange).toHaveBeenCalledWith(null);
  });

  it('图片工具面板按 LibTV 方式渲染在编辑器面板内', async () => {
    renderEditor(createImageNodeData({
      source: 'https://cdn.example.com/original.png',
      primaryResultSource: 'https://cdn.example.com/original.png',
    }), {
      activeTool: 'relight',
    });

    const dialog = await screen.findByRole('dialog', { name: '打光效果' });

    expect(dialog.closest('.linghuiEditorPanel')).not.toBeNull();
    expect(document.body.querySelector('.linghuiImageToolFloatingPanel')).toBeNull();
    expect(dialog.querySelector('.linghuiImageLibTVPanelFooter')).toBeInTheDocument();
    expect(screen.queryByText(/⚡|积分|消耗/)).not.toBeInTheDocument();
  });

  it('重绘工具会显示可视化面板并合并用户描述派生执行', async () => {
    const onApplyImageToolPreset = vi.fn();
    const onToolChange = vi.fn();
    renderEditor(createImageNodeData({
      source: 'https://cdn.example.com/original.png',
      primaryResultSource: 'https://cdn.example.com/original.png',
      aspectRatio: '3:4',
      resolution: 'auto',
      batchCount: 1,
    }), {
      activeTool: 'repaint',
      onApplyImageToolPreset,
      onToolChange,
    });

    expect(await screen.findByRole('dialog', { name: '重绘' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /替换背景/ }));
    fireEvent.change(screen.getByPlaceholderText('补充要修复、替换或迁移的具体方向'), {
      target: { value: '换成雨夜街景，保留人物姿势。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成' }));

    expect(onApplyImageToolPreset).toHaveBeenCalledWith(expect.objectContaining({
      label: '替换背景',
      promptSnippet: expect.stringContaining('换成雨夜街景'),
      properties: expect.objectContaining({
        aspectRatio: '3:4',
        resolution: 'auto',
        batchCount: 1,
      }),
    }));
    expect(onToolChange).toHaveBeenCalledWith(null);
  });

  it('扩图工具会显示预览面板并按选中方向派生执行', async () => {
    const onApplyImageToolPreset = vi.fn();
    const onToolChange = vi.fn();
    renderEditor(createImageNodeData({
      source: 'https://cdn.example.com/original.png',
      primaryResultSource: 'https://cdn.example.com/original.png',
      aspectRatio: '1:1',
      resolution: 'auto',
      batchCount: 1,
    }), {
      activeTool: 'outpaint',
      onApplyImageToolPreset,
      onToolChange,
    });

    expect(await screen.findByRole('dialog', { name: '扩图' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /竖向扩图/ }));
    fireEvent.click(screen.getByRole('button', { name: '4K' }));
    fireEvent.click(screen.getByRole('button', { name: '生成' }));

    expect(onApplyImageToolPreset).toHaveBeenCalledWith(expect.objectContaining({
      label: '竖向扩图',
      promptSnippet: expect.stringContaining('竖向扩图'),
      properties: expect.objectContaining({
        aspectRatio: '9:16',
        resolution: '4K',
        batchCount: 1,
      }),
    }));
    expect(onToolChange).toHaveBeenCalledWith(null);
  });

  it('裁剪工具提供锚点选择并调用本地裁剪入口', async () => {
    const onExecuteImageCrop = vi.fn();
    const onToolChange = vi.fn();
    useLinghuiNodeEditorApiMock.mockReturnValue({
      executionQueue: null,
      onExecuteImageCrop,
    });
    renderEditor(createImageNodeData({
      source: 'https://cdn.example.com/original.png',
      primaryResultSource: 'https://cdn.example.com/original.png',
      aspectRatio: '3:4',
    }), {
      activeTool: 'crop',
      onToolChange,
    });

    expect(await screen.findByRole('dialog', { name: '裁剪' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '裁剪锚点 左下' }));
    fireEvent.click(screen.getByRole('button', { name: /横版裁剪/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成' }));

    expect(onExecuteImageCrop).toHaveBeenCalledWith('image-node-1', {
      aspectRatio: '16:9',
      anchorX: 0,
      anchorY: 1,
      label: '横版裁剪',
    });
    expect(onToolChange).toHaveBeenCalledWith(null);
  });

  it('抠图工具明确展示非本地透明抠图能力说明', async () => {
    const onApplyImageToolPreset = vi.fn();
    renderEditor(createImageNodeData({
      source: 'https://cdn.example.com/original.png',
      primaryResultSource: 'https://cdn.example.com/original.png',
    }), {
      activeTool: 'remove-bg',
      onApplyImageToolPreset,
    });

    expect(await screen.findByRole('dialog', { name: '抠图' })).toBeInTheDocument();
    expect(screen.getByText(/当前未接入本地抠图模型/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '生成' }));

    expect(onApplyImageToolPreset).toHaveBeenCalledWith(expect.objectContaining({
      label: '主体抠图',
      promptSnippet: expect.stringContaining('主体抠图'),
    }));
  });
});
