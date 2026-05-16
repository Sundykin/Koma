// @vitest-environment jsdom
import React from 'react';
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeData } from '../../../../types/linghui';
import { LinghuiNodeEditor } from '../components/LinghuiNodeEditor';

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const {
  useEdgesMock,
  useNodesMock,
  useNodesDataMock,
  useLinghuiNodeEditorApiMock,
  onExecuteImageUpscaleMock,
  onExecuteImageCropMock,
  onApplyImageToolPresetMock,
  setActiveToolMock,
} = vi.hoisted(() => ({
  useEdgesMock: vi.fn(),
  useNodesMock: vi.fn(),
  useNodesDataMock: vi.fn(),
  useLinghuiNodeEditorApiMock: vi.fn(),
  onExecuteImageUpscaleMock: vi.fn(),
  onExecuteImageCropMock: vi.fn(),
  onApplyImageToolPresetMock: vi.fn(),
  setActiveToolMock: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  useEdges: () => useEdgesMock(),
  useNodes: () => useNodesMock(),
  useNodesData: (...args: unknown[]) => useNodesDataMock(...args),
}));

vi.mock('../../nodes/state/LinghuiNodeRunsContext', () => ({
  useLinghuiCanvasZoom: () => 1,
  useLinghuiGridSplitOverlay: () => null,
  useLinghuiNodeEditorApi: () => useLinghuiNodeEditorApiMock(),
  useLinghuiNodeInteractionApi: () => ({
    bindNodeSurface: () => ({
      onPointerDown: () => undefined,
      onPointerMove: () => undefined,
      onPointerUp: () => undefined,
      onPointerCancel: () => undefined,
    }),
    openNodeEditor: () => undefined,
    openNodeContextMenu: () => undefined,
    openImageToolPanel: setActiveToolMock,
    openVideoToolPanel: () => undefined,
  }),
  useLinghuiNodeMutation: () => ({
    updateNodeData: vi.fn(),
    clearNodeRunState: vi.fn(),
  }),
}));

// 浮空工具条用 useLinghuiCanvasStore 取 activeNodeTool，测试场景里 store 默认 null 即可。
vi.mock('../../canvas/state/linghuiCanvasStore', () => ({
  useLinghuiCanvasStore: (selector: (state: { activeNodeTool: null }) => unknown) => selector({ activeNodeTool: null }),
}));

vi.mock('../../nodes/components/EditableCompactNodeLabel', () => ({
  EditableCompactNodeLabel: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock('../components/ImageNodeEditor', () => ({
  ImageNodeEditor: () => <div data-testid="image-node-editor" />,
}));

vi.mock('../components/ImageGeneratorNodeEditor', () => ({
  ImageGeneratorNodeEditor: () => null,
}));

vi.mock('../components/PanoramaNodeEditor', () => ({
  PanoramaNodeEditor: () => null,
}));

vi.mock('../components/AgentNodeEditor', () => ({
  AgentNodeEditor: () => null,
}));

vi.mock('../components/AudioNodeEditor', () => ({
  AudioNodeEditor: () => null,
}));

vi.mock('../components/Director3DNodeEditor', () => ({
  Director3DNodeEditor: () => null,
}));

vi.mock('../components/ScriptNodeEditor', () => ({
  ScriptNodeEditor: () => null,
}));

vi.mock('../components/StoryboardNodeEditor', () => ({
  StoryboardNodeEditor: () => null,
}));

vi.mock('../components/TextNodeEditor', () => ({
  TextNodeEditor: () => null,
}));

vi.mock('../components/VideoNodeEditor', () => ({
  VideoNodeEditor: () => null,
}));

function createImageNodeData(): LinghuiNodeData {
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
      mode: 'import',
      source: 'https://cdn.example.com/original.png',
      primaryResultSource: 'https://cdn.example.com/original.png',
      prompt: '',
      ttiSelection: '',
      aspectRatio: '3:4',
      resolution: 'auto',
      gridType: 'none',
      batchCount: 1,
    },
  };
}

describe('LinghuiNodeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: MockResizeObserver,
    });
    const nodeData = createImageNodeData();
    useEdgesMock.mockReturnValue([]);
    useNodesMock.mockReturnValue([{ id: 'image-node-1', data: nodeData }]);
    useNodesDataMock.mockReturnValue({ id: 'image-node-1', data: nodeData });
    useLinghuiNodeEditorApiMock.mockReturnValue({
      selection: {
        kind: 'node',
        nodeId: 'image-node-1',
        nodeType: 'linghui/image',
        label: '图片节点',
      },
      activeTool: null,
      setActiveTool: setActiveToolMock,
      closeEditor: vi.fn(),
      nodeRuns: {},
      workspaceId: 'workspace-1',
      onAssetLibraryMutate: vi.fn(),
      onRunNode: vi.fn(),
      onDeriveScriptShots: vi.fn(),
      onGenerateScriptImages: vi.fn(),
      onGenerateScriptVideos: vi.fn(),
      onExecuteImageUpscale: onExecuteImageUpscaleMock,
      onExecuteImageCrop: onExecuteImageCropMock,
      onExecuteMultiAngle: vi.fn(),
      onApplyImageToolPreset: onApplyImageToolPresetMock,
      onSetGridSplitType: vi.fn(),
      onClearGridSplitCells: vi.fn(),
      onExecuteGridSplit: vi.fn(),
      onGenerateImageFromController: vi.fn(),
      gridSplitUpscaleFactor: 2,
      onSetGridSplitUpscaleFactor: vi.fn(),
      onRevertGridSplit: vi.fn(),
    });
  });

  // LibTV 1:1 图片工具条行为验证：
  // - 多角度单按钮打开面板
  // - AI 工具（扩图 ▼ /裁剪 ▼ 等）弹 preset 二级菜单，选 preset 修改当前节点 prompt 并自动运行
  // - 高清 ▼ 弹 2x/4x，本地 FFmpeg 派生高清节点

  it('LibTV 多角度单按钮打开面板（无 Dropdown）', async () => {
    render(
      <App>
        <LinghuiNodeEditor nodeId="image-node-1" nodeType="linghui/image" />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: /多角度/ }));
    await waitFor(() => {
      expect(setActiveToolMock).toHaveBeenCalledWith('image-node-1', 'multi-angle');
    });
  });

  it('LibTV 扩图 ▼ 弹 preset 选横向扩图 → 修改当前节点 onApplyImageToolPreset', async () => {
    render(
      <App>
        <LinghuiNodeEditor nodeId="image-node-1" nodeType="linghui/image" />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: /扩\s*图/ }));
    fireEvent.click(await screen.findByText('横向扩图'));

    await waitFor(() => {
      expect(onApplyImageToolPresetMock).toHaveBeenCalledWith(expect.objectContaining({
        label: '横向扩图',
        promptSnippet: expect.stringContaining('横向扩图'),
        properties: expect.objectContaining({ aspectRatio: '16:9', resolution: '2K' }),
      }));
    });
  });

  it('LibTV 高清 ▼ 弹 2 倍/4 倍 → 调用 onExecuteImageUpscale', async () => {
    render(
      <App>
        <LinghuiNodeEditor nodeId="image-node-1" nodeType="linghui/image" />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: /高\s*清/ }));
    fireEvent.click(await screen.findByText('2 倍高清'));

    await waitFor(() => {
      expect(onExecuteImageUpscaleMock).toHaveBeenCalledWith('image-node-1', { factor: 2 });
    });
  });
});
