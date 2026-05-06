import React from 'react';
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeData, LinghuiNodeRunState } from '../../../../types/linghui';
import { VideoNodeEditor } from '../components/VideoNodeEditor';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const {
  loadSettingsMock,
  listConfiguredModelSelectOptionsMock,
  getDefaultMediaSelectionMock,
  serializeMediaSelectionMock,
  clearNodeRunStateMock,
  updateNodeDataMock,
  useLinghuiNodeEditorApiMock,
} = vi.hoisted(() => ({
  loadSettingsMock: vi.fn(),
  listConfiguredModelSelectOptionsMock: vi.fn(),
  getDefaultMediaSelectionMock: vi.fn(),
  serializeMediaSelectionMock: vi.fn(),
  clearNodeRunStateMock: vi.fn(),
  updateNodeDataMock: vi.fn(),
  useLinghuiNodeEditorApiMock: vi.fn(),
}));

vi.mock('../../../../store/settings/core', () => ({
  loadSettings: (...args: unknown[]) => loadSettingsMock(...args),
}));

vi.mock('../../../../providers/channel/resolver', () => ({
  getDefaultMediaSelection: (...args: unknown[]) => getDefaultMediaSelectionMock(...args),
  listConfiguredModelSelectOptions: (...args: unknown[]) => listConfiguredModelSelectOptionsMock(...args),
  serializeMediaSelection: (...args: unknown[]) => serializeMediaSelectionMock(...args),
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

vi.mock('../../nodes/state/LinghuiNodeRunsContext', () => ({
  useLinghuiNodeMutation: () => ({
    clearNodeRunState: clearNodeRunStateMock,
    updateNodeData: updateNodeDataMock,
  }),
  useLinghuiNodeEditorApi: () => useLinghuiNodeEditorApiMock(),
}));

function createVideoNodeData(overrides?: Partial<LinghuiNodeData['properties']>): LinghuiNodeData {
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
      prompt: '镜头慢慢推进',
      itvSelection: 'vidu-main::viduq3-pro',
      source: '',
      posterSource: '',
      videoCapability: 'video.image-to-video',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: 5,
      ...overrides,
    },
  };
}

function renderEditor(
  nodeData: LinghuiNodeData,
  options?: {
    activeTool?: 'upscale' | 'analyze' | 'compose' | null;
    onToolChange?: (tool: any) => void;
    nodeRun?: LinghuiNodeRunState;
    onRun?: () => void;
  },
) {
  return render(
    <App>
      <VideoNodeEditor
        nodeId="video-node-1"
        nodeData={nodeData}
        nodeRun={options?.nodeRun}
        referenceImages={[]}
        referenceVideos={[]}
        referenceAudios={[]}
        promptReferences={[]}
        activeTool={options?.activeTool ?? null}
        onToolChange={options?.onToolChange ?? vi.fn()}
        onRun={options?.onRun ?? vi.fn()}
      />
    </App>
  );
}

describe('VideoNodeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSettingsMock.mockResolvedValue({});
    listConfiguredModelSelectOptionsMock.mockReturnValue([
      {
        value: 'vidu-main::viduq3-pro',
        label: 'Vidu Q3 Pro',
        channelId: 'vidu-main',
        modelId: 'viduq3-pro',
        providerType: 'vidu',
        channelLabel: 'Vidu',
        modelLabel: 'viduq3-pro',
        capabilities: ['video.image-to-video'],
      },
    ]);
    getDefaultMediaSelectionMock.mockReturnValue(null);
    serializeMediaSelectionMock.mockReturnValue('');
    useLinghuiNodeEditorApiMock.mockReturnValue({ executionQueue: null });
  });

  it('带本地 source 的视频节点直接进入透传态并清空激活工具', async () => {
    const onToolChange = vi.fn();

    renderEditor(
      createVideoNodeData({
        source: '/tmp/imported-cat.mp4',
      }),
      {
        activeTool: 'compose',
        onToolChange,
      },
    );

    await waitFor(() => {
      expect(onToolChange).toHaveBeenCalledWith(null);
    });

    expect(screen.getAllByText('透传输出').length).toBeGreaterThan(0);
    expect(screen.getByText('不进入生成')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '在系统播放器打开' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开所在位置' })).toBeInTheDocument();
    expect(screen.getByText('/tmp/imported-cat.mp4')).toBeInTheDocument();
    expect(screen.queryByText('提示词')).not.toBeInTheDocument();
    expect(screen.queryByText('模型与参数')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '生成' })).not.toBeInTheDocument();
  });

  it('生成态视频节点改成摘要式模型与参数控件且不再渲染结果预览', async () => {
    renderEditor(createVideoNodeData());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Vidu / viduq3-pro' })).toBeInTheDocument();
    });

    expect(screen.getAllByText('图生视频').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '16:9 · 720P · 6s' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成' })).toBeInTheDocument();
    expect(screen.queryByText('提示词')).not.toBeInTheDocument();
    expect(screen.queryByText('模型与参数')).not.toBeInTheDocument();
    expect(screen.queryByText('生成结果')).not.toBeInTheDocument();
  });

  it('命中当前执行队列时会禁用生成按钮并显示等待文案', async () => {
    const onRun = vi.fn();
    useLinghuiNodeEditorApiMock.mockReturnValue({
      executionQueue: {
        status: 'running',
        total: 1,
        targetNodeIds: ['video-node-1'],
        queuedNodeIds: ['video-node-1'],
        runningNodeIds: [],
        completedNodeIds: [],
        failedNodeIds: [],
        canceledNodeIds: [],
      },
    });

    renderEditor(createVideoNodeData(), { onRun });

    const button = await screen.findByRole('button', { name: /等待视频生成/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getAllByText('等待视频生成…').length).toBeGreaterThan(0);
  });

  it('运行中时会把进度文案显示到生成按钮上', async () => {
    useLinghuiNodeEditorApiMock.mockReturnValue({
      executionQueue: {
        status: 'running',
        total: 1,
        targetNodeIds: ['video-node-1'],
        queuedNodeIds: [],
        runningNodeIds: ['video-node-1'],
        completedNodeIds: [],
        failedNodeIds: [],
        canceledNodeIds: [],
      },
    });

    renderEditor(createVideoNodeData(), {
      nodeRun: {
        status: 'running',
        progress: 42,
        message: '视频生成中',
      },
    });

    const button = await screen.findByRole('button', { name: /视频生成中 42%/ });
    expect(button).toBeDisabled();
  });

  it('生成态视频节点即便已有输出结果也只保留摘要和下载动作', async () => {
    render(
      <App>
        <VideoNodeEditor
          nodeId="video-node-1"
          nodeData={createVideoNodeData()}
          nodeRun={{
            status: 'succeeded',
            result: {
              kind: 'video',
              primary: {
                kind: 'video',
                source: 'https://cdn.example.com/video.mp4',
                posterSource: 'https://cdn.example.com/video.jpg',
                label: '风筝镜头',
              },
            },
          }}
          referenceImages={[]}
          referenceVideos={[]}
          referenceAudios={[]}
          promptReferences={[]}
          activeTool={null}
          onToolChange={vi.fn()}
          onRun={vi.fn()}
        />
      </App>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '下载' })).toBeInTheDocument();
    });

    expect(screen.queryByText('生成结果')).not.toBeInTheDocument();
    expect(screen.queryByText('模型与参数')).not.toBeInTheDocument();
    expect(screen.getByText('已有成片')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '在浏览器打开' })).not.toBeInTheDocument();
    expect(screen.queryByText('请外部打开查看')).not.toBeInTheDocument();
  });

  it('只展示当前模型真实支持的视频能力', async () => {
    listConfiguredModelSelectOptionsMock.mockReturnValue([
      {
        value: 'vidu-main::viduq3-pro',
        label: 'Vidu Q3 Pro',
        channelId: 'vidu-main',
        modelId: 'viduq3-pro',
        providerType: 'vidu',
        channelLabel: 'Vidu',
        modelLabel: 'viduq3-pro',
        capabilities: ['video.text-to-video', 'video.start-end-to-video'],
      },
    ]);

    renderEditor(createVideoNodeData({ videoCapability: 'video.text-to-video' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '文生视频' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '首尾帧视频' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '图生视频' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '参考生视频' })).not.toBeInTheDocument();
  });

  it('Grok 渠道只展示 6/12/16/20 时长枚举并把旧 10 秒归一', async () => {
    loadSettingsMock.mockResolvedValue({
      channelConfigs: [
        {
          id: 'grok-channel',
          category: 'itv',
          providerType: 'grok2api-imagine-itv',
        },
      ],
    });
    listConfiguredModelSelectOptionsMock.mockReturnValue([
      {
        value: 'grok-channel::grok-imagine-video',
        label: 'Grok Video',
        channelId: 'grok-channel',
        modelId: 'grok-imagine-video',
        providerType: 'grok2api-imagine-itv',
        channelLabel: 'Koma Grok',
        modelLabel: 'grok-imagine-video',
        capabilities: ['video.image-to-video'],
      },
    ]);

    renderEditor(createVideoNodeData({
      itvSelection: 'grok-channel::grok-imagine-video',
      duration: 10,
    }));

    await waitFor(() => {
      expect(updateNodeDataMock).toHaveBeenCalledWith('video-node-1', expect.any(Function));
    });

    const lastCall = updateNodeDataMock.mock.calls[updateNodeDataMock.mock.calls.length - 1];
    const updater = lastCall?.[1] as (previous: LinghuiNodeData) => LinghuiNodeData;
    expect(updater(createVideoNodeData({ duration: 10 })).properties.duration).toBe(12);

    fireEvent.click(screen.getByRole('button', { name: '16:9 · 720P · 12s' }));
    expect(await screen.findByRole('button', { name: '6s' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '12s' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '16s' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20s' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '10s' })).not.toBeInTheDocument();
  });

  it('Koma 官方即梦渠道使用 4-15 秒范围并保留 5 秒默认', async () => {
    loadSettingsMock.mockResolvedValue({
      channelConfigs: [
        {
          id: 'jimeng-channel',
          category: 'itv',
          providerType: 'koma-suihe-itv',
        },
      ],
    });
    listConfiguredModelSelectOptionsMock.mockReturnValue([
      {
        value: 'jimeng-channel::seedance-2.0',
        label: 'Seedance 2.0',
        channelId: 'jimeng-channel',
        modelId: 'seedance-2.0',
        providerType: 'koma-suihe-itv',
        channelLabel: 'Koma 官方即梦',
        modelLabel: 'Seedance 2.0',
        capabilities: ['video.image-to-video'],
      },
    ]);

    renderEditor(createVideoNodeData({
      itvSelection: 'jimeng-channel::seedance-2.0',
      duration: 5,
    }));

    expect(await screen.findByRole('button', { name: '16:9 · 720P · 5s' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '16:9 · 720P · 5s' }));

    expect(await screen.findByText('当前模型支持 4-15s')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '10s' })).not.toBeInTheDocument();
    expect(updateNodeDataMock).not.toHaveBeenCalledWith('video-node-1', expect.any(Function));
  });
});
