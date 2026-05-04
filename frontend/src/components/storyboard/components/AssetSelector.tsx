/**
 * 分镜资产选择器（纵向条目版）
 *
 * 设计目标：
 * - 每个资产占独立一行：左侧头像（小方形），右侧名称
 * - 选中态用边框 + 主色背景高亮，再次点击取消
 * - 鼠标悬浮显示富详情卡片（与提示词编辑器 @mention 悬浮一致：预览图 + 名称 + 描述 + ID）
 * - 没有"+ 添加"入口（资产管理在专属面板做）；本组件只做"勾选 / 取消"
 */
import React from 'react';
import { Popover, Avatar } from 'antd';
import { UserOutlined, EnvironmentOutlined, ToolOutlined } from '@ant-design/icons';
import { electronService } from '../../../services/electronService';
import type { StoredMediaAsset } from '../../../types';
import { getMediaAssetDisplaySource } from '../../../types';

type AssetType = 'character' | 'scene' | 'prop';

interface Asset {
  id: string;
  name: string;
  description?: string;
  cover?: string;
  avatar?: string;
  media?: {
    costumePhoto?: StoredMediaAsset;
    previewImage?: StoredMediaAsset;
  };
}

interface AssetSelectorProps {
  type: AssetType;
  selectedIds: string[];
  allAssets: Asset[];
  onChange: (ids: string[]) => void;
}

const CONFIG: Record<AssetType, { label: string; icon: React.ReactNode; color: string; selectedRing: string; selectedBg: string; typeColor: string }> = {
  character: {
    label: '角色',
    icon: <UserOutlined />,
    color: 'text-status-info',
    selectedRing: 'border-status-info',
    selectedBg: 'bg-status-info/10',
    typeColor: 'status-info',
  },
  scene: {
    label: '场景',
    icon: <EnvironmentOutlined />,
    color: 'text-status-success',
    selectedRing: 'border-status-success',
    selectedBg: 'bg-status-success/10',
    typeColor: 'status-success',
  },
  prop: {
    label: '道具',
    icon: <ToolOutlined />,
    color: 'text-status-warning',
    selectedRing: 'border-status-warning',
    selectedBg: 'bg-status-warning/10',
    typeColor: 'status-warning',
  },
};

function getAssetImage(asset: Asset): string | undefined {
  const src = getMediaAssetDisplaySource(asset.media?.costumePhoto)
    || getMediaAssetDisplaySource(asset.media?.previewImage)
    || asset.cover
    || asset.avatar;
  if (!src) return undefined;
  if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src;
  return electronService.fs.toLocalUrl(src);
}

/** 悬浮详情卡片（与 @mention 悬浮风格一致） */
function AssetDetailContent({ asset, type }: { asset: Asset; type: AssetType }) {
  const config = CONFIG[type];
  const img = getAssetImage(asset);
  return (
    <div className="w-[260px] p-1">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`px-1.5 py-0.5 rounded text-[11px] bg-${config.typeColor}/15 text-${config.typeColor}`}
        >
          {config.label}
        </span>
        <span className="font-medium text-text-primary text-sm">{asset.name}</span>
      </div>
      {img && (
        <img
          src={img}
          alt={asset.name}
          className="w-full max-h-[150px] object-cover rounded mb-2"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      {asset.description && (
        <div className="text-xs text-text-secondary leading-relaxed mb-2">
          {asset.description}
        </div>
      )}
      <div className="text-[10px] text-text-muted font-mono">ID: {asset.id}</div>
    </div>
  );
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  type,
  selectedIds,
  allAssets,
  onChange,
}) => {
  const config = CONFIG[type];

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="flex flex-col gap-1 py-1">
      {/* 分类标题 */}
      <div className={`text-[10px] ${config.color} flex items-center gap-1 opacity-70 px-0.5`}>
        {config.icon}
        <span>{config.label}</span>
        <span className="text-text-muted">· {allAssets.length}</span>
      </div>

      {allAssets.length === 0 ? (
        <div className="text-[10px] text-text-muted px-1 py-0.5">暂无{config.label}</div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {allAssets.map(asset => {
            const selected = selectedIds.includes(asset.id);
            const img = getAssetImage(asset);
            return (
              <Popover
                key={asset.id}
                content={<AssetDetailContent asset={asset} type={type} />}
                trigger="hover"
                mouseEnterDelay={0.3}
                placement="left"
                overlayClassName="asset-detail-popover"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSelection(asset.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSelection(asset.id);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-1 py-0.5 rounded border transition-colors cursor-pointer text-xs select-none ${
                    selected
                      ? `${config.selectedRing} ${config.selectedBg} text-text-primary`
                      : 'border-transparent hover:border-border-subtle hover:bg-bg-hover/30 text-text-secondary'
                  }`}
                >
                  <Avatar
                    size={20}
                    shape="square"
                    src={img}
                    icon={!img && config.icon}
                    className="flex-shrink-0 !rounded"
                  />
                  <span className="truncate flex-1 min-w-0" title={asset.name}>
                    {asset.name}
                  </span>
                </div>
              </Popover>
            );
          })}
        </div>
      )}
    </div>
  );
};
