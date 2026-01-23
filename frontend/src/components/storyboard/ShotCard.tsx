import React, { useMemo } from 'react';
import {
  Space,
  Tag,
  Typography,
  Checkbox,
  Tooltip,
  Button,
  Popconfirm,
} from 'antd';
import {
  DeleteOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  InsertRowAboveOutlined,
  InsertRowBelowOutlined,
  MergeCellsOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import type { Shot, Character, Scene, Prop, ShotVideo } from '../../types';
import { ScriptEditor } from '../../editor';
import type { MentionItem } from '../../editor';
import { ImageCardGrid } from '../asset/ImageCardGrid';
import { VideoCardGrid } from '../asset/VideoCardGrid';
import './ShotCard.css';

const { Text, TextArea } = Typography;

// 景别映射
const SHOT_TYPE_MAP: Record<string, string> = {
  'close-up': '特写',
  'medium': '中景',
  'wide': '全景',
  'extreme-wide': '大全景'
};

// 运镜映射
const CAMERA_MOVEMENT_MAP: Record<string, string> = {
  'static': '固定',
  'pan': '摇镜',
  'zoom-in': '推镜',
  'tracking': '跟随',
  'handheld': '手持'
};

export interface ShotCardProps {
  shot: Shot;
  index: number;
  totalCount: number;
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  mentionItems: MentionItem[];
  isSelected: boolean;
  isGeneratingPrompt: boolean;
  isGeneratingImage: boolean;
  isGeneratingVideo: boolean;
  onSelectChange: (shotId: string, selected: boolean) => void;
  onScriptChange: (shotId: string, script: string) => void;
  onPromptChange: (shotId: string, description: string) => void;
  onImagesChange: (shotId: string, images: string[], selectedIndex: number) => void;
  onVideosChange: (shotId: string, videos: ShotVideo[], selectedIndex: number) => void;
  onGeneratePrompt: (shotId: string) => void;
  onGenerateImage: (shotId: string) => void;
  onGenerateVideo: (shotId: string) => void;
  onToggleConfirm: (shot: Shot) => void;
  onDelete: (shotId: string) => void;
  onMergeUp: (shotId: string) => void;
  onMergeDown: (shotId: string) => void;
  onMoveUp: (shotId: string) => void;
  onMoveDown: (shotId: string) => void;
  onInsertAbove: (shotId: string) => void;
  onInsertBelow: (shotId: string) => void;
}

export const ShotCard: React.FC<ShotCardProps> = ({
  shot,
  index,
  totalCount,
  characters,
  scenes,
  props,
  mentionItems,
  isSelected,
  isGeneratingPrompt,
  isGeneratingImage,
  isGeneratingVideo,
  onSelectChange,
  onScriptChange,
  onPromptChange,
  onImagesChange,
  onVideosChange,
  onGeneratePrompt,
  onGenerateImage,
  onGenerateVideo,
  onToggleConfirm,
  onDelete,
  onMergeUp,
  onMergeDown,
  onMoveUp,
  onMoveDown,
  onInsertAbove,
  onInsertBelow,
}) => {
  const characterNames = useMemo(() => {
    return shot.characters?.map(charId => {
      const char = characters.find(c => c.id === charId);
      return char?.name || charId;
    }) || [];
  }, [shot.characters, characters]);

  const hasPrompt = !!shot.description?.trim();
  const isFirst = index === 0;
  const isLast = index === totalCount - 1;

  // 图片列表
  const images = useMemo(() => {
    if (shot.imagePaths && shot.imagePaths.length > 0) {
      return shot.imagePaths;
    }
    if (shot.imagePath) {
      return [shot.imagePath];
    }
    return [];
  }, [shot.imagePaths, shot.imagePath]);

  const videos = shot.videos || [];

  // 图片操作
  const handleImageSelect = (idx: number) => {
    onImagesChange(shot.id, images, idx);
  };
  const handleImageAdd = (path: string) => {
    const newImages = [...images, path];
    onImagesChange(shot.id, newImages, newImages.length - 1);
  };
  const handleImageDelete = (idx: number) => {
    const newImages = images.filter((_, i) => i !== idx);
    const newSelectedIdx = Math.min(shot.currentImageIndex || 0, newImages.length - 1);
    onImagesChange(shot.id, newImages, Math.max(0, newSelectedIdx));
  };

  // 视频操作
  const handleVideoSelect = (idx: number) => {
    onVideosChange(shot.id, videos, idx);
  };
  const handleVideoDelete = (idx: number) => {
    const newVideos = videos.filter((_, i) => i !== idx);
    const newSelectedIdx = Math.min(shot.currentVideoIndex || 0, newVideos.length - 1);
    onVideosChange(shot.id, newVideos, Math.max(0, newSelectedIdx));
  };

  return (
    <div className={`shot-card ${isSelected ? 'selected' : ''} ${shot.confirmed ? 'confirmed' : ''}`}>
      {/* 头部：序号、操作、元数据 */}
      <div className="shot-card-header">
        <div className="shot-card-index">
          <Checkbox
            checked={isSelected}
            onChange={(e) => onSelectChange(shot.id, e.target.checked)}
          />
          <span className="index-number">#{index + 1}</span>
          {shot.confirmed && <CheckCircleFilled className="confirmed-icon" />}
        </div>

        <div className="shot-card-meta">
          <Tag color="blue">{SHOT_TYPE_MAP[shot.shotType] || shot.shotType}</Tag>
          {shot.cameraMovement !== 'static' && (
            <Tag color="purple">{CAMERA_MOVEMENT_MAP[shot.cameraMovement]}</Tag>
          )}
          <Tag>{shot.duration}s</Tag>
          {characterNames.map(name => (
            <Tag key={name} color="cyan">{name}</Tag>
          ))}
        </div>

        <div className="shot-card-actions">
          <Tooltip title={shot.confirmed ? '取消确认' : '确认'}>
            <Button
              size="small"
              type={shot.confirmed ? 'primary' : 'text'}
              icon={shot.confirmed ? <CheckCircleFilled /> : <CheckCircleOutlined />}
              onClick={() => onToggleConfirm(shot)}
            />
          </Tooltip>
          <Tooltip title="上移">
            <Button
              size="small"
              type="text"
              icon={<ArrowUpOutlined />}
              disabled={isFirst}
              onClick={() => onMoveUp(shot.id)}
            />
          </Tooltip>
          <Tooltip title="下移">
            <Button
              size="small"
              type="text"
              icon={<ArrowDownOutlined />}
              disabled={isLast}
              onClick={() => onMoveDown(shot.id)}
            />
          </Tooltip>

          <Tooltip title="更多操作">
             <Popconfirm title="确定删除？" onConfirm={() => onDelete(shot.id)}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
          <Tooltip title="上方插入">
            <Button
              size="small"
              type="text"
              icon={<InsertRowAboveOutlined />}
              onClick={() => onInsertAbove(shot.id)}
            />
          </Tooltip>
          <Tooltip title="下方插入">
            <Button
              size="small"
              type="text"
              icon={<InsertRowBelowOutlined />}
              onClick={() => onInsertBelow(shot.id)}
            />
          </Tooltip>
          <Tooltip title="向上合并">
            <Button
              size="small"
              type="text"
              icon={<MergeCellsOutlined />}
              disabled={isFirst}
              onClick={() => onMergeUp(shot.id)}
            />
          </Tooltip>
          <Tooltip title="向下合并">
            <Button
              size="small"
              type="text"
              icon={<MergeCellsOutlined style={{ transform: 'rotate(180deg)' }} />}
              disabled={isLast}
              onClick={() => onMergeDown(shot.id)}
            />
          </Tooltip>
        </div>
      </div>

      {/* 主体内容：三列布局 (Script, Prompt, Media) */}
      <div className="shot-card-body">
        {/* 1. 剧本列 */}
        <div className="shot-column script-column">
          <div className="column-label">剧本内容</div>
          <TextArea
            value={shot.scriptContent || ''}
            onChange={(e) => onScriptChange(shot.id, e.target.value)}
            placeholder="剧本内容..."
            autoSize={{ minRows: 4, maxRows: 8 }}
            className="script-textarea"
          />
        </div>

        {/* 2. 提示词列 */}
        <div className="shot-column prompt-column">
          <div className="column-header">
            <div className="column-label">提示词</div>
            <Button
              type="link"
              size="small"
              onClick={() => onGeneratePrompt(shot.id)}
              disabled={isGeneratingPrompt}
              loading={isGeneratingPrompt}
            >
              {hasPrompt ? '重新生成' : 'AI生成'}
            </Button>
          </div>
          <div className="prompt-editor-container">
            <ScriptEditor
              value={shot.description || ''}
              onChange={(value) => onPromptChange(shot.id, value)}
              placeholder={hasPrompt ? '' : '输入提示词...'}
              mentionItems={mentionItems}
              enableKeywordHighlight={true}
              minHeight="100%"
              maxHeight="100%"
              showLineNumbers={false}
              darkTheme={true}
            />
          </div>
        </div>

        {/* 3. 媒体列 (图片 & 视频) */}
        <div className="shot-column media-column">
          <div className="media-section image-section">
            <div className="column-header">
              <div className="column-label">参考图</div>
              <Button
                type="link"
                size="small"
                onClick={() => onGenerateImage(shot.id)}
                disabled={!hasPrompt || isGeneratingImage}
                loading={isGeneratingImage}
              >
                生成
              </Button>
            </div>
            <div className="media-grid-wrapper">
              <ImageCardGrid
                images={images}
                selectedIndex={shot.currentImageIndex || 0}
                onSelect={handleImageSelect}
                onAdd={handleImageAdd}
                onDelete={handleImageDelete}
                isGenerating={isGeneratingImage}
                disabled={!hasPrompt}
                characters={characters}
                scenes={scenes}
                props={props}
              />
            </div>
          </div>

          <div className="media-section video-section">
            <div className="column-header">
              <div className="column-label">视频</div>
              <Button
                type="link"
                size="small"
                onClick={() => onGenerateVideo(shot.id)}
                disabled={images.length === 0 || isGeneratingVideo}
                loading={isGeneratingVideo}
              >
                生成
              </Button>
            </div>
            <div className="media-grid-wrapper">
              <VideoCardGrid
                videos={videos}
                selectedIndex={shot.currentVideoIndex || 0}
                onSelect={handleVideoSelect}
                onDelete={handleVideoDelete}
                isGenerating={isGeneratingVideo}
                disabled={images.length === 0}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
