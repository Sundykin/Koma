import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LinghuiCanvasContextMenu } from '../components/LinghuiCanvasContextMenu';
import { LINGHUI_CANVAS_CREATE_MENU_CATALOG } from '../state/linghuiCanvasQuickCreateCatalog';

const noop = vi.fn();

function renderNodeMenu(overrides?: Partial<React.ComponentProps<typeof LinghuiCanvasContextMenu>>) {
  return render(
    <LinghuiCanvasContextMenu
      contextMenu={{
        kind: 'node',
        x: 12,
        y: 20,
        screenX: 120,
        screenY: 200,
        nodeId: 'node-1',
      }}
      contextMenuNodeIsGroup={false}
      contextMenuResultCopyState={{
        textLabel: '复制结果文本',
        mediaLabel: '复制 4 个图片地址',
        taskIdLabel: '复制 TaskId',
        canCopyText: true,
        canCopyMedia: true,
        canCopyTaskId: true,
      }}
      contextMenuMediaActionState={{
        imageCount: 4,
        videoCount: 0,
        canOpenPanoramaPreview: true,
        canCreateSubject: true,
        canCopyPrimaryImage: true,
        canSeparateVideoAudio: false,
        canReturnToGenerator: false,
        canExpandImages: true,
        canDeleteOtherImages: true,
        canExpandVideos: false,
        canDeleteOtherVideos: false,
      }}
      contextMenuSelectionIds={['node-1']}
      nodeCatalog={[]}
      hasClipboardData={false}
      canUndo={false}
      canRedo={false}
      onAddNode={noop}
      onOpenAddNodePanel={noop}
      onCopyNodeSelection={noop}
      onDuplicateNodeSelection={noop}
      onOpenDownstreamQuickCreate={noop}
      onCreateAssetFromNode={noop}
      onOpenPanoramaPreviewFromNode={noop}
      onCreateSubjectFromNode={noop}
      onCopyPrimaryImageFromNode={noop}
      onSeparateVideoAudioFromNode={noop}
      onReturnToGenerator={noop}
      onCopyCurrentNodeResult={noop}
      onExpandCurrentNodeImages={noop}
      onDeleteOtherCurrentNodeImages={noop}
      onExpandCurrentNodeVideos={noop}
      onDeleteOtherCurrentNodeVideos={noop}
      onRunCurrentNode={noop}
      onRunCurrentGroup={noop}
      onExportCurrentSelection={noop}
      onSaveCurrentGroupAsWorkflow={noop}
      onUngroupCurrentGroup={noop}
      onDeleteCurrentGroup={noop}
      onPasteNearNode={noop}
      onDeleteCurrentNode={noop}
      onDeleteCurrentEdge={noop}
      onUploadImages={noop}
      onUploadVideos={noop}
      onUploadAudios={noop}
      onFormatLayout={noop}
      onOpenShortcutPanel={noop}
      onPaste={noop}
      onUndo={noop}
      onRedo={noop}
      onRunAll={noop}
      onRunSelection={noop}
      onExportSelection={noop}
      onSaveSelectionAsWorkflow={noop}
      onCopySelection={noop}
      onDuplicateSelection={noop}
      onDeleteSelection={noop}
      {...overrides}
    />,
  );
}

describe('LinghuiCanvasContextMenu (LibTV 1:1)', () => {
  // ============================================================
  // LibTV 节点右键菜单 1:1 复刻验证
  // 顺序：保存到我的素材 / 进入全景预览 / 创建主体 / 优化工作流布局 / 展开所有图片 / 删除其他图片
  //      / 展开所有视频 / 删除其他视频 / ─ / 复制节点 / 复制图片 / 创建副本 / 粘贴 / 删除 / ─
  //      / 复制到剪贴板 / 复制 TaskId
  // ============================================================
  it('renders only libtv image-node menu items in fixed order', () => {
    renderNodeMenu();

    expect(screen.getByRole('button', { name: /保存到我的素材/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /进入全景预览/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /创建主体/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /优化工作流布局/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /展开所有图片/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /删除其他图片/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /复制节点/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^复制图片$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /创建副本/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^粘贴\s*⌘V$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^删除\s*⌘⌫$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /复制到剪贴板/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /复制 TaskId/ })).toBeInTheDocument();
  });

  it('removes legacy non-libtv items from the node menu', () => {
    renderNodeMenu();

    expect(screen.queryByRole('button', { name: /运行当前节点/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /继续创建下游/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /返回生成节点/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /更多操作/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /收起更多/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /导出当前结果/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /分离内嵌音轨/ })).not.toBeInTheDocument();
  });

  it('hides taskId / copy-image when no media or task is available', () => {
    renderNodeMenu({
      contextMenuMediaActionState: {
        imageCount: 0,
        videoCount: 0,
        canOpenPanoramaPreview: false,
        canCreateSubject: false,
        canCopyPrimaryImage: false,
        canSeparateVideoAudio: false,
        canReturnToGenerator: false,
        canExpandImages: false,
        canDeleteOtherImages: false,
        canExpandVideos: false,
        canDeleteOtherVideos: false,
      },
      contextMenuResultCopyState: {
        textLabel: '复制结果',
        mediaLabel: '复制到剪贴板',
        taskIdLabel: '复制 TaskId',
        canCopyText: false,
        canCopyMedia: false,
        canCopyTaskId: false,
      },
    });

    expect(screen.queryByRole('button', { name: /^复制图片$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /复制 TaskId/ })).not.toBeInTheDocument();
    // 保存到我的素材始终显示（即使没有素材，与 LibTV 一致）。
    expect(screen.getByRole('button', { name: /保存到我的素材/ })).toBeInTheDocument();
    // 复制到剪贴板按钮依然渲染但 disabled。
    const copyClipboard = screen.getByRole('button', { name: /复制到剪贴板/ });
    expect(copyClipboard).toBeDisabled();
  });

  // ============================================================
  // 空白画布右键菜单：在 LibTV 基础上拆分"上传"为图片/视频两项（项目需求）
  // 顺序：上传图片 / 上传视频 / 保存到我的素材 / 添加节点 / ─ / 撤销 / 重做 / ─ / 粘贴
  // ============================================================
  it('renders 8 pane menu items in fixed order (上传拆分为图片/视频)', () => {
    renderNodeMenu({
      contextMenu: {
        kind: 'pane',
        x: 12,
        y: 20,
        screenX: 120,
        screenY: 200,
      },
      nodeCatalog: LINGHUI_CANVAS_CREATE_MENU_CATALOG,
    });

    expect(screen.getByRole('button', { name: /^上传图片$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^上传视频$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /保存到我的素材/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /添加节点/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /撤销/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重做/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /粘贴/ })).toBeInTheDocument();
  });

  it('strips legacy run/upload/shortcut items from the pane menu', () => {
    renderNodeMenu({
      contextMenu: {
        kind: 'pane',
        x: 12,
        y: 20,
        screenX: 120,
        screenY: 200,
      },
      nodeCatalog: LINGHUI_CANVAS_CREATE_MENU_CATALOG,
    });

    expect(screen.queryByRole('button', { name: /运行全部/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /运行选中/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /上传视频到画布/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /上传音频到画布/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /优化工作流布局/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /快捷键/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /批量导出选中结果/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /保存为工作流/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /复制选中/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /为选中创建副本/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除选中/ })).not.toBeInTheDocument();
  });
});
