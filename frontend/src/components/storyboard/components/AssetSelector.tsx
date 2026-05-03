/**
 * 资产卡片选择器
 * 显示已选头像 + Popover 网格选择
 */
import React from 'react';
import { Popover, Tooltip, Avatar } from 'antd';
import { PlusOutlined, UserOutlined, EnvironmentOutlined, ToolOutlined } from '@ant-design/icons';
import { electronService } from '../../../services/electronService';
import type { StoredMediaAsset } from '../../../types';
import { getMediaAssetDisplaySource } from '../../../types';

type AssetType = 'character' | 'scene' | 'prop';

interface Asset {
  id: string;
  name: string;
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

const CONFIG: Record<AssetType, { label: string; icon: React.ReactNode; color: string }> = {
  character: { label: '角色', icon: <UserOutlined />, color: 'text-status-info' },
  scene: { label: '场景', icon: <EnvironmentOutlined />, color: 'text-status-success' },
  prop: { label: '道具', icon: <ToolOutlined />, color: 'text-status-warning' },
};

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  type,
  selectedIds,
  allAssets,
  onChange,
}) => {
  const config = CONFIG[type];
  const selectedAssets = allAssets.filter(a => selectedIds.includes(a.id));

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const getAssetImage = (asset: Asset) => {
    const src = getMediaAssetDisplaySource(asset.media?.costumePhoto)
      || getMediaAssetDisplaySource(asset.media?.previewImage)
      || asset.cover
      || asset.avatar;
    if (!src) return undefined;
    if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src;
    return electronService.fs.toLocalUrl(src);
  };

  const content = (
    <div className="w-[280px] max-h-[300px] overflow-y-auto custom-scrollbar">
      {allAssets.length === 0 ? (
        <div className="py-8 text-center text-text-tertiary text-xs">暂无{config.label}</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 p-1">
          {allAssets.map(asset => (
            <div
              key={asset.id}
              className={`cursor-pointer rounded border p-1.5 transition-colors ${
                selectedIds.includes(asset.id)
                  ? 'border-status-info bg-status-info/10'
                  : 'border-border hover:border-border'
              }`}
              onClick={() => toggleSelection(asset.id)}
            >
              <div className="aspect-square bg-bg-elevated rounded overflow-hidden mb-1">
                {getAssetImage(asset) ? (
                  <img src={getAssetImage(asset)} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted">
                    {config.icon}
                  </div>
                )}
              </div>
              <div className="text-[10px] truncate text-center text-text-secondary">{asset.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className={`text-[10px] ${config.color} flex items-center gap-1 opacity-70`}>
        {config.icon} {config.label}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {selectedAssets.map(asset => (
          <Tooltip
            title={
              <div className="text-center">
                <div className="font-medium">{asset.name}</div>
                <div className="text-[10px] text-text-secondary">点击取消选择</div>
              </div>
            }
            key={asset.id}
          >
            <Avatar
              size={28}
              src={getAssetImage(asset)}
              icon={!getAssetImage(asset) && config.icon}
              className="border border-border cursor-pointer hover:border-status-info hover:scale-110 transition-all"
              onClick={() => toggleSelection(asset.id)}
            />
          </Tooltip>
        ))}

        <Popover
          content={content}
          trigger="click"
          title={<span className="text-sm">选择{config.label}</span>}
          placement="bottomLeft"
          overlayClassName="asset-selector-popover"
        >
          <div className="w-7 h-7 rounded-full border border-dashed border-border flex items-center justify-center cursor-pointer hover:border-border text-text-tertiary hover:text-text-secondary transition-colors">
            <PlusOutlined className="text-[11px]" />
          </div>
        </Popover>
      </div>
    </div>
  );
};
