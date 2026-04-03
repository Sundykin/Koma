import React from 'react';
import { App } from 'antd';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeData, LinghuiNodeRunState } from '../../../../types/linghui';
import { VideoNodeEditor } from '../components/VideoNodeEditor';

const {
  loadSettingsMock,
  listConfiguredModelSelectOptionsMock,
  getDefaultMediaSelectionMock,
  serializeMediaSelectionMock,
  clearNodeRunStateMock,
  updateNodeDataMock,
} = vi.hoisted(() => ({
  loadSettingsMock: vi.fn(),
  listConfiguredModelSelectOptionsMock: vi.fn(),
  getDefaultMediaSelectionMock: vi.fn(),
  serializeMediaSelectionMock: vi.fn(),
  clearNodeRunStateMock: vi.fn(),
  updateNodeDataMock: vi.fn(),
}));

vi.mock('../../store/settings/core', () => ({
  loadSettings: (...args: unknown[]) => loadSettingsMock(...args),
}));

vi.mock('../../providers/channel/resolver', () => ({
  getDefaultMediaSelection: (...args: unknown[]) => getDefaultMediaSelectionMock(...args),
  listConfiguredModelSelectOptions: (...args: unknown[]) => listConfiguredModelSelectOptionsMock(...args),
  serializeMediaSelection: (...args: unknown[]) => serializeMediaSelectionMock(...args),
}));

vi.mock('./LinghuiPromptEditor', () => ({
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

vi.mock('./nodes/LinghuiNodeRunsContext', () => ({
  useLinghuiNodeMutation: () => ({
    clearNodeRunState: clearNodeRunStateMock,
    updateNodeData: updateNodeDataMock,
  }),
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
        onRun={vi.fn()}
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
        channelLabel: 'Vidu',
        modelLabel: 'viduq3-pro',
        capabilities: ['video.image-to-video'],
      },
    ]);
    getDefaultMediaSelectionMock.mockReturnValue(null);
    serializeMediaSelectionMock.mockReturnValue('');
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

  it('生成态视频节点展示拆分后的模型与参数控件且不再渲染结果预览', async () => {
    renderEditor(createVideoNodeData());

    await waitFor(() => {
      expect(screen.getByText('模型与参数')).toBeInTheDocument();
    });

    expect(screen.getAllByText('图生视频').length).toBeGreaterThan(0);
    expect(screen.getByText('模型')).toBeInTheDocument();
    expect(screen.getByText('比例')).toBeInTheDocument();
    expect(screen.getByText('分辨率')).toBeInTheDocument();
    expect(screen.getByText('时长')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成' })).toBeInTheDocument();
    expect(screen.queryByText('生成结果')).not.toBeInTheDocument();
  });

  it('生成态视频节点即便已有输出结果也不再在编辑区保留结果入口', async () => {
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
      expect(screen.getByText('模型与参数')).toBeInTheDocument();
    });

    expect(screen.queryByText('生成结果')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '在浏览器打开' })).not.toBeInTheDocument();
    expect(screen.queryByText('请外部打开查看')).not.toBeInTheDocument();
  });

  it('只展示当前模型真实支持的视频能力', async () => {
    listConfiguredModelSelectOptionsMock.mockReturnValue([
      {
        value: 'vidu-main::viduq3-pro',
        label: 'Vidu Q3 Pro',
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
});
