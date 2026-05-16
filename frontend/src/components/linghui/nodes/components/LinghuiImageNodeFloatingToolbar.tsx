import React, { useState } from 'react';
import {
  ChevronDown,
  Crop,
  Download,
  Eraser,
  Expand,
  Focus,
  Frame,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Pencil,
  Repeat,
  RotateCw,
  Scan,
  Scissors,
  Sparkles,
  Sun,
  TableProperties,
  Type,
} from 'lucide-react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import type {
  LinghuiImageToolKey,
  LinghuiNodeToolState,
} from '../../../../types/linghui';
import {
  useLinghuiNodeEditorApi,
  useLinghuiNodeInteractionApi,
} from '../state/LinghuiNodeRunsContext';
import { useLinghuiCanvasStore } from '../../canvas/state/linghuiCanvasStore';
import {
  LINGHUI_IMAGE_TOOL_PRESETS,
  LINGHUI_IMAGE_TOOLS_WITH_PRESETS,
} from '../../editors/state/linghuiImageToolPresets';

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
}

interface ToolEntry {
  key: LinghuiImageToolKey;
  label: string;
  icon: React.ReactNode;
}

const PRIMARY_TOOLS: ToolEntry[] = [
  { key: 'multi-angle', label: '多角度', icon: <Scan size={14} /> },
  { key: 'outpaint', label: '扩图', icon: <Maximize2 size={14} /> },
  { key: 'relight', label: '打光', icon: <Sun size={14} /> },
  { key: 'repaint', label: '重绘', icon: <Repeat size={14} /> },
  { key: 'erase', label: '擦除', icon: <Eraser size={14} /> },
  { key: 'remove-bg', label: '抠图', icon: <Scissors size={14} /> },
  { key: 'crop', label: '裁剪', icon: <Crop size={14} /> },
  { key: 'mockup', label: 'Mockup', icon: <Layers size={14} /> },
  { key: 'edit-elements', label: '元素', icon: <Frame size={14} /> },
  { key: 'edit-texts', label: '文字', icon: <Type size={14} /> },
];

const ICON_ONLY_TOOLS: ToolEntry[] = [
  { key: 'focus', label: '聚焦', icon: <Focus size={14} /> },
  { key: 'mark', label: '标记', icon: <Pencil size={14} /> },
];

function isActiveTool(activeTool: LinghuiNodeToolState | null | undefined, nodeId: string, tool: LinghuiImageToolKey): boolean {
  if (!activeTool || activeTool.kind !== 'image') return false;
  return activeTool.nodeId === nodeId && activeTool.tool === tool;
}

export const LinghuiImageNodeFloatingToolbar: React.FC<LinghuiImageNodeFloatingToolbarProps> = ({
  nodeId,
  isPanorama,
  primarySource,
  onDownload,
  onFullscreen,
  variant = 'floating',
}) => {
  const interactionApi = useLinghuiNodeInteractionApi();
  const { onApplyImageToolPreset, onExecuteImageUpscale } = useLinghuiNodeEditorApi();
  const activeTool = useLinghuiCanvasStore(state => state.activeNodeTool);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const fireImageTool = (tool: LinghuiImageToolKey) => {
    interactionApi.openImageToolPanel(nodeId, tool);
    setOpenDropdown(null);
  };

  const stopBubble = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const dropdownContainer = (triggerNode: HTMLElement) => (
    triggerNode.closest('.linghuiImageFloatingToolbar') as HTMLElement | null
    ?? triggerNode.parentElement
    ?? triggerNode.ownerDocument.body
  );

  /** LibTV 1:1：扩图/打光/重绘等 AI 工具 preset 修改当前节点 prompt 并自动运行 */
  const fireAIPreset = (preset: typeof LINGHUI_IMAGE_TOOL_PRESETS[LinghuiImageToolKey]['presets'][number]) => {
    onApplyImageToolPreset?.({
      label: preset.label,
      promptSnippet: preset.promptSnippet,
      properties: preset.properties,
    });
    setOpenDropdown(null);
  };

  const buildToolPresetsMenu = (tool: LinghuiImageToolKey): MenuProps['items'] =>
    LINGHUI_IMAGE_TOOL_PRESETS[tool].presets.map((p, i) => ({
      key: `${tool}-${i}`,
      label: p.label,
      onClick: ({ domEvent }) => { domEvent.stopPropagation(); fireAIPreset(p); },
    }));

  // LibTV 1:1：高清 ▼ 2x/4x 直接派生高清节点（本地 FFmpeg）
  const upscaleMenuItems: MenuProps['items'] = [
    {
      key: 'upscale-2x',
      label: '2 倍高清',
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onExecuteImageUpscale?.(nodeId, { factor: 2 });
        setOpenDropdown(null);
      },
    },
    {
      key: 'upscale-4x',
      label: '4 倍高清',
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onExecuteImageUpscale?.(nodeId, { factor: 4 });
        setOpenDropdown(null);
      },
    },
  ];

  const gridSplitMenuItems: MenuProps['items'] = [
    { key: 'split-2x2', label: '4 宫格 (2×2)', onClick: ({ domEvent }) => { domEvent.stopPropagation(); fireImageTool('grid-split'); } },
    { key: 'split-3x3', label: '9 宫格 (3×3)', onClick: ({ domEvent }) => { domEvent.stopPropagation(); fireImageTool('grid-split'); } },
    { key: 'split-4x4', label: '16 宫格 (4×4)', onClick: ({ domEvent }) => { domEvent.stopPropagation(); fireImageTool('grid-split'); } },
    { key: 'split-5x5', label: '25 宫格 (5×5)', onClick: ({ domEvent }) => { domEvent.stopPropagation(); fireImageTool('grid-split'); } },
  ];

  return (
    <div
      className={`linghuiImageFloatingToolbar nodrag nopan nowheel ${variant === 'static' ? 'isStatic' : ''}`}
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
      onClick={stopBubble}
    >
      {/* 高清 ▼ */}
      <Dropdown
        trigger={['click']}
        getPopupContainer={dropdownContainer}
        menu={{ items: upscaleMenuItems }}
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
          <ChevronDown size={12} className="linghuiImageFloatingToolbarChipCaret" />
        </button>
      </Dropdown>

      {PRIMARY_TOOLS.map(tool => {
        const isActive = isActiveTool(activeTool, nodeId, tool.key);
        const hasPresets = LINGHUI_IMAGE_TOOLS_WITH_PRESETS.includes(tool.key);

        if (hasPresets) {
          // LibTV 1:1：扩图/打光/重绘/擦除/抠图/裁剪/Mockup/元素/文字 弹 preset 二级菜单，
          // 选 preset 修改当前节点 prompt + 属性 → 自动运行当前节点。不创建下游节点。
          return (
            <Dropdown
              key={tool.key}
              trigger={['click']}
              getPopupContainer={dropdownContainer}
              menu={{ items: buildToolPresetsMenu(tool.key) }}
              open={openDropdown === tool.key}
              onOpenChange={(open) => setOpenDropdown(open ? tool.key : null)}
            >
              <button
                type="button"
                className={`linghuiImageFloatingToolbarChip ${isActive ? 'isActive' : ''}`}
                aria-label={tool.label}
                onClick={stopBubble}
              >
                <span className="linghuiImageFloatingToolbarChipIcon">{tool.icon}</span>
                <span>{tool.label}</span>
                <ChevronDown size={12} className="linghuiImageFloatingToolbarChipCaret" />
              </button>
            </Dropdown>
          );
        }

        // 多角度：单按钮打开面板（multi-angle 面板有专用 UI 配置）。
        return (
          <button
            key={tool.key}
            type="button"
            className={`linghuiImageFloatingToolbarChip ${isActive ? 'isActive' : ''}`}
            aria-label={tool.label}
            onClick={() => fireImageTool(tool.key)}
          >
            <span className="linghuiImageFloatingToolbarChipIcon">{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        );
      })}

      {/* 宫格切分 ▼ */}
      <Dropdown
        trigger={['click']}
        getPopupContainer={dropdownContainer}
        menu={{ items: gridSplitMenuItems }}
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

      <div className="linghuiImageFloatingToolbarDivider" aria-hidden="true" />

      {/* 聚焦 / 标记 */}
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

      {/* 全景 [NEW] */}
      <button
        type="button"
        className="linghuiImageFloatingToolbarChip"
        aria-label="全景"
        onClick={() => {
          if (isPanorama) {
            onFullscreen?.();
          } else {
            interactionApi.openImageToolPanel(nodeId, 'multi-angle');
          }
        }}
      >
        <ImageIcon size={14} className="linghuiImageFloatingToolbarChipIcon" />
        <span>全景</span>
        <span className="linghuiImageFloatingToolbarBadge isNew">NEW</span>
      </button>

      {/* 旋转 — LibTV 是图片旋转处理，灵绘暂无后端，disabled */}
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
  );
};
