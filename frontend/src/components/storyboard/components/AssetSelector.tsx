/**
 * 资产卡片选择器
 * 显示已选头像 + Popover 网格选择
 */
import React from 'react';
import { Popover, Tooltip, Avatar } from 'antd';
import { PlusOutlined, UserOutlined, EnvironmentOutlined, ToolOutlined } from '@ant-design/icons';
import { electronService } from '../../../services/electronService';

type AssetType = 'character' | 'scene' | 'prop';

interface Asset {
  id: string;
  name: string;
  cover?: string;
  avatar?: string;
}

interface AssetSelectorProps {
  type: AssetType;
  selectedIds: string[];
  allAssets: Asset[];
  onChange: (ids: string[]) => void;
}

const CONFIG: Record<AssetType, { label: string; icon: React.ReactNode; color: string }> = {
  character: { label: '角色', icon: <UserOutlined />, color: 'text-blue-400' },
  scene: { label: '场景', icon: <EnvironmentOutlined />, color: 'text-green-400' },
  prop: { label: '道具', icon: <ToolOutlined />, color: 'text-orange-400' },
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
    const src = asset.cover || asset.avatar;
    return src ? electronService.fs.toLocalUrl(src) : undefined;
  };

  const content = (
    <div className="w-[280px] max-h-[300px] overflow-y-auto custom-scrollbar">
      {allAssets.length === 0 ? (
        <div className="py-8 text-center text-zinc-500 text-xs">暂无{config.label}</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 p-1">
          {allAssets.map(asset => (
            <div
              key={asset.id}
              className={`cursor-pointer rounded border p-1.5 transition-colors ${
                selectedIds.includes(asset.id)
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-zinc-700 hover:border-zinc-500'
              }`}
              onClick={() => toggleSelection(asset.id)}
            >
              <div className="aspect-square bg-zinc-800 rounded overflow-hidden mb-1">
                {getAssetImage(asset) ? (
                  <img src={getAssetImage(asset)} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    {config.icon}
                  </div>
                )}
              </div>
              <div className="text-[10px] truncate text-center text-zinc-300">{asset.name}</div>
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
                <div className="text-[10px] text-zinc-400">点击取消选择</div>
              </div>
            }
            key={asset.id}
          >
            <Avatar
              size={28}
              src={getAssetImage(asset)}
              icon={!getAssetImage(asset) && config.icon}
              className="border border-zinc-700 cursor-pointer hover:border-blue-400 hover:scale-110 transition-all"
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
          <div className="w-7 h-7 rounded-full border border-dashed border-zinc-600 flex items-center justify-center cursor-pointer hover:border-zinc-400 text-zinc-500 hover:text-zinc-300 transition-colors">
            <PlusOutlined style={{ fontSize: 11 }} />
          </div>
        </Popover>
      </div>
    </div>
  );
};
