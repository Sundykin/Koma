/**
 * 编辑器侧边栏
 * 资源库/属性面板切换
 */
import React, { useState, useCallback, useRef } from 'react';
import { Tabs, Empty, Button, Input, Dropdown, Spin, message, Tooltip, Modal, Form, Popover } from 'antd';
import type { MenuProps } from 'antd';
import {
  FolderOutlined,
  SettingOutlined,
  PlusOutlined,
  SearchOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  DeleteOutlined,
  ReloadOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  PictureOutlined,
  EditOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { Asset, Clip, Timeline } from '../../types';
import type { Resource, ResourceType } from '../../types/resource';
import { formatFileSize, formatDuration } from '../../types/resource';
import { useResourceStore } from '../../store/resourceStore';
import { openFileDialog } from '../../services/electronService';
import { PropertiesPanel } from './PropertiesPanel/index';

interface SidebarProps {
  assets: Asset[];
  selectedClip: Clip | null;
  timeline: Timeline | null;
  onClipChange: (clip: Clip) => void;
  onAssetDragStart: (asset: Asset) => void;
  // 新增：资源拖拽到时间线
  onResourceDragStart?: (resource: Resource) => void;
}

export function Sidebar({
  assets,
  selectedClip,
  timeline,
  onClipChange,
  onAssetDragStart,
  onResourceDragStart,
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
              <ResourceLibrary
                legacyAssets={assets}
                onLegacyDragStart={onAssetDragStart}
                onResourceDragStart={onResourceDragStart}
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
            children: <PropertiesPanel />,
          },
        ]}
      />
    </div>
  );
}

// 资源库组件
interface ResourceLibraryProps {
  legacyAssets: Asset[];
  onLegacyDragStart: (asset: Asset) => void;
  onResourceDragStart?: (resource: Resource) => void;
}

function ResourceLibrary({
  legacyAssets,
  onLegacyDragStart,
  onResourceDragStart,
}: ResourceLibraryProps) {
  const {
    filter,
    sort,
    viewMode,
    loading,
    setFilter,
    setViewMode,
    importFiles,
    getFilteredResources,
    removeResource,
    updateResource,
    selectedIds,
    toggleSelection,
    deselectAll,
  } = useResourceStore();

  const [searchValue, setSearchValue] = useState('');
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [infoResource, setInfoResource] = useState<Partial<Resource> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理导入
  const handleImport = useCallback(async () => {
    try {
      const result = await openFileDialog({
        multiple: true,
        filters: [
          { name: '媒体文件', extensions: ['mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'jpg', 'jpeg', 'png', 'gif', 'webp'] },
          { name: '视频', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] },
          { name: '音频', extensions: ['mp3', 'wav', 'ogg', 'aac', 'm4a'] },
          { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
        ],
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const imported = await importFiles(result.filePaths, {
          copyToProject: true,
          extractFrames: true,
          generateWaveform: true,
        });
        if (imported.length > 0) {
          message.success(`成功导入 ${imported.length} 个文件`);
        }
      }
    } catch (err) {
      console.error('[ResourceLibrary] Import failed:', err);
      message.error('导入失败');
    }
  }, [importFiles]);

  // 处理拖放导入
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const filePaths = files.map(f => (f as any).path).filter(Boolean);

    if (filePaths.length > 0) {
      const imported = await importFiles(filePaths, {
        copyToProject: true,
        extractFrames: true,
        generateWaveform: true,
      });
      if (imported.length > 0) {
        message.success(`成功导入 ${imported.length} 个文件`);
      }
    }
  }, [importFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // 处理搜索
  const handleSearch = useCallback((value: string) => {
    setSearchValue(value);
    setFilter({ search: value || undefined });
  }, [setFilter]);

  // 处理类型过滤
  const handleTypeFilter = useCallback((type: ResourceType | undefined) => {
    setFilter({ type });
  }, [setFilter]);

  // 处理删除选中
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;

    for (const id of selectedIds) {
      removeResource(id);
    }
    deselectAll();
    message.success(`已删除 ${selectedIds.size} 个资源`);
  }, [selectedIds, removeResource, deselectAll]);

  // 处理重命名
  const handleRename = useCallback((id: string, newName: string) => {
    updateResource(id, { name: newName });
    message.success('重命名成功');
  }, [updateResource]);

  // 处理删除单个资源
  const handleDelete = useCallback((id: string) => {
    removeResource(id);
    message.success('已删除');
  }, [removeResource]);

  // 显示资源信息
  const handleShowInfo = useCallback((resource: Partial<Resource>) => {
    setInfoResource(resource);
    setInfoModalOpen(true);
  }, []);

  // 获取资源列表
  const resources = getFilteredResources();

  // 合并新旧资源
  const allResources = [
    ...resources,
    // 转换旧资产格式
    ...legacyAssets.map(a => ({
      id: a.id,
      type: a.type as ResourceType,
      name: a.name,
      path: a.path,
      size: a.size,
      duration: a.duration,
      width: a.width,
      height: a.height,
      thumbnailPath: a.thumbnailPath,
      status: 'ready' as const,
      createdAt: a.createdAt,
      updatedAt: a.createdAt,
      refCount: a.refCount,
      _legacy: true, // 标记为旧格式
    })),
  ];

  // 按类型分组
  const videoResources = allResources.filter(r => r.type === 'video');
  const audioResources = allResources.filter(r => r.type === 'audio');
  const imageResources = allResources.filter(r => r.type === 'image');

  return (
    <div
      style={styles.library}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* 工具栏 */}
      <div style={styles.toolbar}>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleImport}
        >
          导入
        </Button>

        <Input
          size="small"
          placeholder="搜索..."
          prefix={<SearchOutlined />}
          value={searchValue}
          onChange={e => handleSearch(e.target.value)}
          style={{ width: 100 }}
          allowClear
        />

        <div style={styles.toolbarRight}>
          {selectedIds.size > 0 && (
            <Tooltip title="删除选中">
              <Button
                size="small"
                icon={<DeleteOutlined />}
                danger
                onClick={handleDeleteSelected}
              />
            </Tooltip>
          )}

          <Tooltip title={viewMode === 'grid' ? '列表视图' : '网格视图'}>
            <Button
              size="small"
              icon={viewMode === 'grid' ? <UnorderedListOutlined /> : <AppstoreOutlined />}
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            />
          </Tooltip>
        </div>
      </div>

      {/* 类型筛选 */}
      <div style={styles.typeFilter}>
        <TypeFilterButton
          active={!filter.type}
          onClick={() => handleTypeFilter(undefined)}
        >
          全部
        </TypeFilterButton>
        <TypeFilterButton
          active={filter.type === 'video'}
          onClick={() => handleTypeFilter('video')}
          icon={<VideoCameraOutlined />}
        >
          视频
        </TypeFilterButton>
        <TypeFilterButton
          active={filter.type === 'audio'}
          onClick={() => handleTypeFilter('audio')}
          icon={<AudioOutlined />}
        >
          音频
        </TypeFilterButton>
        <TypeFilterButton
          active={filter.type === 'image'}
          onClick={() => handleTypeFilter('image')}
          icon={<PictureOutlined />}
        >
          图片
        </TypeFilterButton>
      </div>

      {/* 资源列表 */}
      <div style={styles.resourceList}>
        {loading ? (
          <div style={styles.loading}>
            <Spin />
            <span>处理中...</span>
          </div>
        ) : allResources.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="拖拽或点击导入素材"
            style={{ marginTop: 40 }}
          />
        ) : viewMode === 'grid' ? (
          <>
            {!filter.type && videoResources.length > 0 && (
              <ResourceGroup
                title="视频"
                resources={videoResources}
                viewMode="grid"
                selectedIds={selectedIds}
                onSelect={toggleSelection}
                onDragStart={(r) => {
                  if ((r as any)._legacy) {
                    const asset = legacyAssets.find(a => a.id === r.id);
                    if (asset) onLegacyDragStart(asset);
                  } else if (onResourceDragStart) {
                    onResourceDragStart(r as Resource);
                  }
                }}
                onRename={handleRename}
                onDelete={handleDelete}
                onShowInfo={handleShowInfo}
              />
            )}
            {!filter.type && imageResources.length > 0 && (
              <ResourceGroup
                title="图片"
                resources={imageResources}
                viewMode="grid"
                selectedIds={selectedIds}
                onSelect={toggleSelection}
                onDragStart={(r) => {
                  if ((r as any)._legacy) {
                    const asset = legacyAssets.find(a => a.id === r.id);
                    if (asset) onLegacyDragStart(asset);
                  } else if (onResourceDragStart) {
                    onResourceDragStart(r as Resource);
                  }
                }}
                onRename={handleRename}
                onDelete={handleDelete}
                onShowInfo={handleShowInfo}
              />
            )}
            {!filter.type && audioResources.length > 0 && (
              <ResourceGroup
                title="音频"
                resources={audioResources}
                viewMode="grid"
                selectedIds={selectedIds}
                onSelect={toggleSelection}
                onDragStart={(r) => {
                  if ((r as any)._legacy) {
                    const asset = legacyAssets.find(a => a.id === r.id);
                    if (asset) onLegacyDragStart(asset);
                  } else if (onResourceDragStart) {
                    onResourceDragStart(r as Resource);
                  }
                }}
                onRename={handleRename}
                onDelete={handleDelete}
                onShowInfo={handleShowInfo}
              />
            )}
            {filter.type && (
              <ResourceGroup
                resources={allResources}
                viewMode="grid"
                selectedIds={selectedIds}
                onSelect={toggleSelection}
                onDragStart={(r) => {
                  if ((r as any)._legacy) {
                    const asset = legacyAssets.find(a => a.id === r.id);
                    if (asset) onLegacyDragStart(asset);
                  } else if (onResourceDragStart) {
                    onResourceDragStart(r as Resource);
                  }
                }}
                onRename={handleRename}
                onDelete={handleDelete}
                onShowInfo={handleShowInfo}
              />
            )}
          </>
        ) : (
          <ResourceGroup
            resources={allResources}
            viewMode="list"
            selectedIds={selectedIds}
            onSelect={toggleSelection}
            onDragStart={(r) => {
              if ((r as any)._legacy) {
                const asset = legacyAssets.find(a => a.id === r.id);
                if (asset) onLegacyDragStart(asset);
              } else if (onResourceDragStart) {
                onResourceDragStart(r as Resource);
              }
            }}
            onRename={handleRename}
            onDelete={handleDelete}
            onShowInfo={handleShowInfo}
          />
        )}
      </div>

      {/* 资源信息模态框 */}
      <Modal
        title="资源信息"
        open={infoModalOpen}
        onCancel={() => setInfoModalOpen(false)}
        footer={null}
        width={400}
      >
        {infoResource && (
          <div style={styles.infoContent}>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>名称</span>
              <span style={styles.infoValue}>{infoResource.name}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>类型</span>
              <span style={styles.infoValue}>{infoResource.type}</span>
            </div>
            {infoResource.path && (
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>路径</span>
                <span style={{ ...styles.infoValue, wordBreak: 'break-all', fontSize: 11 }}>
                  {infoResource.path}
                </span>
              </div>
            )}
            {infoResource.size && (
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>大小</span>
                <span style={styles.infoValue}>{formatFileSize(infoResource.size)}</span>
              </div>
            )}
            {infoResource.duration && (
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>时长</span>
                <span style={styles.infoValue}>{formatDuration(infoResource.duration)}</span>
              </div>
            )}
            {infoResource.width && infoResource.height && (
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>分辨率</span>
                <span style={styles.infoValue}>{infoResource.width} × {infoResource.height}</span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// 类型筛选按钮
function TypeFilterButton({
  children,
  active,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      style={{
        ...styles.typeFilterBtn,
        ...(active ? styles.typeFilterBtnActive : {}),
      }}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}

// 资源分组
interface ResourceGroupProps {
  title?: string;
  resources: Array<Partial<Resource> & { _legacy?: boolean }>;
  viewMode: 'grid' | 'list';
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onDragStart: (resource: Partial<Resource>) => void;
  onRename?: (id: string, newName: string) => void;
  onDelete?: (id: string) => void;
  onShowInfo?: (resource: Partial<Resource>) => void;
}

function ResourceGroup({
  title,
  resources,
  viewMode,
  selectedIds,
  onSelect,
  onDragStart,
  onRename,
  onDelete,
  onShowInfo,
}: ResourceGroupProps) {
  return (
    <div style={styles.resourceGroup}>
      {title && <div style={styles.groupTitle}>{title}</div>}
      <div style={viewMode === 'grid' ? styles.resourceGrid : styles.resourceListView}>
        {resources.map((resource) => (
          <ResourceItem
            key={resource.id}
            resource={resource}
            viewMode={viewMode}
            selected={selectedIds.has(resource.id!)}
            onSelect={() => onSelect(resource.id!)}
            onDragStart={() => onDragStart(resource)}
            onRename={onRename}
            onDelete={onDelete}
            onShowInfo={onShowInfo}
          />
        ))}
      </div>
    </div>
  );
}

// 资源项
interface ResourceItemProps {
  resource: Partial<Resource> & { _legacy?: boolean };
  viewMode: 'grid' | 'list';
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onRename?: (id: string, newName: string) => void;
  onDelete?: (id: string) => void;
  onShowInfo?: (resource: Partial<Resource>) => void;
}

function ResourceItem({
  resource,
  viewMode,
  selected,
  onSelect,
  onDragStart,
  onRename,
  onDelete,
  onShowInfo,
}: ResourceItemProps) {
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [newName, setNewName] = useState(resource.name || '');
  const [hoverPreviewOpen, setHoverPreviewOpen] = useState(false);

  const thumbnailUrl = resource.thumbnailPath
    ? `koma-local:///${resource.thumbnailPath.replace(/\\/g, '/')}`
    : null;

  // 悬浮预览内容
  const hoverPreviewContent = (
    <div style={styles.hoverPreview}>
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={resource.name}
          style={styles.hoverPreviewImage}
        />
      ) : (
        <div style={styles.hoverPreviewPlaceholder}>
          {getResourceIcon(resource.type!)}
        </div>
      )}
      <div style={styles.hoverPreviewInfo}>
        <div style={styles.hoverPreviewName}>{resource.name}</div>
        <div style={styles.hoverPreviewMeta}>
          {resource.type && <span>{resource.type}</span>}
          {resource.duration && <span> · {formatDuration(resource.duration)}</span>}
          {resource.size && <span> · {formatFileSize(resource.size)}</span>}
        </div>
        {resource.width && resource.height && (
          <div style={styles.hoverPreviewMeta}>
            {resource.width} × {resource.height}
          </div>
        )}
      </div>
    </div>
  );

  // 右键菜单项
  const contextMenuItems: MenuProps['items'] = [
    {
      key: 'rename',
      icon: <EditOutlined />,
      label: '重命名',
      onClick: () => {
        setNewName(resource.name || '');
        setRenameModalOpen(true);
      },
    },
    {
      key: 'info',
      icon: <InfoCircleOutlined />,
      label: '详细信息',
      onClick: () => onShowInfo?.(resource),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: '确认删除',
          icon: <ExclamationCircleOutlined />,
          content: `确定要删除 "${resource.name}" 吗？`,
          okText: '删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: () => onDelete?.(resource.id!),
        });
      },
    },
  ];

  // 处理重命名确认
  const handleRenameOk = () => {
    if (newName.trim() && newName !== resource.name) {
      onRename?.(resource.id!, newName.trim());
    }
    setRenameModalOpen(false);
  };

  // 处理拖拽开始
  const handleDragStart = (e: React.DragEvent) => {
    // 设置拖拽数据
    e.dataTransfer.setData('application/json', JSON.stringify({
      id: resource.id,
      type: resource.type,
      name: resource.name,
      path: resource.path,
      duration: resource.duration,
      width: resource.width,
      height: resource.height,
      thumbnailPath: resource.thumbnailPath,
      waveformPath: (resource as any).waveformPath,
    }));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart();
  };

  if (viewMode === 'list') {
    return (
      <>
        <Popover
          content={hoverPreviewContent}
          placement="right"
          mouseEnterDelay={0.5}
          open={hoverPreviewOpen}
          onOpenChange={setHoverPreviewOpen}
        >
          <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
            <div
              style={{
                ...styles.resourceListItem,
                ...(selected ? styles.resourceItemSelected : {}),
              }}
              draggable
              onDragStart={(e) => {
                setHoverPreviewOpen(false);
                handleDragStart(e);
              }}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  onSelect();
                }
              }}
            >
              <div style={styles.listItemThumb}>
                {thumbnailUrl ? (
                  <img src={thumbnailUrl} alt={resource.name} style={styles.listThumbImg} />
                ) : (
                  <span>{getResourceIcon(resource.type!)}</span>
                )}
              </div>
              <div style={styles.listItemInfo}>
                <div style={styles.listItemName}>{resource.name}</div>
                <div style={styles.listItemMeta}>
                  {resource.duration && formatDuration(resource.duration)}
                  {resource.size && ` · ${formatFileSize(resource.size)}`}
                </div>
              </div>
            </div>
          </Dropdown>
        </Popover>
        <Modal
          title="重命名"
          open={renameModalOpen}
          onOk={handleRenameOk}
          onCancel={() => setRenameModalOpen(false)}
          okText="确定"
          cancelText="取消"
          width={300}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={handleRenameOk}
            autoFocus
          />
        </Modal>
      </>
    );
  }

  return (
    <>
      <Popover
        content={hoverPreviewContent}
        placement="right"
        mouseEnterDelay={0.5}
        open={hoverPreviewOpen}
        onOpenChange={setHoverPreviewOpen}
      >
        <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
          <div
            style={{
              ...styles.resourceItem,
              ...(selected ? styles.resourceItemSelected : {}),
            }}
            draggable
            onDragStart={(e) => {
              setHoverPreviewOpen(false);
              handleDragStart(e);
            }}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey) {
                onSelect();
              }
            }}
          >
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt={resource.name} style={styles.thumbnail} />
            ) : (
              <div style={styles.placeholder}>
                {getResourceIcon(resource.type!)}
              </div>
            )}
            <span style={styles.resourceName}>{resource.name}</span>
            {resource.duration && (
              <span style={styles.duration}>{formatDuration(resource.duration)}</span>
            )}
          </div>
        </Dropdown>
      </Popover>
      <Modal
        title="重命名"
        open={renameModalOpen}
        onOk={handleRenameOk}
        onCancel={() => setRenameModalOpen(false)}
        okText="确定"
        cancelText="取消"
        width={300}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleRenameOk}
          autoFocus
        />
      </Modal>
    </>
  );
}

function getResourceIcon(type: ResourceType): string {
  switch (type) {
    case 'video': return '🎬';
    case 'audio': return '🎵';
    case 'image': return '🖼️';
    default: return '📄';
  }
}

// 兼容旧版本
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
  library: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    gap: 8,
    padding: '8px 8px 0',
    alignItems: 'center',
  },
  toolbarRight: {
    marginLeft: 'auto',
    display: 'flex',
    gap: 4,
  },
  typeFilter: {
    display: 'flex',
    gap: 4,
    padding: 8,
    borderBottom: '1px solid #27272a',
  },
  typeFilterBtn: {
    flex: 1,
    padding: '4px 8px',
    background: 'transparent',
    border: '1px solid #3f3f46',
    borderRadius: 4,
    color: '#a1a1aa',
    fontSize: 11,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    transition: 'all 0.2s',
  },
  typeFilterBtnActive: {
    background: '#3f3f46',
    borderColor: '#52525b',
    color: '#fafafa',
  },
  resourceList: {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 40,
    color: '#71717a',
  },
  resourceGroup: {
    marginBottom: 16,
  },
  groupTitle: {
    fontSize: 12,
    color: '#71717a',
    marginBottom: 8,
    paddingLeft: 4,
  },
  resourceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  },
  resourceListView: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  resourceItem: {
    background: '#27272a',
    borderRadius: 6,
    overflow: 'hidden',
    cursor: 'grab',
    transition: 'transform 0.1s, box-shadow 0.1s',
    position: 'relative',
  },
  resourceItemSelected: {
    boxShadow: '0 0 0 2px #3b82f6',
  },
  resourceListItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: 6,
    background: '#27272a',
    borderRadius: 4,
    cursor: 'grab',
  },
  listItemThumb: {
    width: 48,
    height: 32,
    borderRadius: 4,
    overflow: 'hidden',
    background: '#3f3f46',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  listThumbImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  listItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  listItemName: {
    fontSize: 12,
    color: '#fafafa',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  listItemMeta: {
    fontSize: 10,
    color: '#71717a',
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
  resourceName: {
    display: 'block',
    padding: '4px 6px',
    fontSize: 11,
    color: '#d4d4d8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  duration: {
    position: 'absolute',
    bottom: 24,
    right: 4,
    padding: '1px 4px',
    background: 'rgba(0,0,0,0.7)',
    borderRadius: 2,
    fontSize: 10,
    color: '#fff',
  },
  assetList: {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
  },
  assetGroup: {
    marginBottom: 16,
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
  assetName: {
    display: 'block',
    padding: '4px 6px',
    fontSize: 11,
    color: '#d4d4d8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  infoContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  infoRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoLabel: {
    width: 60,
    flexShrink: 0,
    color: '#71717a',
    fontSize: 13,
  },
  infoValue: {
    flex: 1,
    color: '#fafafa',
    fontSize: 13,
  },
  hoverPreview: {
    width: 200,
    background: '#18181b',
  },
  hoverPreviewImage: {
    width: '100%',
    aspectRatio: '16/9',
    objectFit: 'cover',
    borderRadius: 4,
  },
  hoverPreviewPlaceholder: {
    width: '100%',
    aspectRatio: '16/9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#27272a',
    borderRadius: 4,
    fontSize: 32,
  },
  hoverPreviewInfo: {
    padding: '8px 0 0',
  },
  hoverPreviewName: {
    fontSize: 13,
    color: '#fafafa',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  hoverPreviewMeta: {
    fontSize: 11,
    color: '#71717a',
    marginTop: 4,
  },
};

export default Sidebar;
