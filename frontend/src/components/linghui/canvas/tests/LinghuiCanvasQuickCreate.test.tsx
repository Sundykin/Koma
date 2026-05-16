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
  it('空白添加节点使用完整 catalog，包含全景节点和 3D 导演工作台', () => {
    const onAddNode = vi.fn();
    render(
      <LinghuiCanvasQuickCreate
        quickCreate={blankQuickCreate}
        catalog={LINGHUI_CANVAS_CREATE_MENU_CATALOG}
        onAddNode={onAddNode}
      />,
    );

    expect(screen.getByText('添加节点')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /全景节点/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3D 导演工作台/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /视频合成/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /全景节点/ }));
    expect(onAddNode).toHaveBeenCalledWith(expect.objectContaining({
      id: 'spatial-panorama',
      type: 'linghui/panorama',
      label: '全景节点',
    }));
  });

  it('拖线引用仍使用 LibTV 六项引用菜单', () => {
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
    expect(screen.getByRole('button', { name: /视频合成/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /全景节点/ })).not.toBeInTheDocument();
  });
});
