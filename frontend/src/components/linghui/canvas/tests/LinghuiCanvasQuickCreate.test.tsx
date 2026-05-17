import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LinghuiCanvasQuickCreate } from '../components/LinghuiCanvasQuickCreate';
import { LINGHUI_CANVAS_CREATE_MENU_CATALOG } from '../state/linghuiCanvasQuickCreateCatalog';
import type { QuickCreateState } from '../state/linghuiCanvasShared';

const blankQuickCreate: QuickCreateState = {
  x: 120,
  y: 160,
  screenX: 120,
  screenY: 160,
};

describe('LinghuiCanvasQuickCreate', () => {
  it('空白添加节点：统一用 LINGHUI_REFER_NODE_PRESETS 卡片样式，包含全景节点和 3D 导演工作台', () => {
    const onAddNode = vi.fn();
    render(
      <LinghuiCanvasQuickCreate
        quickCreate={blankQuickCreate}
        catalog={LINGHUI_CANVAS_CREATE_MENU_CATALOG}
        onAddNode={onAddNode}
      />,
    );

    expect(screen.getByText('添加节点')).toBeInTheDocument();
    // 用户要求：全景 / 3D 导演工作台 必须在统一菜单中可见
    expect(screen.getByRole('button', { name: /全景节点/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3D 导演工作台/ })).toBeInTheDocument();
    // #16 已加 linghui/video-clip 节点类型，视频合成现在可派生（available=true）
    expect(screen.getByRole('button', { name: /视频合成/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /全景节点/ }));
    expect(onAddNode).toHaveBeenCalledWith(expect.objectContaining({
      id: 'refer-panorama',
      type: 'linghui/panorama',
      label: '全景节点',
    }));
  });

  it('拖线引用：扁平 6 项卡片（不含 spatial 节点）；视频合成 available 后不再 disabled', () => {
    const onAddNode = vi.fn();
    render(
      <LinghuiCanvasQuickCreate
        quickCreate={{
          ...blankQuickCreate,
          sourceConnection: {
            sourceNodeId: 'image-1',
            sourceHandleId: 'output-0',
            sourceDataType: 'image',
          },
        }}
        catalog={LINGHUI_CANVAS_CREATE_MENU_CATALOG}
        onAddNode={onAddNode}
      />,
    );

    expect(screen.getByText('引用该节点生成')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /图片/ })).toBeInTheDocument();
    // spatial 节点（全景/3D 导演）在连线模式下隐藏
    expect(screen.queryByRole('button', { name: /全景节点/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /3D 导演工作台/ })).not.toBeInTheDocument();
  });
});
