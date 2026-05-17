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
  onCreatePanoramaPreviewMock,
  onSetGridSplitTypeMock,
  onClearGridSplitCellsMock,
  setActiveToolMock,
} = vi.hoisted(() => ({
  useEdgesMock: vi.fn(),
  useNodesMock: vi.fn(),
  useNodesDataMock: vi.fn(),
  useLinghuiNodeEditorApiMock: vi.fn(),
  onExecuteImageUpscaleMock: vi.fn(),
  onExecuteImageCropMock: vi.fn(),
  onApplyImageToolPresetMock: vi.fn(),
  onCreatePanoramaPreviewMock: vi.fn(),
  onSetGridSplitTypeMock: vi.fn(),
  onClearGridSplitCellsMock: vi.fn(),
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
      onCreatePanoramaPreview: onCreatePanoramaPreviewMock,
      onSetGridSplitType: onSetGridSplitTypeMock,
      onClearGridSplitCells: onClearGridSplitCellsMock,
      onExecuteGridSplit: vi.fn(),
      onGenerateImageFromController: vi.fn(),
      gridSplitUpscaleFactor: 2,
      onSetGridSplitUpscaleFactor: vi.fn(),
      onRevertGridSplit: vi.fn(),
    });
  });

  // LibTV 1:1 图片工具条行为验证：
  // - 多角度单按钮打开面板
  // - 重绘 ▼ 聚合扩图/重绘/擦除等编辑工具，选扩图/重绘后打开对应 LibTV 大面板
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

  it('LibTV 全景 NEW 创建全景预览节点而不是打开多角度', async () => {
    render(
      <App>
        <LinghuiNodeEditor nodeId="image-node-1" nodeType="linghui/image" />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: '全景' }));

    await waitFor(() => {
      expect(onCreatePanoramaPreviewMock).toHaveBeenCalledWith('image-node-1');
    });
    expect(setActiveToolMock).not.toHaveBeenCalledWith('image-node-1', 'multi-angle');
  });

  it('LibTV 重绘 ▼ 菜单里的扩图打开可视化面板', async () => {
    render(
      <App>
        <LinghuiNodeEditor nodeId="image-node-1" nodeType="linghui/image" />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: /重\s*绘/ }));
    fireEvent.click(await screen.findByText('扩图'));

    await waitFor(() => {
      expect(setActiveToolMock).toHaveBeenCalledWith('image-node-1', 'outpaint');
    });
  });

  it('LibTV 打光按钮打开可视化面板', async () => {
    render(
      <App>
        <LinghuiNodeEditor nodeId="image-node-1" nodeType="linghui/image" />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: /打\s*光/ }));

    await waitFor(() => {
      expect(setActiveToolMock).toHaveBeenCalledWith('image-node-1', 'relight');
    });
  });

  it('LibTV 重绘 ▼ 菜单里的重绘打开可视化面板', async () => {
    render(
      <App>
        <LinghuiNodeEditor nodeId="image-node-1" nodeType="linghui/image" />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: /重\s*绘/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /重\s*绘/ }));

    await waitFor(() => {
      expect(setActiveToolMock).toHaveBeenCalledWith('image-node-1', 'repaint');
    });
  });

  it('LibTV 更多菜单里的高清弹 2 倍/4 倍 → 调用 onExecuteImageUpscale', async () => {
    render(
      <App>
        <LinghuiNodeEditor nodeId="image-node-1" nodeType="linghui/image" />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: /更\s*多/ }));
    fireEvent.mouseEnter(await screen.findByRole('menuitem', { name: /高\s*清/ }));
    fireEvent.click(await screen.findByText('2 倍高清'));

    await waitFor(() => {
      expect(onExecuteImageUpscaleMock).toHaveBeenCalledWith('image-node-1', { factor: 2 });
    });
  });

  it('LibTV 九宫格菜单 → 弹剧情编辑 Modal，确认后提交带用户剧情的合并 preset', async () => {
    render(
      <App>
        <LinghuiNodeEditor nodeId="image-node-1" nodeType="linghui/image" />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: /更\s*多/ }));
    fireEvent.mouseEnter(await screen.findByRole('menuitem', { name: /九\s*宫\s*格/ }));
    fireEvent.click(await screen.findByText('剧情推演九宫格'));

    // 点击 preset 后应先弹剧情编辑 Modal，不直接派生
    const composerHeading = await screen.findByText(/编辑剧情 · 剧情推演九宫格/);
    expect(composerHeading).toBeInTheDocument();
    expect(onApplyImageToolPresetMock).not.toHaveBeenCalled();

    // 输入用户补充剧情
    const textarea = screen.getAllByRole('textbox').find(el => el.tagName.toLowerCase() === 'textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '主角第一次面对宿敌时心理动摇，最终决定背水一战。' } });

    // 确认提交
    fireEvent.click(screen.getByRole('button', { name: /生成宫格/ }));

    await waitFor(() => {
      expect(onApplyImageToolPresetMock).toHaveBeenCalledWith(expect.objectContaining({
        label: '剧情推演九宫格',
        // 合并 promptSnippet 仍包含 LibTV 同源基础提示，且追加了用户剧情
        promptSnippet: expect.stringContaining('生成一张单张完整的宫格分镜图，而不是切分原图'),
        properties: expect.objectContaining({
          aspectRatio: '1:1',
          batchCount: 1,
        }),
      }));
    });
    // 确认 promptSnippet 末尾包含用户补充剧情
    const callArg = onApplyImageToolPresetMock.mock.calls[0][0] as { promptSnippet: string };
    expect(callArg.promptSnippet).toContain('用户补充剧情：主角第一次面对宿敌时心理动摇');

    expect(onSetGridSplitTypeMock).not.toHaveBeenCalled();
    expect(onClearGridSplitCellsMock).not.toHaveBeenCalled();
    expect(setActiveToolMock).not.toHaveBeenCalledWith('image-node-1', 'grid-split');
    expect(setActiveToolMock).not.toHaveBeenCalledWith('image-node-1', 'multi-angle');
    expect(setActiveToolMock).not.toHaveBeenCalledWith('image-node-1', 'relight');
  });

  it('LibTV 重绘菜单不再重复显示高清入口', async () => {
    render(
      <App>
        <LinghuiNodeEditor nodeId="image-node-1" nodeType="linghui/image" />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: /重\s*绘/ }));

    await screen.findByRole('menuitem', { name: /扩\s*图/ });
    expect(screen.queryByRole('menuitem', { name: /高\s*清/ })).not.toBeInTheDocument();
  });

  it('LibTV 宫格切分菜单会写入 4/9/16/25 档位', async () => {
    render(
      <App>
        <LinghuiNodeEditor nodeId="image-node-1" nodeType="linghui/image" />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: /更\s*多/ }));
    fireEvent.mouseEnter(await screen.findByRole('menuitem', { name: /宫\s*格\s*切\s*分/ }));
    fireEvent.click(await screen.findByText('16 宫格 (4×4)'));

    await waitFor(() => {
      expect(onSetGridSplitTypeMock).toHaveBeenCalledWith('4x4');
      expect(onClearGridSplitCellsMock).toHaveBeenCalled();
      expect(setActiveToolMock).toHaveBeenCalledWith('image-node-1', 'grid-split');
    });
  });

  it('导入素材节点的更多菜单不显示无效的聚焦/标记入口', async () => {
    render(
      <App>
        <LinghuiNodeEditor nodeId="image-node-1" nodeType="linghui/image" />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: /更\s*多/ }));

    await screen.findByRole('menuitem', { name: /九\s*宫\s*格/ });
    expect(screen.queryByRole('menuitem', { name: /聚\s*焦/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /标\s*记/ })).not.toBeInTheDocument();
  });
});
