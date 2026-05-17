import React from 'react';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import type { LinghuiGridType } from '../../../../types/linghui';

export const GRID_SPLIT_OPTIONS: Array<{ value: LinghuiGridType; label: string; size: number }> = [
  { value: '2x2', label: '4格', size: 2 },
  { value: '3x3', label: '9格', size: 3 },
  { value: '4x4', label: '16格', size: 4 },
  { value: '5x5', label: '25格', size: 5 },
];

interface LinghuiNodeEditorGridSplitToolbarProps {
  openDropdownKey: string | null;
  splitGridType: LinghuiGridType;
  selectedSplitCellCount: number;
  gridSplitUpscaleFactor: 2 | 4;
  gridSplitMenuItems: MenuProps['items'];
  gridSplitUpscaleMenuItems: MenuProps['items'];
  onDropdownOpenChange: (key: string, nextOpen: boolean) => void;
  onDropdownTriggerClick: (event: React.MouseEvent<HTMLElement>, key: string) => void;
  onExecuteGridSplit?: () => void;
  onRevertGridSplit?: () => void;
  resolveDropdownContainer: (triggerNode: HTMLElement) => HTMLElement;
}

export const LinghuiNodeEditorGridSplitToolbar: React.FC<LinghuiNodeEditorGridSplitToolbarProps> = ({
  openDropdownKey,
  splitGridType,
  selectedSplitCellCount,
  gridSplitUpscaleFactor,
  gridSplitMenuItems,
  gridSplitUpscaleMenuItems,
  onDropdownOpenChange,
  onDropdownTriggerClick,
  onExecuteGridSplit,
  onRevertGridSplit,
  resolveDropdownContainer,
}) => (
  <div className="linghuiNodeEditorGridToolRail">
    <Dropdown
      open={openDropdownKey === 'grid-split:type'}
      trigger={[]}
      classNames={{ root: 'linghuiNodeEditorDropdownMenu' }}
      getPopupContainer={resolveDropdownContainer}
      onOpenChange={(nextOpen) => onDropdownOpenChange('grid-split:type', nextOpen)}
      menu={{
        items: gridSplitMenuItems,
        selectable: true,
        selectedKeys: [splitGridType],
      }}
    >
      <Button
        size="small"
        className="linghuiNodeEditorToolButton isActive"
        onClick={(event) => onDropdownTriggerClick(event, 'grid-split:type')}
      >
        宫格 {GRID_SPLIT_OPTIONS.find(option => option.value === splitGridType)?.label ?? '4格'}
      </Button>
    </Dropdown>
    <div className="linghuiNodeEditorGridStatus">
      已选择 {selectedSplitCellCount} 个宫格
    </div>
    <Button
      type="primary"
      size="small"
      disabled={selectedSplitCellCount === 0}
      onClick={() => onExecuteGridSplit?.()}
    >
      创建生图节点
    </Button>
    <Dropdown
      open={openDropdownKey === 'grid-split:upscale'}
      trigger={[]}
      classNames={{ root: 'linghuiNodeEditorDropdownMenu' }}
      getPopupContainer={resolveDropdownContainer}
      onOpenChange={(nextOpen) => onDropdownOpenChange('grid-split:upscale', nextOpen)}
      menu={{
        items: gridSplitUpscaleMenuItems,
        selectable: true,
        selectedKeys: [String(gridSplitUpscaleFactor)],
      }}
    >
      <Button
        size="small"
        className="linghuiNodeEditorToolButton"
        onClick={(event) => onDropdownTriggerClick(event, 'grid-split:upscale')}
      >
        高清 {gridSplitUpscaleFactor}x
      </Button>
    </Dropdown>
    <Button
      size="small"
      className="linghuiNodeEditorToolButton"
      onClick={() => onRevertGridSplit?.()}
    >
      回退
    </Button>
  </div>
);
