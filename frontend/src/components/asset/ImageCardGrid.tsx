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
  UploadOutlined,
  UserOutlined,
  EnvironmentOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { Character, Scene, Prop } from '../../types';
import { electronService } from '../../services/electronService';
import './ImageCardGrid.css';

const { Text } = Typography;

export interface ImageCardGridProps {
  images: string[];
  selectedIndex?: number;
  onSelect: (index: number) => void;
  onAdd: (imagePath: string) => void;
  onDelete: (index: number) => void;
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
  onGenerate,
  isGenerating = false,
  disabled = false,
  characters = [],
  scenes = [],
  props: propsList = [],
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
    } catch (err) {
      message.error('选择文件失败');
    }
  }, [onAdd]);

  // 从资产选择（优先使用远程URL）
  const handleSelectAsset = useCallback((type: 'character' | 'scene' | 'prop', assetId: string) => {
    let imageUrl: string | undefined;
    if (type === 'character') {
      const char = characters.find(c => c.id === assetId);
      // 优先使用远程URL
      imageUrl = char?.costumePhotoUrl || char?.costumePhotoPath;
    } else if (type === 'scene') {
      const scene = scenes.find(s => s.id === assetId);
      // 优先使用远程URL
      imageUrl = scene?.imageUrl || scene?.imagePath;
    } else {
      const prop = propsList.find(p => p.id === assetId);
      // 优先使用远程URL
      imageUrl = prop?.imageUrl || prop?.imagePath;
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
    const charItems = characters.filter(c => c.costumePhotoPath).map(c => ({
      key: `char-${c.id}`,
      label: (
        <Space size={8}>
          <img src={electronService.fs.toLocalUrl(c.costumePhotoPath!)} alt={c.name}
            style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 2 }} />
          <span>{c.name}</span>
        </Space>
      ),
      onClick: () => handleSelectAsset('character', c.id),
    }));
    if (charItems.length > 0) {
      items.push({ key: 'characters', icon: <UserOutlined />, label: '角色', children: charItems });
    }

    // 场景
    const sceneItems = scenes.filter(s => s.imagePath).map(s => ({
      key: `scene-${s.id}`,
      label: (
        <Space size={8}>
          <img src={electronService.fs.toLocalUrl(s.imagePath!)} alt={s.name}
            style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 2 }} />
          <span>{s.name}</span>
        </Space>
      ),
      onClick: () => handleSelectAsset('scene', s.id),
    }));
    if (sceneItems.length > 0) {
      items.push({ key: 'scenes', icon: <EnvironmentOutlined />, label: '场景', children: sceneItems });
    }

    // 道具
    const propItems = propsList.filter(p => p.imagePath).map(p => ({
      key: `prop-${p.id}`,
      label: (
        <Space size={8}>
          <img src={electronService.fs.toLocalUrl(p.imagePath!)} alt={p.name}
            style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 2 }} />
          <span>{p.name}</span>
        </Space>
      ),
      onClick: () => handleSelectAsset('prop', p.id),
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
    onDelete(index);
  };

  return (
    <div className="imageCardGrid">
      <div className="imageCards">
        {images.map((img, idx) => (
          <div
            key={idx}
            className={`imageCard ${idx === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(idx)}
          >
            <img src={electronService.fs.toLocalUrl(img)} alt={`img-${idx}`} />
            {idx === selectedIndex && <CheckCircleFilled className="selectedIcon" />}
            <div className="cardOverlay">
              <Tooltip title="删除">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => handleDelete(idx, e)}
                  className="overlayBtn"
                />
              </Tooltip>
            </div>
          </div>
        ))}

        {/* 添加按钮 */}
        <Dropdown menu={{ items: buildAddMenu() }} trigger={['click']} disabled={disabled}>
          <div className="imageCard addCard">
            <PlusOutlined />
            <Text type="secondary" style={{ fontSize: 10 }}>添加</Text>
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
          {isGenerating ? '生成中' : 'AI生成'}
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
        {images.map((img, idx) => (
          <Image key={idx} src={electronService.fs.toLocalUrl(img)} style={{ display: 'none' }} />
        ))}
      </Image.PreviewGroup>
    </div>
  );
};

export default ImageCardGrid;
