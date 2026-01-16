/**
 * 编辑器侧边栏
 * 资源库/属性面板切换
 */
import React, { useState } from 'react';
import { Tabs, Empty } from 'antd';
import {
  FolderOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { Asset, Clip, Timeline } from '../../types';
import PropertiesPanel from './PropertiesPanel';

interface SidebarProps {
  assets: Asset[];
  selectedClip: Clip | null;
  timeline: Timeline | null;
  onClipChange: (clip: Clip) => void;
  onAssetDragStart: (asset: Asset) => void;
}

export function Sidebar({
  assets,
  selectedClip,
  timeline,
  onClipChange,
  onAssetDragStart,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState('assets');

  return (
    <div style={styles.container}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        centered
        items={[
          {
            key: 'assets',
            label: (
              <span>
                <FolderOutlined /> 素材
              </span>
            ),
            children: (
              <AssetList
                assets={assets}
                onDragStart={onAssetDragStart}
              />
            ),
          },
          {
            key: 'properties',
            label: (
              <span>
                <SettingOutlined /> 属性
              </span>
            ),
            children: (
              <PropertiesPanel
                clip={selectedClip}
                timeline={timeline}
                onChange={onClipChange}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

interface AssetListProps {
  assets: Asset[];
  onDragStart: (asset: Asset) => void;
}

function AssetList({ assets, onDragStart }: AssetListProps) {
  if (assets.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无素材"
        style={{ marginTop: 40 }}
      />
    );
  }

  // 按类型分组
  const videoAssets = assets.filter((a) => a.type === 'video');
  const audioAssets = assets.filter((a) => a.type === 'audio');
  const imageAssets = assets.filter((a) => a.type === 'image');

  return (
    <div style={styles.assetList}>
      {videoAssets.length > 0 && (
        <AssetGroup title="视频" assets={videoAssets} onDragStart={onDragStart} />
      )}
      {imageAssets.length > 0 && (
        <AssetGroup title="图片" assets={imageAssets} onDragStart={onDragStart} />
      )}
      {audioAssets.length > 0 && (
        <AssetGroup title="音频" assets={audioAssets} onDragStart={onDragStart} />
      )}
    </div>
  );
}

function AssetGroup({
  title,
  assets,
  onDragStart,
}: {
  title: string;
  assets: Asset[];
  onDragStart: (asset: Asset) => void;
}) {
  return (
    <div style={styles.assetGroup}>
      <div style={styles.groupTitle}>{title}</div>
      <div style={styles.assetGrid}>
        {assets.map((asset) => (
          <div
            key={asset.id}
            style={styles.assetItem}
            draggable
            onDragStart={() => onDragStart(asset)}
          >
            {asset.thumbnailPath ? (
              <img
                src={asset.thumbnailPath}
                alt={asset.name}
                style={styles.thumbnail}
              />
            ) : (
              <div style={styles.placeholder}>
                {getAssetIcon(asset.type)}
              </div>
            )}
            <span style={styles.assetName}>{asset.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getAssetIcon(type: string): string {
  switch (type) {
    case 'video': return '🎬';
    case 'audio': return '🎵';
    case 'image': return '🖼️';
    default: return '📄';
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 280,
    background: '#18181b',
    borderLeft: '1px solid #27272a',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  assetList: {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
  },
  assetGroup: {
    marginBottom: 16,
  },
  groupTitle: {
    fontSize: 12,
    color: '#71717a',
    marginBottom: 8,
    paddingLeft: 4,
  },
  assetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  },
  assetItem: {
    background: '#27272a',
    borderRadius: 6,
    overflow: 'hidden',
    cursor: 'grab',
    transition: 'transform 0.1s',
  },
  thumbnail: {
    width: '100%',
    aspectRatio: '16/9',
    objectFit: 'cover',
  },
  placeholder: {
    width: '100%',
    aspectRatio: '16/9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#3f3f46',
    fontSize: 24,
  },
  assetName: {
    display: 'block',
    padding: '4px 6px',
    fontSize: 11,
    color: '#d4d4d8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

export default Sidebar;
