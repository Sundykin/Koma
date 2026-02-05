/**
 * 分镜卡片 - Compact Grid 布局
 * 操作按钮在左侧列直接显示，参考图使用引用样式
 */
import React, { useMemo, useCallback, useState } from 'react';
import {
  Tag,
  Checkbox,
  Tooltip,
  Button,
  Popconfirm,
  Input,
  Modal,
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
  PlayCircleFilled,
  PictureOutlined,
  VideoCameraOutlined,
  CloseOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { Shot, Character, Scene, Prop, ShotVideo } from '../../types';
import { ScriptEditor } from '../../editor';
import type { MentionItem } from '../../editor';
import { ImageCardGrid } from '../asset/ImageCardGrid';
import { VideoCardGrid } from '../asset/VideoCardGrid';
import { StagePlayer } from '../video/StagePlayer';
import { electronService } from '../../services/electronService';
import { SHOT_LAYOUT, COL_ACTION_WIDTH } from '../../constants/storyboardConstants';
import { AssetSelector } from './components/AssetSelector';
import './ShotCard.css';

const { TextArea } = Input;

export interface ShotCardProps {
  shot: Shot;
  index: number;
  totalCount: number;
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  mentionItems: MentionItem[];
  isSelected: boolean;
  isActive?: boolean;
  // 状态拆分：图片/视频提示词生成分离
  isGeneratingImagePrompt: boolean;
  isGeneratingVideoPrompt: boolean;
  isGeneratingImage: boolean;
  isGeneratingVideo: boolean;
  onSelectChange: (shotId: string, selected: boolean) => void;
  onActivate?: (shotId: string | null) => void;
  onScriptChange: (shotId: string, script: string) => void;
  onImagePromptChange: (shotId: string, imagePrompt: string) => void;
  onVideoPromptChange: (shotId: string, videoPrompt: string) => void;
  onCharactersChange: (shotId: string, characterIds: string[]) => void;
  onScenesChange?: (shotId: string, sceneIds: string[]) => void;
  onPropsChange?: (shotId: string, propIds: string[]) => void;
  onReferenceImagesChange?: (shotId: string, images: string[], selectedIndex: number) => void;
  onImagesChange: (shotId: string, images: string[], selectedIndex: number) => void;
  onVideosChange: (shotId: string, videos: ShotVideo[], selectedIndex: number) => void;
  // 回调拆分：生成 vs 优化，图片 vs 视频
  onGenerateImagePrompt: (shotId: string) => void;
  onGenerateVideoPrompt: (shotId: string) => void;
  onOptimizeImagePrompt: (shotId: string, currentPrompt: string) => void;
  onOptimizeVideoPrompt: (shotId: string, currentPrompt: string) => void;
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
  isActive,
  isGeneratingImagePrompt,
  isGeneratingVideoPrompt,
  isGeneratingImage,
  isGeneratingVideo,
  onSelectChange,
  onActivate,
  onScriptChange,
  onImagePromptChange,
  onVideoPromptChange,
  onCharactersChange,
  onScenesChange,
  onPropsChange,
  onReferenceImagesChange,
  onImagesChange,
  onVideosChange,
  onGenerateImagePrompt,
  onGenerateVideoPrompt,
  onOptimizeImagePrompt,
  onOptimizeVideoPrompt,
  onGenerateImage,
  onGenerateVideo,
  onToggleConfirm,
  onDelete,
  onMergeUp,
  onMergeDown: _onMergeDown,
  onMoveUp,
  onMoveDown,
  onInsertAbove,
  onInsertBelow,
}) => {
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  // 使用 useMemo 缓存计算值，避免不必要的重渲染
  const hasImagePrompt = useMemo(
    () => !!(shot.imagePrompt?.trim() || shot.description?.trim()),
    [shot.imagePrompt, shot.description]
  );
  const hasVideoPrompt = useMemo(
    () => !!shot.videoPrompt?.trim(),
    [shot.videoPrompt]
  );
  const isFirst = index === 0;
  const isLast = index === totalCount - 1;

  // 图片提示词按钮点击处理
  const handleImagePromptClick = useCallback(() => {
    if (hasImagePrompt) {
      onOptimizeImagePrompt(shot.id, shot.imagePrompt || shot.description || '');
    } else {
      onGenerateImagePrompt(shot.id);
    }
  }, [shot.id, shot.imagePrompt, shot.description, hasImagePrompt, onOptimizeImagePrompt, onGenerateImagePrompt]);

  // 视频提示词按钮点击处理
  const handleVideoPromptClick = useCallback(() => {
    if (hasVideoPrompt) {
      onOptimizeVideoPrompt(shot.id, shot.videoPrompt || '');
    } else {
      onGenerateVideoPrompt(shot.id);
    }
  }, [shot.id, shot.videoPrompt, hasVideoPrompt, onOptimizeVideoPrompt, onGenerateVideoPrompt]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.ant-btn, .ant-checkbox, .ant-input, .ant-select, .ant-tabs, .cm-editor, .ant-modal, .ant-popover')) {
      return;
    }
    onActivate?.(shot.id);
  }, [shot.id, onActivate]);

  // 生成结果图片列表
  const images = useMemo(() => {
    if (shot.imagePaths && shot.imagePaths.length > 0) return shot.imagePaths;
    if (shot.imagePath) return [shot.imagePath];
    return [];
  }, [shot.imagePaths, shot.imagePath]);

  const referenceImages = shot.referenceImages || [];
  const videos = shot.videos || [];

  const currentVideo = useMemo(() => {
    if (!videos.length) return null;
    const idx = shot.currentVideoIndex ?? shot.selectedVideoIndex ?? videos.length - 1;
    return videos[idx] || videos[videos.length - 1];
  }, [videos, shot.currentVideoIndex, shot.selectedVideoIndex]);

  const currentImage = useMemo(() => {
    if (!images.length) return null;
    return images[shot.currentImageIndex || 0];
  }, [images, shot.currentImageIndex]);

  // 图片操作
  const handleImageSelect = (idx: number) => onImagesChange(shot.id, images, idx);
  const handleImageAdd = (path: string) => {
    const newImages = [...images, path];
    onImagesChange(shot.id, newImages, newImages.length - 1);
  };
  const handleImageDelete = (idx: number) => {
    const newImages = images.filter((_, i) => i !== idx);
    const newIdx = Math.min(shot.currentImageIndex || 0, newImages.length - 1);
    onImagesChange(shot.id, newImages, Math.max(0, newIdx));
  };

  // 参考图操作
  const handleRefImageSelect = (idx: number) => onReferenceImagesChange?.(shot.id, referenceImages, idx);
  const handleRefImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newRefs = [...referenceImages, URL.createObjectURL(file)];
      onReferenceImagesChange?.(shot.id, newRefs, newRefs.length - 1);
    }
    e.target.value = '';
  };
  const handleRefImageDelete = (idx: number) => {
    const newRefs = referenceImages.filter((_, i) => i !== idx);
    const newIdx = Math.min(shot.selectedReferenceIndex || 0, newRefs.length - 1);
    onReferenceImagesChange?.(shot.id, newRefs, Math.max(0, newIdx));
  };

  // 视频操作
  const handleVideoSelect = (idx: number) => onVideosChange(shot.id, videos, idx);
  const handleVideoDelete = (idx: number) => {
    const newVideos = videos.filter((_, i) => i !== idx);
    const newIdx = Math.min(shot.currentVideoIndex || 0, newVideos.length - 1);
    onVideosChange(shot.id, newVideos, Math.max(0, newIdx));
  };

  // 统一按钮样式
  const actionBtnClass = "w-6 h-6 p-0 text-[11px]";

  return (
    <div
      className={`shot-card ${isSelected ? 'selected' : ''} ${shot.confirmed ? 'confirmed' : ''} ${isActive ? 'active' : ''}`}
      onClick={handleCardClick}
    >
      <div className="flex items-stretch min-h-[130px] bg-zinc-950">
        {/* 左侧操作列 - 全部显示 */}
        <div className={`${COL_ACTION_WIDTH} shrink-0 border-r border-zinc-800 flex flex-col items-center py-1.5 gap-0.5 bg-zinc-900/30`}>
          <Checkbox
            checked={isSelected}
            onChange={(e) => onSelectChange(shot.id, e.target.checked)}
          />
          <span className="text-[11px] font-semibold text-zinc-400">#{index + 1}</span>
          <Tag className="m-0 text-[9px] px-1" color="blue">{shot.duration}s</Tag>

          {/* 操作按钮 - 直接显示 */}
          <div className="flex flex-col gap-0.5 mt-1">
            <Tooltip title={shot.confirmed ? '取消确认' : '确认'} placement="right">
              <Button
                size="small"
                type={shot.confirmed ? 'primary' : 'text'}
                className={actionBtnClass}
                icon={shot.confirmed ? <CheckCircleFilled /> : <CheckCircleOutlined />}
                onClick={() => onToggleConfirm(shot)}
              />
            </Tooltip>
            <Tooltip title="上移" placement="right">
              <Button size="small" type="text" className={actionBtnClass} icon={<ArrowUpOutlined />} disabled={isFirst} onClick={() => onMoveUp(shot.id)} />
            </Tooltip>
            <Tooltip title="下移" placement="right">
              <Button size="small" type="text" className={actionBtnClass} icon={<ArrowDownOutlined />} disabled={isLast} onClick={() => onMoveDown(shot.id)} />
            </Tooltip>
            <Tooltip title="上方插入" placement="right">
              <Button size="small" type="text" className={actionBtnClass} icon={<InsertRowAboveOutlined />} onClick={() => onInsertAbove(shot.id)} />
            </Tooltip>
            <Tooltip title="下方插入" placement="right">
              <Button size="small" type="text" className={actionBtnClass} icon={<InsertRowBelowOutlined />} onClick={() => onInsertBelow(shot.id)} />
            </Tooltip>
            <Tooltip title="向上合并" placement="right">
              <Button size="small" type="text" className={actionBtnClass} icon={<MergeCellsOutlined />} disabled={isFirst} onClick={() => onMergeUp(shot.id)} />
            </Tooltip>
            <Popconfirm title="确定删除？" onConfirm={() => onDelete(shot.id)} placement="right">
              <Button size="small" type="text" danger className={actionBtnClass} icon={<DeleteOutlined />} />
            </Popconfirm>
          </div>
        </div>

        {/* 列1: 剧本 */}
        <div className={`${SHOT_LAYOUT.colScript} border-r border-zinc-800 flex flex-col`}>
          <div className="flex-1 p-1">
            <TextArea
              value={shot.scriptContent || ''}
              onChange={(e) => onScriptChange(shot.id, e.target.value)}
              placeholder="剧本内容..."
              className="w-full h-full bg-transparent border-none resize-none text-xs focus:ring-0 placeholder-zinc-600"
              style={{ minHeight: '100%', padding: '4px 6px' }}
            />
          </div>
        </div>

        {/* 列2: 资产 */}
        <div className={`${SHOT_LAYOUT.colAssets} border-r border-zinc-800 flex flex-col justify-center bg-zinc-900/10 p-1.5 gap-0.5 overflow-y-auto`}>
          <AssetSelector
            type="character"
            selectedIds={shot.characters || []}
            allAssets={characters}
            onChange={(ids) => onCharactersChange(shot.id, ids)}
          />
          <AssetSelector
            type="scene"
            selectedIds={shot.scenes || []}
            allAssets={scenes}
            onChange={(ids) => onScenesChange?.(shot.id, ids)}
          />
          <AssetSelector
            type="prop"
            selectedIds={shot.props || []}
            allAssets={props}
            onChange={(ids) => onPropsChange?.(shot.id, ids)}
          />
        </div>

        {/* 列3: 图像设计 */}
        <div className={`${SHOT_LAYOUT.colImageDesign} border-r border-zinc-800 flex flex-col`}>
          {/* 提示词编辑器 + 浮动按钮 */}
          <div className="flex-1 p-1 min-h-0 relative">
            <ScriptEditor
              value={shot.imagePrompt || shot.description || ''}
              onChange={(value) => onImagePromptChange(shot.id, value)}
              placeholder="画面描述提示词..."
              mentionItems={mentionItems}
              enableCameraCommands={true}
              showLineNumbers={false}
              darkTheme={true}
              style={{ height: '100%' }}
              className="shot-prompt-editor"
            />
            {/* 右下角浮动区域：AI生成 + 参考图 */}
            <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
              {/* AI生成按钮 - 蓝色文字无边框 */}
              <button
                className="text-blue-400 hover:text-blue-300 text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleImagePromptClick}
                disabled={isGeneratingImagePrompt}
              >
                {isGeneratingImagePrompt ? '生成中...' : (hasImagePrompt ? '优化' : 'AI生成')}
              </button>
              {/* 参考图 */}
              {referenceImages.map((img, idx) => (
                <div
                  key={idx}
                  className={`relative h-7 w-7 rounded overflow-hidden cursor-pointer border ${
                    idx === (shot.selectedReferenceIndex || 0) ? 'border-blue-500' : 'border-zinc-600'
                  } shadow-lg`}
                  onClick={() => handleRefImageSelect(idx)}
                >
                  <img src={electronService.fs.toLocalUrl(img)} className="w-full h-full object-cover" alt="" />
                  <button
                    className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white text-[7px] rounded-full flex items-center justify-center hover:bg-red-600"
                    onClick={(e) => { e.stopPropagation(); handleRefImageDelete(idx); }}
                  >
                    <CloseOutlined />
                  </button>
                </div>
              ))}
              {/* 添加参考图按钮 */}
              <Tooltip title="添加参考图" placement="top">
                <label className="h-7 w-7 bg-zinc-800/90 border border-dashed border-zinc-600 rounded flex items-center justify-center cursor-pointer hover:border-zinc-500 hover:bg-zinc-700/90 text-zinc-400 shadow-lg">
                  <PlusOutlined className="text-[11px]" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleRefImageAdd} />
                </label>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* 列4: 图像结果 */}
        <div className={`${SHOT_LAYOUT.colImageResult} border-r border-zinc-800 flex flex-col bg-zinc-900/20`}>
          <div className="flex-1 p-1 min-h-0 overflow-y-auto custom-scrollbar flex items-center justify-center">
            {images.length === 0 && !isGeneratingImage ? (
              <Button
                type="primary"
                size="small"
                className="h-7 px-3 text-[11px]"
                onClick={() => onGenerateImage(shot.id)}
                disabled={!hasImagePrompt}
                icon={<PictureOutlined />}
              >
                生成图像
              </Button>
            ) : (
              <div className="w-full h-full">
                <ImageCardGrid
                  images={images}
                  selectedIndex={shot.currentImageIndex || 0}
                  onSelect={handleImageSelect}
                  onAdd={handleImageAdd}
                  onDelete={handleImageDelete}
                  isGenerating={isGeneratingImage}
                  disabled={!hasImagePrompt}
                  characters={characters}
                  scenes={scenes}
                  props={props}
                  compact
                />
              </div>
            )}
          </div>
        </div>

        {/* 列5: 视频设计 */}
        <div className={`${SHOT_LAYOUT.colVideoDesign} border-r border-zinc-800 flex flex-col`}>
          {/* 提示词编辑器 + 浮动按钮 */}
          <div className="flex-1 p-1 min-h-0 relative">
            <ScriptEditor
              value={shot.videoPrompt || ''}
              onChange={(value) => onVideoPromptChange(shot.id, value)}
              placeholder="运动/转场描述..."
              mentionItems={mentionItems}
              enableCameraCommands={true}
              showLineNumbers={false}
              darkTheme={true}
              style={{ height: '100%' }}
              className="shot-prompt-editor"
            />
            {/* 右下角浮动：AI生成按钮 */}
            <div className="absolute right-2 bottom-2">
              <button
                className="text-blue-400 hover:text-blue-300 text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleVideoPromptClick}
                disabled={isGeneratingVideoPrompt}
              >
                {isGeneratingVideoPrompt ? '生成中...' : (hasVideoPrompt ? '优化' : 'AI生成')}
              </button>
            </div>
          </div>
        </div>

        {/* 列6: 视频结果 */}
        <div className={`${SHOT_LAYOUT.colVideoResult} flex flex-col bg-zinc-900/20`}>
          <div className="flex-1 p-1 min-h-0 overflow-y-auto custom-scrollbar flex items-center justify-center">
            {videos.length === 0 && !isGeneratingVideo ? (
              <div className="flex flex-col items-center gap-2">
                <Button
                  type="primary"
                  size="small"
                  className="h-7 px-3 text-[11px]"
                  onClick={() => onGenerateVideo(shot.id)}
                  disabled={images.length === 0}
                  icon={<VideoCameraOutlined />}
                >
                  生成视频
                </Button>
                {currentVideo && (
                  <Button type="text" size="small" className="h-5 w-5 p-0" icon={<PlayCircleFilled />} onClick={() => setVideoModalOpen(true)} />
                )}
              </div>
            ) : (
              <div className="w-full h-full relative">
                <VideoCardGrid
                  videos={videos}
                  selectedIndex={shot.currentVideoIndex || 0}
                  onSelect={handleVideoSelect}
                  onDelete={handleVideoDelete}
                  isGenerating={isGeneratingVideo}
                  disabled={images.length === 0}
                  compact
                />
                {currentVideo && (
                  <Button
                    type="text"
                    size="small"
                    className="absolute top-0 right-0 h-5 w-5 p-0"
                    icon={<PlayCircleFilled />}
                    onClick={() => setVideoModalOpen(true)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 视频播放 Modal */}
      <Modal
        title={`分镜 #${index + 1} - 视频预览`}
        open={videoModalOpen}
        onCancel={() => setVideoModalOpen(false)}
        footer={null}
        width={800}
        centered
        destroyOnClose
      >
        <div className="aspect-video bg-black rounded overflow-hidden">
          <StagePlayer
            videoPath={currentVideo?.path}
            videoUrl={currentVideo?.url}
            poster={currentImage ? electronService.fs.toLocalUrl(currentImage) : undefined}
          />
        </div>
      </Modal>
    </div>
  );
};
