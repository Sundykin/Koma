import type { ReactNode } from 'react';
import type { MenuProps } from 'antd';
import {
  Crop,
  Eraser,
  Focus,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Pencil,
  Repeat,
  Scan,
  Scissors,
  TableProperties,
} from 'lucide-react';
import type { LinghuiImageNineGridPresetDef } from '../../editors/state/linghuiImageToolPresets';
import type {
  LinghuiGridType,
  LinghuiImageToolKey,
  LinghuiNodeToolState,
} from '../../../../types/linghui';
import type { LinghuiNodeEditorApi } from '../state/LinghuiNodeRunsContext';

interface ToolEntry {
  key: LinghuiImageToolKey;
  label: string;
  icon: ReactNode;
}

interface BuildUpscaleMenuItemsOptions {
  nodeId: string;
  onExecuteImageUpscale?: LinghuiNodeEditorApi['onExecuteImageUpscale'];
  closeDropdown: () => void;
}

interface BuildGridSplitMenuItemsOptions {
  openGridSplit: (gridType: Exclude<LinghuiGridType, 'none'>) => void;
}

interface BuildNineGridMenuItemsOptions {
  presets: LinghuiImageNineGridPresetDef[];
  openGridStoryComposer: (preset: LinghuiImageNineGridPresetDef) => void;
}

interface BuildEditMenuItemsOptions {
  fireImageTool: (tool: LinghuiImageToolKey) => void;
}

interface BuildMoreMenuItemsOptions {
  hiddenToolSet: ReadonlySet<LinghuiImageToolKey>;
  nineGridMenuItems: MenuProps['items'];
  upscaleMenuItems: MenuProps['items'];
  gridSplitMenuItems: MenuProps['items'];
  fireImageTool: (tool: LinghuiImageToolKey) => void;
}

export const PRIMARY_TOOL_KEYS: LinghuiImageToolKey[] = ['repaint', 'outpaint', 'erase', 'remove-bg', 'crop'];

export const ICON_ONLY_TOOLS: ToolEntry[] = [
  { key: 'focus', label: '聚焦', icon: <Focus size={14} /> },
  { key: 'mark', label: '标记', icon: <Pencil size={14} /> },
];

export const TOOLBAR_SUBMENU_POPUP_CLASS = 'linghuiImageToolbarDropdown linghuiImageToolbarSubmenuDropdown';

export const TOOLBAR_MENU_CLASS_NAMES: MenuProps['classNames'] = {
  itemContent: 'linghuiImageToolbarMenuContent',
  subMenu: {
    itemContent: 'linghuiImageToolbarMenuContent',
  },
  popup: {
    root: 'linghuiImageToolbarDropdown',
  },
};

export function isActiveTool(
  activeTool: LinghuiNodeToolState | null | undefined,
  nodeId: string,
  tool: LinghuiImageToolKey,
): boolean {
  if (!activeTool || activeTool.kind !== 'image') return false;
  return activeTool.nodeId === nodeId && activeTool.tool === tool;
}

export function getToolbarDropdownContainer(triggerNode: HTMLElement): HTMLElement {
  return triggerNode.ownerDocument.body;
}

export function createToolbarMenu(items: MenuProps['items']): MenuProps {
  return {
    items,
    selectable: false,
    triggerSubMenuAction: 'hover',
    subMenuOpenDelay: 0,
    subMenuCloseDelay: 0.08,
    classNames: TOOLBAR_MENU_CLASS_NAMES,
  };
}

export function buildUpscaleMenuItems({
  nodeId,
  onExecuteImageUpscale,
  closeDropdown,
}: BuildUpscaleMenuItemsOptions): MenuProps['items'] {
  return [
    {
      key: 'upscale-2x',
      label: (
        <span className="linghuiImageToolbarMenuItem">
          <span className="linghuiImageToolbarMenuBadge">HD</span>
          <span>2 倍高清</span>
        </span>
      ),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onExecuteImageUpscale?.(nodeId, { factor: 2 });
        closeDropdown();
      },
    },
    {
      key: 'upscale-4x',
      label: (
        <span className="linghuiImageToolbarMenuItem">
          <span className="linghuiImageToolbarMenuBadge">HD</span>
          <span>4 倍高清</span>
        </span>
      ),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onExecuteImageUpscale?.(nodeId, { factor: 4 });
        closeDropdown();
      },
    },
  ];
}

export function buildGridSplitMenuItems({
  openGridSplit,
}: BuildGridSplitMenuItemsOptions): MenuProps['items'] {
  return [
    {
      key: 'split-2x2',
      label: <span className="linghuiImageToolbarMenuItem"><TableProperties size={18} />4 宫格 (2×2)</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        openGridSplit('2x2');
      },
    },
    {
      key: 'split-3x3',
      label: <span className="linghuiImageToolbarMenuItem"><TableProperties size={18} />9 宫格 (3×3)</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        openGridSplit('3x3');
      },
    },
    {
      key: 'split-4x4',
      label: <span className="linghuiImageToolbarMenuItem"><TableProperties size={18} />16 宫格 (4×4)</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        openGridSplit('4x4');
      },
    },
    {
      key: 'split-5x5',
      label: <span className="linghuiImageToolbarMenuItem"><TableProperties size={18} />25 宫格 (5×5)</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        openGridSplit('5x5');
      },
    },
  ];
}

export function buildNineGridMenuItems({
  presets,
  openGridStoryComposer,
}: BuildNineGridMenuItemsOptions): MenuProps['items'] {
  return presets.map(preset => ({
    key: preset.scene,
    label: <span className="linghuiImageToolbarMenuItem"><Layers size={18} />{preset.label}</span>,
    onClick: ({ domEvent }) => {
      domEvent.stopPropagation();
      openGridStoryComposer(preset);
    },
  }));
}

export function buildEditMenuItems({
  fireImageTool,
}: BuildEditMenuItemsOptions): MenuProps['items'] {
  return [
    {
      key: 'outpaint',
      label: <span className="linghuiImageToolbarMenuItem"><Maximize2 size={18} />扩图</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        fireImageTool('outpaint');
      },
    },
    {
      key: 'repaint',
      label: <span className="linghuiImageToolbarMenuItem"><Repeat size={18} />重绘</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        fireImageTool('repaint');
      },
    },
    {
      key: 'erase',
      label: <span className="linghuiImageToolbarMenuItem"><Eraser size={18} />擦除</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        fireImageTool('erase');
      },
    },
    {
      key: 'remove-bg',
      label: <span className="linghuiImageToolbarMenuItem"><Scissors size={18} />抠图</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        fireImageTool('remove-bg');
      },
    },
    {
      key: 'crop',
      label: <span className="linghuiImageToolbarMenuItem"><Crop size={18} />裁剪</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        fireImageTool('crop');
      },
    },
    {
      key: 'mockup',
      label: <span className="linghuiImageToolbarMenuItem"><Scan size={18} />Mockup</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        fireImageTool('mockup');
      },
    },
    {
      key: 'edit-elements',
      label: <span className="linghuiImageToolbarMenuItem"><ImageIcon size={18} />元素</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        fireImageTool('edit-elements');
      },
    },
    {
      key: 'edit-texts',
      label: <span className="linghuiImageToolbarMenuItem"><Pencil size={18} />文字</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        fireImageTool('edit-texts');
      },
    },
  ];
}

export function buildMoreMenuItems({
  hiddenToolSet,
  nineGridMenuItems,
  upscaleMenuItems,
  gridSplitMenuItems,
  fireImageTool,
}: BuildMoreMenuItemsOptions): MenuProps['items'] {
  const items: MenuProps['items'] = [
    {
      key: 'nine-grid',
      label: <span className="linghuiImageToolbarMenuItem"><TableProperties size={18} />九宫格</span>,
      children: nineGridMenuItems,
      popupClassName: TOOLBAR_SUBMENU_POPUP_CLASS,
      popupOffset: [4, 0],
    },
    {
      key: 'upscale',
      label: <span className="linghuiImageToolbarMenuItem"><span className="linghuiImageToolbarMenuBadge">HD</span>高清</span>,
      children: upscaleMenuItems,
      popupClassName: TOOLBAR_SUBMENU_POPUP_CLASS,
      popupOffset: [4, 0],
    },
    {
      key: 'grid-split',
      label: <span className="linghuiImageToolbarMenuItem"><TableProperties size={18} />宫格切分</span>,
      children: gridSplitMenuItems,
      popupClassName: TOOLBAR_SUBMENU_POPUP_CLASS,
      popupOffset: [4, 0],
    },
    { type: 'divider' },
  ];

  if (!hiddenToolSet.has('focus')) {
    items.push({
      key: 'focus',
      label: <span className="linghuiImageToolbarMenuItem"><Focus size={18} />聚焦</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        fireImageTool('focus');
      },
    });
  }

  if (!hiddenToolSet.has('mark')) {
    items.push({
      key: 'mark',
      label: <span className="linghuiImageToolbarMenuItem"><Pencil size={18} />标记</span>,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        fireImageTool('mark');
      },
    });
  }

  return items;
}
