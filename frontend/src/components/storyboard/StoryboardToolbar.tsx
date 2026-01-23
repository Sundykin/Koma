import React from 'react';
import { Button, Space, Typography, Popconfirm, Divider } from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
  ReloadOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import './StoryboardToolbar.css';

const { Text } = Typography;

export interface StoryboardToolbarProps {
  stats: {
    total: number;
    withPrompt: number;
    withImage: number;
    withVideo: number;
    confirmed: number;
  };
  selectedStats: {
    total: number;
    noPrompt: number;
    noImage: number;
    noVideo: number;
    withPrompt: number;
    withImage: number;
    withVideo: number;
  };
  hasSelected: boolean;
  selectedCount: number;
  generatingPrompts: boolean;
  generatingImages: boolean;
  generatingVideos: boolean;
  onBatchPrompts: () => void;
  onBatchRePrompts: () => void;
  onBatchImages: () => void;
  onBatchReImages: () => void;
  onBatchVideos: () => void;
  onBatchReVideos: () => void;
  onAddShot: () => void;
  onBatchConfirm: (confirm: boolean) => void;
  onBatchDelete: () => void;
}

export const StoryboardToolbar: React.FC<StoryboardToolbarProps> = ({
  stats,
  selectedStats,
  hasSelected,
  selectedCount,
  generatingPrompts,
  generatingImages,
  generatingVideos,
  onBatchPrompts,
  onBatchRePrompts,
  onBatchImages,
  onBatchReImages,
  onBatchVideos,
  onBatchReVideos,
  onAddShot,
  onBatchConfirm,
  onBatchDelete,
}) => {
  return (
    <div className="storyboard-toolbar-inner">
      <Space wrap>
        <Space.Compact>
          <Button
            icon={<RobotOutlined />}
            disabled={!hasSelected || selectedStats.noPrompt === 0 || generatingPrompts}
            onClick={onBatchPrompts}
          >
            生成提示词 ({selectedStats.noPrompt})
          </Button>
          <Button
            icon={<ReloadOutlined />}
            disabled={!hasSelected || selectedStats.withPrompt === 0 || generatingPrompts}
            onClick={onBatchRePrompts}
            title="重新生成提示词"
          />
        </Space.Compact>

        <Space.Compact>
          <Button
            icon={<ThunderboltOutlined />}
            disabled={!hasSelected || selectedStats.noImage === 0 || generatingImages}
            onClick={onBatchImages}
          >
            生成图片 ({selectedStats.noImage})
          </Button>
          <Button
            icon={<ReloadOutlined />}
            disabled={!hasSelected || selectedStats.withImage === 0 || generatingImages}
            onClick={onBatchReImages}
            title="重新生成图片"
          />
        </Space.Compact>

        <Space.Compact>
          <Button
            icon={<VideoCameraOutlined />}
            disabled={!hasSelected || selectedStats.total === 0 || generatingVideos}
            onClick={onBatchVideos}
          >
            生成视频 ({selectedStats.total})
          </Button>
          <Button
            icon={<ReloadOutlined />}
            disabled={!hasSelected || selectedStats.withVideo === 0 || generatingVideos}
            onClick={onBatchReVideos}
            title="重新生成视频"
          />
        </Space.Compact>

        <div className="h-4 w-px bg-zinc-700" />

        <Button type="primary" icon={<PlusOutlined />} onClick={onAddShot}>
          添加分镜
        </Button>
      </Space>

      {hasSelected && (
        <Space className="selection-actions">
          <Text type="secondary">已选 {selectedCount} 项</Text>
          <div className="h-4 w-px bg-zinc-700" />
          <Button size="small" onClick={() => onBatchConfirm(true)}>批量确认</Button>
          <Button size="small" onClick={() => onBatchConfirm(false)}>取消确认</Button>
          <Popconfirm title={`删除 ${selectedCount} 个分镜？`} onConfirm={onBatchDelete}>
            <Button size="small" danger>批量删除</Button>
          </Popconfirm>
        </Space>
      )}

      <div className="toolbar-stats">
        <Text type="secondary">
          T: {stats.withPrompt}/{stats.total} |
          I: {stats.withImage}/{stats.total} |
          V: {stats.withVideo}/{stats.total} |
          OK: {stats.confirmed}/{stats.total}
        </Text>
      </div>
    </div>
  );
};
