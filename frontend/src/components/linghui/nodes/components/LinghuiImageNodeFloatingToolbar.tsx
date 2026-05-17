import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  Download,
  Expand,
  Image as ImageIcon,
  Layers,
  Repeat,
  RotateCw,
  Scan,
  Sparkles,
  Sun,
  TableProperties,
} from 'lucide-react';
import { Dropdown } from 'antd';
import { LinghuiGridSplitStoryComposer } from './LinghuiGridSplitStoryComposer';
import type { LinghuiImageNineGridPresetDef } from '../../editors/state/linghuiImageToolPresets';
import type { LinghuiImageToolKey } from '../../../../types/linghui';
import {
  useLinghuiNodeEditorApi,
  useLinghuiNodeInteractionApi,
} from '../state/LinghuiNodeRunsContext';
import { useLinghuiCanvasStore } from '../../canvas/state/linghuiCanvasStore';
import { LINGHUI_IMAGE_NINE_GRID_PRESETS } from '../../editors/state/linghuiImageToolPresets';
import {
  ICON_ONLY_TOOLS,
  PRIMARY_TOOL_KEYS,
  buildEditMenuItems,
  buildGridSplitMenuItems,
  buildMoreMenuItems,
  buildNineGridMenuItems,
  buildUpscaleMenuItems,
  createToolbarMenu,
  getToolbarDropdownContainer,
  isActiveTool,
} from './linghuiImageToolbarMenus';

/**
 * LibTV 图片节点正上方浮空工具条 1:1 完整版（统一了截图 3/4 紧凑工具条与截图 10 点击展开面板）。
 *
 * 设计原则：
 * - **浮空工具条与编辑器面板二选一**，避免用户在两套工具条之间困惑。
 * - **hover 不消失**：节点和工具条之间的 12px 间隙由 ::before 伪元素 capture pointer，
 *   鼠标进入间隙时仍命中节点 hover 区，工具条保持显示。
 * - **active 高亮**：从 store 读 `activeNodeTool`，对应 chip 加 `.isActive` class，让用户知道
 *   当前打开了哪个工具面板。
 * - **完整 LibTV 工具集**（按 LibTV 截图 10 顺序）：
 *     高清 ▼ / 多角度 / 扩图 / 打光 / 重绘 / 擦除 / 抠图 / 裁剪 / Mockup / 元素 / 文字 / 宫格切分 ▼
 *     ─ 分隔
 *     聚焦 / 标记 / 全景 [NEW] / 旋转 / 下载 / 全屏
 * - 工具条 wrap 多行；窄屏自适应。
 */
interface LinghuiImageNodeFloatingToolbarProps {
  nodeId: string;
  /** 是否是全景节点：true 时 "全景" 入口跳预览模式；false 时进入全景预览创建。 */
  isPanorama: boolean;
  /** 主图源（用于"下载"按钮）；缺失则禁用下载。 */
  primarySource?: string;
  onDownload?: () => void;
  onFullscreen?: () => void;
  /**
   * 渲染模式：
   * - 'floating'（默认，已废弃）：节点上方 hover 触发浮空显示。
   * - 'static'：编辑器顶部点击菜单常驻显示，跟随编辑器开关。这是当前 LibTV 1:1 唯一用法。
   */
  variant?: 'floating' | 'static';
  /** 当前节点不应展示的工具，例如导入素材节点上的聚焦/标记。 */
  hiddenTools?: LinghuiImageToolKey[];
}

export const LinghuiImageNodeFloatingToolbar: React.FC<LinghuiImageNodeFloatingToolbarProps> = ({
  nodeId,
  isPanorama,
  primarySource,
  onDownload,
  onFullscreen,
  variant = 'floating',
  hiddenTools = [],
}) => {
  const interactionApi = useLinghuiNodeInteractionApi();
  const {
    onApplyImageToolPreset,
    onExecuteImageUpscale,
    onCreatePanoramaPreview,
    onSetGridSplitType,
    onClearGridSplitCells,
  } = useLinghuiNodeEditorApi();
  const activeTool = useLinghuiCanvasStore(state => state.activeNodeTool);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const isCompactStaticToolbar = variant === 'static';
  const hiddenToolSet = useMemo(() => new Set(hiddenTools), [hiddenTools]);

  const fireImageTool = (tool: LinghuiImageToolKey) => {
    interactionApi.openImageToolPanel(nodeId, tool);
    setOpenDropdown(null);
  };

  const stopBubble = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  // 宫格切分前的剧情编辑（用户要求）：preset 不再直接派生，先开 Modal 让用户补充剧情，
  // 确认后再用合并的 promptSnippet 走 onApplyImageToolPreset。
  const [pendingGridPreset, setPendingGridPreset] = useState<LinghuiImageNineGridPresetDef | null>(null);
  const openGridStoryComposer = (preset: LinghuiImageNineGridPresetDef) => {
    setPendingGridPreset(preset);
    setOpenDropdown(null);
  };
  const handleConfirmGridStory = (preset: LinghuiImageNineGridPresetDef, mergedPromptSnippet: string) => {
    onApplyImageToolPreset?.({
      label: preset.label,
      promptSnippet: mergedPromptSnippet,
      properties: preset.properties,
    });
    setPendingGridPreset(null);
  };
  const handleCancelGridStory = () => setPendingGridPreset(null);

  const openGridSplit = (gridType: '2x2' | '3x3' | '4x4' | '5x5') => {
    onSetGridSplitType?.(gridType);
    onClearGridSplitCells?.();
    fireImageTool('grid-split');
  };

  // LibTV 1:1：高清 ▼ 2x/4x 直接派生高清节点（本地 FFmpeg）
  const upscaleMenuItems = buildUpscaleMenuItems({
    nodeId,
    onExecuteImageUpscale,
    closeDropdown: () => setOpenDropdown(null),
  });
  const gridSplitMenuItems = buildGridSplitMenuItems({ openGridSplit });
  const nineGridMenuItems = buildNineGridMenuItems({
    presets: LINGHUI_IMAGE_NINE_GRID_PRESETS,
    openGridStoryComposer,
  });
  const editMenuItems = buildEditMenuItems({ fireImageTool });
  const moreMenuItems = buildMoreMenuItems({
    hiddenToolSet,
    nineGridMenuItems,
    upscaleMenuItems,
    gridSplitMenuItems,
    fireImageTool,
  });

  return (
    <>
    <LinghuiGridSplitStoryComposer
      preset={pendingGridPreset}
      onConfirm={handleConfirmGridStory}
      onCancel={handleCancelGridStory}
    />
    <div
      className={`linghuiImageFloatingToolbar nodrag nopan nowheel ${variant === 'static' ? 'isStatic' : ''}`}
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
      onClick={stopBubble}
    >
      <button
        type="button"
        className="linghuiImageFloatingToolbarChip isHero"
        aria-label="全景"
        onClick={() => {
          if (isPanorama) {
            onFullscreen?.();
          } else {
            onCreatePanoramaPreview?.(nodeId);
          }
        }}
      >
        <ImageIcon size={16} className="linghuiImageFloatingToolbarChipIcon" />
        <span>全景</span>
        <span className="linghuiImageFloatingToolbarBadge isNew">NEW</span>
      </button>

      <button
        type="button"
        className={`linghuiImageFloatingToolbarChip ${isActiveTool(activeTool, nodeId, 'multi-angle') ? 'isActive' : ''}`}
        aria-label="多角度"
        onClick={() => fireImageTool('multi-angle')}
      >
        <Scan size={16} className="linghuiImageFloatingToolbarChipIcon" />
        <span>多角度</span>
      </button>

      <button
        type="button"
        className={`linghuiImageFloatingToolbarChip ${isActiveTool(activeTool, nodeId, 'relight') ? 'isActive' : ''}`}
        aria-label="打光"
        onClick={() => fireImageTool('relight')}
      >
        <Sun size={16} className="linghuiImageFloatingToolbarChipIcon" />
        <span>打光</span>
      </button>

      {!isCompactStaticToolbar && (
        <div className="linghuiImageFloatingToolbarDivider" aria-hidden="true" />
      )}

      {!isCompactStaticToolbar && (
        <>
          <Dropdown
            trigger={['click']}
            getPopupContainer={getToolbarDropdownContainer}
            classNames={{ root: 'linghuiImageToolbarDropdown' }}
            menu={createToolbarMenu(nineGridMenuItems)}
            open={openDropdown === 'nine-grid'}
            onOpenChange={(open) => setOpenDropdown(open ? 'nine-grid' : null)}
          >
            <button
              type="button"
              className="linghuiImageFloatingToolbarChip isPrimary"
              aria-label="九宫格"
              onClick={stopBubble}
            >
              <TableProperties size={16} className="linghuiImageFloatingToolbarChipIcon" />
              <span>九宫格</span>
              <ChevronDown size={13} className="linghuiImageFloatingToolbarChipCaret" />
            </button>
          </Dropdown>

          <Dropdown
            trigger={['click']}
            getPopupContainer={getToolbarDropdownContainer}
            classNames={{ root: 'linghuiImageToolbarDropdown' }}
            menu={createToolbarMenu(upscaleMenuItems)}
            open={openDropdown === 'upscale'}
            onOpenChange={(open) => setOpenDropdown(open ? 'upscale' : null)}
          >
            <button
              type="button"
              className={`linghuiImageFloatingToolbarChip ${isActiveTool(activeTool, nodeId, 'upscale') ? 'isActive' : ''}`}
              aria-label="高清"
              onClick={stopBubble}
            >
              <span className="linghuiImageFloatingToolbarChipBadgeLabel">HD</span>
              <span>高清</span>
              <ChevronDown size={13} className="linghuiImageFloatingToolbarChipCaret" />
            </button>
          </Dropdown>

          <Dropdown
            trigger={['click']}
            getPopupContainer={getToolbarDropdownContainer}
            classNames={{ root: 'linghuiImageToolbarDropdown' }}
            menu={createToolbarMenu(gridSplitMenuItems)}
            open={openDropdown === 'grid-split'}
            onOpenChange={(open) => setOpenDropdown(open ? 'grid-split' : null)}
          >
            <button
              type="button"
              className={`linghuiImageFloatingToolbarChip ${isActiveTool(activeTool, nodeId, 'grid-split') ? 'isActive' : ''}`}
              aria-label="宫格切分"
              onClick={stopBubble}
            >
              <TableProperties size={14} className="linghuiImageFloatingToolbarChipIcon" />
              <span>宫格切分</span>
              <ChevronDown size={12} className="linghuiImageFloatingToolbarChipCaret" />
            </button>
          </Dropdown>
        </>
      )}

      <div className="linghuiImageFloatingToolbarDivider" aria-hidden="true" />

      <Dropdown
        trigger={['click']}
        getPopupContainer={getToolbarDropdownContainer}
        classNames={{ root: 'linghuiImageToolbarDropdown' }}
        menu={createToolbarMenu(editMenuItems)}
        open={openDropdown === 'edit'}
        onOpenChange={(open) => setOpenDropdown(open ? 'edit' : null)}
      >
        <button
          type="button"
          className={`linghuiImageFloatingToolbarChip ${PRIMARY_TOOL_KEYS.some(tool => isActiveTool(activeTool, nodeId, tool)) ? 'isActive' : ''}`}
          aria-label="重绘"
          onClick={stopBubble}
        >
          <Repeat size={16} className="linghuiImageFloatingToolbarChipIcon" />
          <span>重绘</span>
          <ChevronDown size={13} className="linghuiImageFloatingToolbarChipCaret" />
        </button>
      </Dropdown>

      {isCompactStaticToolbar ? (
        <Dropdown
          trigger={['click']}
          getPopupContainer={getToolbarDropdownContainer}
          classNames={{ root: 'linghuiImageToolbarDropdown' }}
          menu={createToolbarMenu(moreMenuItems)}
          open={openDropdown === 'more'}
          onOpenChange={(open) => setOpenDropdown(open ? 'more' : null)}
        >
          <button
            type="button"
            className={`linghuiImageFloatingToolbarChip ${
              ['focus', 'mark', 'upscale', 'grid-split'].some(tool => isActiveTool(activeTool, nodeId, tool as LinghuiImageToolKey)) ? 'isActive' : ''
            }`}
            aria-label="更多"
            onClick={stopBubble}
          >
            <Layers size={14} className="linghuiImageFloatingToolbarChipIcon" />
            <span>更多</span>
            <ChevronDown size={12} className="linghuiImageFloatingToolbarChipCaret" />
          </button>
        </Dropdown>
      ) : (
        <>
          {ICON_ONLY_TOOLS.map(tool => (
            <button
              key={tool.key}
              type="button"
              className={`linghuiImageFloatingToolbarChip isIcon ${isActiveTool(activeTool, nodeId, tool.key) ? 'isActive' : ''}`}
              aria-label={tool.label}
              title={tool.label}
              onClick={() => fireImageTool(tool.key)}
            >
              {tool.icon}
            </button>
          ))}

          <button
            type="button"
            className="linghuiImageFloatingToolbarChip isIcon isPlaceholder"
            aria-label="旋转"
            title="旋转（待接入）"
            disabled
          >
            <RotateCw size={14} />
            <Sparkles size={10} className="linghuiImageFloatingToolbarChipHintIcon" />
          </button>
        </>
      )}

      {/* 下载 */}
      <button
        type="button"
        className={`linghuiImageFloatingToolbarChip isIcon ${primarySource ? '' : 'isPlaceholder'}`}
        aria-label="下载"
        title="下载"
        disabled={!primarySource}
        onClick={() => onDownload?.()}
      >
        <Download size={14} />
      </button>

      {/* 全屏 */}
      <button
        type="button"
        className={`linghuiImageFloatingToolbarChip isIcon ${primarySource ? '' : 'isPlaceholder'}`}
        aria-label="全屏"
        title="全屏"
        disabled={!primarySource}
        onClick={() => onFullscreen?.()}
      >
        <Expand size={14} />
      </button>

    </div>
    </>
  );
};
