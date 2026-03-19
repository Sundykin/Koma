/**
 * 多视频卡片网格组件
 * 支持多版本视频选择、播放、删除
 */
import React, { useState, useCallback } from 'react';
import { Button, Modal, Tooltip, Typography, Popconfirm } from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleFilled,
  DeleteOutlined,
  VideoCameraOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { ShotVideo } from '../../types';
import { electronService } from '../../services/electronService';
import './VideoCardGrid.css';

const { Text } = Typography;

export interface VideoCardGridProps {
  videos: ShotVideo[];
  selectedIndex?: number;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onGenerate?: () => void;
  isGenerating?: boolean;
  disabled?: boolean;
  compact?: boolean;  // 紧凑模式，用于分镜卡片
}

export const VideoCardGrid: React.FC<VideoCardGridProps> = ({
  videos,
  selectedIndex = 0,
  onSelect,
  onDelete,
  onGenerate,
  isGenerating = false,
  disabled = false,
}) => {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  const handlePlay = useCallback((video: ShotVideo, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = video.path
      ? electronService.fs.toLocalUrl(video.path)
      : video.url || '';
    setPreviewUrl(url);
    setPreviewVisible(true);
  }, []);

  const handleDelete = useCallback((index: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onDelete(index);
  }, [onDelete]);

  const _formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="videoCardGrid">
      <div className="videoCards">
        {videos.map((video, idx) => (
          <div
            key={idx}
            className={`videoCard ${idx === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(idx)}
          >
            {video.thumbnailPath ? (
              <img src={electronService.fs.toLocalUrl(video.thumbnailPath)} alt={`v${idx + 1}`} />
            ) : (
              <div className="videoPlaceholder">
                <VideoCameraOutlined />
              </div>
            )}
            <span className="versionLabel">v{idx + 1}</span>
            {idx === selectedIndex && <CheckCircleFilled className="selectedIcon" />}
            <div className="cardOverlay">
              <Tooltip title="播放">
                <Button
                  type="text"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={(e) => handlePlay(video, e)}
                  className="overlayBtn"
                />
              </Tooltip>
              {videos.length > 1 && (
                <Popconfirm
                  title="确定删除此版本？"
                  onConfirm={(e) => handleDelete(idx, e as any)}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Tooltip title="删除">
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                      className="overlayBtn"
                    />
                  </Tooltip>
                </Popconfirm>
              )}
            </div>
          </div>
        ))}

        {videos.length === 0 && (
          <div className="videoCard empty">
            <VideoCameraOutlined />
            <Text type="secondary" style={{ fontSize: 10 }}>无视频</Text>
          </div>
        )}
      </div>

      {/* AI 生成按钮 */}
      {onGenerate && (
        <Button
          type="text"
          size="small"
          icon={isGenerating ? <LoadingOutlined /> : <VideoCameraOutlined />}
          onClick={onGenerate}
          disabled={isGenerating || disabled}
          className="generateBtn"
        >
          {isGenerating ? '生成中' : 'AI生成视频'}
        </Button>
      )}

      {/* 视频播放弹窗 */}
      <Modal
        title="视频预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={720}
        centered
        destroyOnHidden
      >
        <video
          src={previewUrl}
          controls
          autoPlay
          style={{ width: '100%', maxHeight: '60vh' }}
        />
      </Modal>
    </div>
  );
};

export default VideoCardGrid;
