/**
 * 分镜列表公共表头
 * 集成全选、批量操作按钮、列标题
 */
import React from 'react';
import { Checkbox, Button, Tooltip, Dropdown, Popconfirm } from 'antd';
import type { MenuProps } from 'antd';
import {
  ThunderboltOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  PlusOutlined,
  DownOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { SHOT_LAYOUT, COL_ACTION_WIDTH } from '../../constants/storyboardConstants';

interface ShotListHeaderProps {
  totalCount: number;
  selectedCount: number;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  /** 图像设计：批量生成/优化 prompt 的运行态 */
  generatingImagePrompts: boolean;
  /** 视频设计：批量生成/优化 prompt 的运行态 */
  generatingVideoPrompts: boolean;
  generatingImages: boolean;
  generatingVideos: boolean;
  onSelectAll: (checked: boolean) => void;
  onBatchPrompts: () => void;
  onBatchRePrompts: () => void;
  onBatchImages: () => void;
  onBatchReImages: () => void;
  onBatchVideos: () => void;
  onBatchReVideos: () => void;
  onBatchVideoPrompts: () => void;
  onBatchReVideoPrompts: () => void;
  onBulkVideoModeChange?: (mode: 'multi-ref' | 'first-frame') => void;
  onAddShot: () => void;
  onBatchDelete: () => void;
}

export const ShotListHeader: React.FC<ShotListHeaderProps> = ({
  totalCount,
  selectedCount,
  isAllSelected,
  isIndeterminate,
  generatingImagePrompts,
  generatingVideoPrompts,
  generatingImages,
  generatingVideos,
  onSelectAll,
  onBatchPrompts,
  onBatchRePrompts,
  onBatchImages,
  onBatchReImages,
  onBatchVideos,
  onBatchReVideos,
  onBatchVideoPrompts,
  onBatchReVideoPrompts,
  onBulkVideoModeChange,
  onAddShot,
  onBatchDelete,
}) => {
  const { t } = useTranslation();
  const cellClass = "px-2 py-1.5 text-xs font-medium text-text-secondary border-r border-border-subtle flex items-center";

  const imagePromptMenuItems: MenuProps['items'] = [
    { key: 'gen', label: t('storyboard.generateEmpty'), onClick: onBatchPrompts },
    { key: 'regen', label: t('storyboard.regenerateAll'), onClick: onBatchRePrompts },
  ];

  const imageMenuItems: MenuProps['items'] = [
    { key: 'gen', label: t('storyboard.generateEmpty'), onClick: onBatchImages },
    { key: 'regen', label: t('storyboard.regenerateAll'), onClick: onBatchReImages },
  ];

  const videoPromptMenuItems: MenuProps['items'] = [
    { key: 'gen', label: t('storyboard.generateEmpty'), onClick: onBatchVideoPrompts },
    { key: 'regen', label: t('storyboard.regenerateAll'), onClick: onBatchReVideoPrompts },
  ];

  const videoModeMenuItems: MenuProps['items'] = [
    {
      key: 'multi-ref',
      label: '全部切到 · 多参模式',
      onClick: () => onBulkVideoModeChange?.('multi-ref'),
    },
    {
      key: 'first-frame',
      label: '全部切到 · 首帧模式',
      onClick: () => onBulkVideoModeChange?.('first-frame'),
    },
  ];

  const videoMenuItems: MenuProps['items'] = [
    { key: 'gen', label: t('storyboard.generateEmpty'), onClick: onBatchVideos },
    { key: 'regen', label: t('storyboard.regenerateAll'), onClick: onBatchReVideos },
  ];

  const hasSelected = selectedCount > 0;
  const targetLabel = hasSelected ? `(${selectedCount})` : '';

  // 把所有批量操作折叠成一个统一菜单（用户偏好：批量先折叠，后续再看）
  const batchAllItems: MenuProps['items'] = [
    {
      key: 'image-prompt',
      label: '图像提示词',
      type: 'group',
      children: [
        { key: 'image-prompt-gen', label: t('storyboard.generateEmpty'), onClick: onBatchPrompts },
        { key: 'image-prompt-regen', label: t('storyboard.regenerateAll'), onClick: onBatchRePrompts },
      ],
    },
    {
      key: 'image',
      label: '图像生成',
      type: 'group',
      children: [
        { key: 'image-gen', label: t('storyboard.generateEmpty'), onClick: onBatchImages },
        { key: 'image-regen', label: t('storyboard.regenerateAll'), onClick: onBatchReImages },
      ],
    },
    {
      key: 'video-prompt',
      label: '视频提示词',
      type: 'group',
      children: [
        { key: 'video-prompt-gen', label: t('storyboard.generateEmpty'), onClick: onBatchVideoPrompts },
        { key: 'video-prompt-regen', label: t('storyboard.regenerateAll'), onClick: onBatchReVideoPrompts },
      ],
    },
    {
      key: 'video',
      label: '视频生成',
      type: 'group',
      children: [
        { key: 'video-gen', label: t('storyboard.generateEmpty'), onClick: onBatchVideos },
        { key: 'video-regen', label: t('storyboard.regenerateAll'), onClick: onBatchReVideos },
      ],
    },
    ...(onBulkVideoModeChange ? [{
      key: 'video-mode',
      label: '视频模式切换',
      type: 'group' as const,
      children: [
        { key: 'mode-multi', label: '全部切到 · 多参模式', onClick: () => onBulkVideoModeChange('multi-ref') },
        { key: 'mode-first', label: '全部切到 · 首帧模式', onClick: () => onBulkVideoModeChange('first-frame') },
      ],
    }] : []),
  ];

  const anyBatchRunning = generatingImagePrompts || generatingVideoPrompts || generatingImages || generatingVideos;

  return (
    <div className="sticky top-0 z-20 flex items-stretch bg-bg-surface border-b border-border w-full">
      {/* 操作列：全选 + 批量删除（hasSelected 时才显示）— 横向更紧凑、视觉锚定在一起 */}
      <div className={`${COL_ACTION_WIDTH} shrink-0 border-r border-border-subtle flex items-center justify-center gap-1.5 py-1.5`}>
        <Tooltip title={isAllSelected ? t('storyboard.deselectAll') : `${t('storyboard.selectAll')} (${totalCount})`}>
          <Checkbox
            checked={isAllSelected}
            indeterminate={isIndeterminate}
            onChange={(e) => onSelectAll(e.target.checked)}
          />
        </Tooltip>
        {hasSelected && (
          <Popconfirm title={`${t('storyboard.deleteSelected')} ${selectedCount} ${t('storyboard.selectedCount')}?`} onConfirm={onBatchDelete} placement="right">
            <Tooltip title={t('storyboard.deleteSelected')}>
              <Button type="text" danger size="small" className="!w-5 !h-5 !p-0" icon={<DeleteOutlined className="text-[11px]" />} />
            </Tooltip>
          </Popconfirm>
        )}
      </div>

      {/* 剧本 */}
      <div className={`${SHOT_LAYOUT.colScript} ${cellClass}`}>{t('storyboard.script')}</div>

      {/* 资产 */}
      <div className={`${SHOT_LAYOUT.colAssets} ${cellClass}`}>{t('storyboard.assets')}</div>

      {/* 媒体（图像设计 / 图像结果 / 视频设计 / 视频结果 已合并到 2×2 grid）+ 折叠批量菜单 + 添加分镜 */}
      <div className={`${SHOT_LAYOUT.colMedia} ${cellClass} border-r-0 justify-between`}>
        <span>媒体（图像 · 视频）</span>
        <div className="flex items-center gap-0.5">
          <Dropdown menu={{ items: batchAllItems }} trigger={['click']} placement="bottomRight">
            <Button
              type="text"
              size="small"
              className="h-5 px-1.5 text-[11px]"
              icon={<ThunderboltOutlined />}
              loading={anyBatchRunning}
            >
              批量{targetLabel} <DownOutlined className="text-[8px]" />
            </Button>
          </Dropdown>
          <Tooltip title={t('storyboard.addShot')}>
            <Button
              type="text"
              size="small"
              className="!w-5 !h-5 !p-0"
              icon={<PlusOutlined />}
              onClick={onAddShot}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
