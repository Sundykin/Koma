/**
 * 多图片卡片网格组件
 * 支持多图选择、添加、删除、预览
 */
import React, { useState, useCallback } from 'react';
import { Button, Dropdown, Image, Tooltip, Space, Typography, App } from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  CheckCircleFilled,
  DeleteOutlined,
  EyeOutlined,
  UploadOutlined,
  UserOutlined,
  EnvironmentOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  LoadingOutlined
} from '@ant-design/icons';
import type { Character, Scene, Prop } from '../../types';
import { electronService } from '../../services/electronService';
import {
  getCharacterCostumePhotoSource,
  getPropPreviewImageSource,
  getScenePreviewImageSource,
} from '../../utils/mediaSelectors';
import './ImageCardGrid.scss';

const { Text } = Typography;

function toDisplayUrl(source: string): string {
  if (/^https?:\/\//i.test(source) || source.startsWith('data:') || source.startsWith('blob:') || source.startsWith('koma-local://')) {
    return source;
  }
  return electronService.fs.toLocalUrl(source);
}

export interface ImageCardGridProps {
  images: string[];
  selectedIndex?: number;
  onSelect: (index: number) => void;
  onAdd: (imagePath: string) => void;
  onDelete: (index: number) => void | Promise<void>;
  onSplitGrid?: (index: number) => void;
  onGenerate?: () => void;
  isGenerating?: boolean;
  disabled?: boolean;
  characters?: Character[];
  scenes?: Scene[];
  props?: Prop[];
  compact?: boolean;  // 紧凑模式，用于分镜卡片
}

export const ImageCardGrid: React.FC<ImageCardGridProps> = ({
  images,
  selectedIndex = 0,
  onSelect,
  onAdd,
  onDelete,
  onSplitGrid,
  onGenerate,
  isGenerating = false,
  disabled = false,
  characters = [],
  scenes = [],
  props: propsList = [],
  compact = false,
}) => {
  const { message } = App.useApp();
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  // 本地上传
  const handleLocalUpload = useCallback(async () => {
    try {
      const result = await electronService.dialog.openFile({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        multiple: false,
      });
      if (!result.canceled && result.filePaths.length > 0) {
        onAdd(result.filePaths[0]);
      }
    } catch {
      message.error('选择文件失败');
    }
  }, [onAdd]);

  // 从资产选择（优先使用远程URL）
  const handleSelectAsset = useCallback((type: 'character' | 'scene' | 'prop', assetId: string) => {
    let imageUrl: string | undefined;
    if (type === 'character') {
      const char = characters.find(c => c.id === assetId);
      imageUrl = getCharacterCostumePhotoSource(char);
    } else if (type === 'scene') {
      const scene = scenes.find(s => s.id === assetId);
      imageUrl = getScenePreviewImageSource(scene);
    } else {
      const prop = propsList.find(p => p.id === assetId);
      imageUrl = getPropPreviewImageSource(prop);
    }
    if (imageUrl) {
      onAdd(imageUrl);
    } else {
      message.warning('该资产没有图片');
    }
  }, [characters, scenes, propsList, onAdd]);

  // 构建添加菜单
  const buildAddMenu = (): MenuProps['items'] => {
    const items: MenuProps['items'] = [
      { key: 'upload', icon: <UploadOutlined />, label: '本地上传', onClick: handleLocalUpload },
      { type: 'divider' },
    ];

    // 角色
    const charItems = characters
      .map(c => ({ asset: c, source: getCharacterCostumePhotoSource(c) }))
      .filter((entry): entry is { asset: Character; source: string } => Boolean(entry.source))
      .map(({ asset, source }) => ({
      key: `char-${asset.id}`,
      label: (
        <Space size={8}>
          <img src={toDisplayUrl(source)} alt={asset.name} className="assetMenuThumb" />
          <span>{asset.name}</span>
        </Space>
      ),
      onClick: () => handleSelectAsset('character', asset.id),
    }));
    if (charItems.length > 0) {
      items.push({ key: 'characters', icon: <UserOutlined />, label: '角色', children: charItems });
    }

    // 场景
    const sceneItems = scenes
      .map(s => ({ asset: s, source: getScenePreviewImageSource(s) }))
      .filter((entry): entry is { asset: Scene; source: string } => Boolean(entry.source))
      .map(({ asset, source }) => ({
      key: `scene-${asset.id}`,
      label: (
        <Space size={8}>
          <img src={toDisplayUrl(source)} alt={asset.name} className="assetMenuThumb" />
          <span>{asset.name}</span>
        </Space>
      ),
      onClick: () => handleSelectAsset('scene', asset.id),
    }));
    if (sceneItems.length > 0) {
      items.push({ key: 'scenes', icon: <EnvironmentOutlined />, label: '场景', children: sceneItems });
    }

    // 道具
    const propItems = propsList
      .map(p => ({ asset: p, source: getPropPreviewImageSource(p) }))
      .filter((entry): entry is { asset: Prop; source: string } => Boolean(entry.source))
      .map(({ asset, source }) => ({
      key: `prop-${asset.id}`,
      label: (
        <Space size={8}>
          <img src={toDisplayUrl(source)} alt={asset.name} className="assetMenuThumb" />
          <span>{asset.name}</span>
        </Space>
      ),
      onClick: () => handleSelectAsset('prop', asset.id),
    }));
    if (propItems.length > 0) {
      items.push({ key: 'props', icon: <AppstoreOutlined />, label: '道具', children: propItems });
    }

    return items;
  };

  const handlePreview = (index: number) => {
    setPreviewIndex(index);
    setPreviewVisible(true);
  };

  const handleDelete = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    void onDelete(index);
  };

  const handlePreviewClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    handlePreview(index);
  };

  const handleSplitGridClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onSplitGrid?.(index);
  };

  const hasImages = images.length > 0;
  const generateLabel = hasImages ? '重新生成' : 'AI生成';
  const generatingLabel = hasImages ? '重新生成中' : '生成中';

  return (
    <div className={`imageCardGrid ${compact ? 'compact' : ''}`.trim()}>
      <div className="imageCards">
        {images.map((img, idx) => (
          <div
            key={idx}
            className={`imageCard ${idx === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(idx)}
            onDoubleClick={() => handlePreview(idx)}
          >
            <img src={toDisplayUrl(img)} alt={`img-${idx}`} />
            {idx === selectedIndex && <CheckCircleFilled className="selectedIcon" />}
            <div className="cardOverlay">
              <Tooltip title="预览图像">
                <Button
                  type="text"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={(e) => handlePreviewClick(idx, e)}
                  className="overlayBtn"
                  title="预览图像"
                  aria-label="预览图像"
                />
              </Tooltip>
              {onSplitGrid && (
                <Tooltip title="拆分九宫格">
                  <Button
                    type="text"
                    size="small"
                    icon={<AppstoreOutlined />}
                    onClick={(e) => handleSplitGridClick(idx, e)}
                    className="overlayBtn"
                    title="拆分九宫格"
                    aria-label="拆分九宫格"
                  />
                </Tooltip>
              )}
              <Tooltip title="删除此图像">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => handleDelete(idx, e)}
                  className="overlayBtn"
                  title="删除此图像"
                  aria-label="删除此图像"
                />
              </Tooltip>
            </div>
          </div>
        ))}

        {/* 添加按钮 */}
        <Dropdown menu={{ items: buildAddMenu() }} trigger={['click']} disabled={disabled}>
          <div className="imageCard addCard">
            <PlusOutlined />
            <Text type="secondary" className="addCardText">添加</Text>
          </div>
        </Dropdown>
      </div>

      {/* AI 生成按钮 */}
      {onGenerate && (
        <Button
          type="text"
          size="small"
          icon={isGenerating ? <LoadingOutlined /> : <ThunderboltOutlined />}
          onClick={onGenerate}
          disabled={isGenerating || disabled}
          className="generateBtn"
        >
          {isGenerating ? generatingLabel : generateLabel}
        </Button>
      )}

      {/* 图片预览 */}
      <Image.PreviewGroup
        preview={{
          open: previewVisible,
          onOpenChange: setPreviewVisible,
          current: previewIndex,
        }}
      >
        <div className="hiddenPreviewImages">
          {images.map((img, idx) => (
            <Image key={idx} src={toDisplayUrl(img)} />
          ))}
        </div>
      </Image.PreviewGroup>
    </div>
  );
};

export default ImageCardGrid;
