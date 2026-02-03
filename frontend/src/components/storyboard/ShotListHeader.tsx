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
  generatingPrompts: boolean;
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
  onAddShot: () => void;
  onBatchDelete: () => void;
}

export const ShotListHeader: React.FC<ShotListHeaderProps> = ({
  totalCount,
  selectedCount,
  isAllSelected,
  isIndeterminate,
  generatingPrompts,
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
  onAddShot,
  onBatchDelete,
}) => {
  const { t } = useTranslation();
  const cellClass = "px-2 py-1.5 text-xs font-medium text-zinc-400 border-r border-zinc-800 flex items-center";

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

  const videoMenuItems: MenuProps['items'] = [
    { key: 'gen', label: t('storyboard.generateConfirmed'), onClick: onBatchVideos },
    { key: 'regen', label: t('storyboard.regenerateAll'), onClick: onBatchReVideos },
  ];

  const hasSelected = selectedCount > 0;
  const targetLabel = hasSelected ? `(${selectedCount})` : '';

  return (
    <div className="sticky top-0 z-20 flex items-stretch bg-zinc-900 border-b border-zinc-700 w-full">
      {/* 操作列 - 全选 + 批量删除 */}
      <div className={`${COL_ACTION_WIDTH} shrink-0 border-r border-zinc-800 flex flex-col items-center justify-center gap-0.5 py-1`}>
        <Tooltip title={isAllSelected ? t('storyboard.deselectAll') : `${t('storyboard.selectAll')} (${totalCount})`}>
          <Checkbox
            checked={isAllSelected}
            indeterminate={isIndeterminate}
            onChange={(e) => onSelectAll(e.target.checked)}
          />
        </Tooltip>
        {hasSelected && (
          <Popconfirm title={`${t('storyboard.deleteSelected')} ${selectedCount} ${t('storyboard.selectedCount')}?`} onConfirm={onBatchDelete} placement="right">
            <Button type="text" danger size="small" className="w-5 h-5 p-0" icon={<DeleteOutlined className="text-[10px]" />} />
          </Popconfirm>
        )}
      </div>

      {/* 剧本 */}
      <div className={`${SHOT_LAYOUT.colScript} ${cellClass}`}>{t('storyboard.script')}</div>

      {/* 资产 */}
      <div className={`${SHOT_LAYOUT.colAssets} ${cellClass}`}>{t('storyboard.assets')}</div>

      {/* 图像设计 + 批量生成 */}
      <div className={`${SHOT_LAYOUT.colImageDesign} ${cellClass} justify-between`}>
        <span>{t('storyboard.imageDesign')}</span>
        <Dropdown menu={{ items: imagePromptMenuItems }} trigger={['click']}>
          <Button
            type="text"
            size="small"
            className="h-5 px-1 text-[10px]"
            icon={<ThunderboltOutlined />}
            loading={generatingPrompts}
          >
            AI{targetLabel} <DownOutlined className="text-[8px]" />
          </Button>
        </Dropdown>
      </div>

      {/* 图像结果 + 批量生成 */}
      <div className={`${SHOT_LAYOUT.colImageResult} ${cellClass} justify-between`}>
        <span>{t('storyboard.image')}</span>
        <Dropdown menu={{ items: imageMenuItems }} trigger={['click']}>
          <Button
            type="text"
            size="small"
            className="h-5 px-1 text-[10px]"
            icon={<PictureOutlined />}
            loading={generatingImages}
          >
            {targetLabel} <DownOutlined className="text-[8px]" />
          </Button>
        </Dropdown>
      </div>

      {/* 视频设计 + 批量生成 */}
      <div className={`${SHOT_LAYOUT.colVideoDesign} ${cellClass} justify-between`}>
        <span>{t('storyboard.videoDesign')}</span>
        <Dropdown menu={{ items: videoPromptMenuItems }} trigger={['click']}>
          <Button
            type="text"
            size="small"
            className="h-5 px-1 text-[10px]"
            icon={<ThunderboltOutlined />}
            loading={generatingPrompts}
          >
            AI{targetLabel} <DownOutlined className="text-[8px]" />
          </Button>
        </Dropdown>
      </div>

      {/* 视频结果 + 批量生成 + 添加按钮 */}
      <div className={`${SHOT_LAYOUT.colVideoResult} ${cellClass} border-r-0 justify-between`}>
        <span>{t('storyboard.video')}</span>
        <div className="flex items-center gap-0.5">
          <Dropdown menu={{ items: videoMenuItems }} trigger={['click']}>
            <Button
              type="text"
              size="small"
              className="h-5 px-1 text-[10px]"
              icon={<VideoCameraOutlined />}
              loading={generatingVideos}
            >
              {targetLabel} <DownOutlined className="text-[8px]" />
            </Button>
          </Dropdown>
          <Tooltip title={t('storyboard.addShot')}>
            <Button
              type="text"
              size="small"
              className="h-5 w-5 p-0"
              icon={<PlusOutlined />}
              onClick={onAddShot}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
