import React, { useMemo, useCallback, useState } from 'react';
import {
  Tag,
  Checkbox,
  Tooltip,
  Button,
  Popconfirm,
  Input,
  Select,
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
  PictureOutlined,
  PlayCircleFilled,
} from '@ant-design/icons';
import type { Shot, Character, Scene, Prop, ShotVideo } from '../../types';
import { ScriptEditor } from '../../editor';
import type { MentionItem } from '../../editor';
import { ImageCardGrid } from '../asset/ImageCardGrid';
import { VideoCardGrid } from '../asset/VideoCardGrid';
import { StagePlayer } from '../video/StagePlayer';
import { electronService } from '../../services/electronService';
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
  isGeneratingPrompt: boolean;
  isGeneratingImage: boolean;
  isGeneratingVideo: boolean;
  onSelectChange: (shotId: string, selected: boolean) => void;
  onActivate?: (shotId: string | null) => void;
  onScriptChange: (shotId: string, script: string) => void;
  onImagePromptChange: (shotId: string, imagePrompt: string) => void;
  onVideoPromptChange: (shotId: string, videoPrompt: string) => void;
  onCharactersChange: (shotId: string, characterIds: string[]) => void;
  onScenesChange?: (shotId: string, sceneIds: string[]) => void;
  onReferenceImagesChange?: (shotId: string, images: string[], selectedIndex: number) => void;
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
  isActive,
  isGeneratingPrompt,
  isGeneratingImage,
  isGeneratingVideo,
  onSelectChange,
  onActivate,
  onScriptChange,
  onImagePromptChange,
  onVideoPromptChange,
  onCharactersChange,
  onScenesChange,
  onReferenceImagesChange,
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
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  const hasImagePrompt = !!(shot.imagePrompt?.trim() || shot.description?.trim());
  const hasVideoPrompt = !!shot.videoPrompt?.trim();
  const isFirst = index === 0;
  const isLast = index === totalCount - 1;

  // 点击卡片激活
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.ant-btn, .ant-checkbox, .ant-input, .ant-select, .ant-tabs, .cm-editor, .ant-modal')) {
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

  // 参考图列表
  const referenceImages = shot.referenceImages || [];

  const videos = shot.videos || [];

  // 当前选中视频
  const currentVideo = useMemo(() => {
    if (!videos.length) return null;
    const idx = shot.currentVideoIndex ?? shot.selectedVideoIndex ?? videos.length - 1;
    return videos[idx] || videos[videos.length - 1];
  }, [videos, shot.currentVideoIndex, shot.selectedVideoIndex]);

  // 当前选中图片（用于视频预览封面）
  const currentImage = useMemo(() => {
    if (!images.length) return null;
    return images[shot.currentImageIndex || 0];
  }, [images, shot.currentImageIndex]);

  // 生成结果图片操作
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
  const handleRefImageSelect = (idx: number) => {
    onReferenceImagesChange?.(shot.id, referenceImages, idx);
  };
  const handleRefImageAdd = (path: string) => {
    const newRefs = [...referenceImages, path];
    onReferenceImagesChange?.(shot.id, newRefs, newRefs.length - 1);
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

  return (
    <div
      className={`shot-card ${isSelected ? 'selected' : ''} ${shot.confirmed ? 'confirmed' : ''} ${isActive ? 'active' : ''}`}
      onClick={handleCardClick}
    >
      {/* Header: 精简版 40px */}
      <div className="h-10 px-3 flex items-center justify-between bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={isSelected}
            onChange={(e) => onSelectChange(shot.id, e.target.checked)}
          />
          <span className="font-semibold text-zinc-400">#{index + 1}</span>
          <Tag className="m-0" color="blue">{shot.duration}s</Tag>
          {shot.confirmed && <CheckCircleFilled className="text-emerald-500" />}
        </div>

        <div className="flex items-center gap-1">
          <Tooltip title={shot.confirmed ? '取消确认' : '确认'}>
            <Button
              size="small"
              type={shot.confirmed ? 'primary' : 'text'}
              icon={shot.confirmed ? <CheckCircleFilled /> : <CheckCircleOutlined />}
              onClick={() => onToggleConfirm(shot)}
            />
          </Tooltip>
          <Tooltip title="上移">
            <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={isFirst} onClick={() => onMoveUp(shot.id)} />
          </Tooltip>
          <Tooltip title="下移">
            <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={isLast} onClick={() => onMoveDown(shot.id)} />
          </Tooltip>
          <Popconfirm title="确定删除？" onConfirm={() => onDelete(shot.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
          <Tooltip title="上方插入">
            <Button size="small" type="text" icon={<InsertRowAboveOutlined />} onClick={() => onInsertAbove(shot.id)} />
          </Tooltip>
          <Tooltip title="下方插入">
            <Button size="small" type="text" icon={<InsertRowBelowOutlined />} onClick={() => onInsertBelow(shot.id)} />
          </Tooltip>
          <Tooltip title="向上合并">
            <Button size="small" type="text" icon={<MergeCellsOutlined />} disabled={isFirst} onClick={() => onMergeUp(shot.id)} />
          </Tooltip>
          <Tooltip title="向下合并">
            <Button size="small" type="text" icon={<MergeCellsOutlined style={{ transform: 'rotate(180deg)' }} />} disabled={isLast} onClick={() => onMergeDown(shot.id)} />
          </Tooltip>
        </div>
      </div>

      {/* 主体: 5 列 Pipeline 布局 */}
      <div className="flex items-stretch min-h-[320px] bg-zinc-950">

        {/* 列1: 剧本 & 元数据 (20%) */}
        <div className="w-[20%] min-w-[180px] border-r border-zinc-800 flex flex-col">
          <div className="px-3 py-2 text-xs font-medium text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
            剧本 & 设定
          </div>
          <div className="p-2 border-b border-zinc-800/50 space-y-2">
            <Select
              mode="multiple"
              size="small"
              placeholder="涉及角色"
              value={shot.characters || []}
              onChange={(value) => onCharactersChange(shot.id, value)}
              className="w-full"
              maxTagCount={1}
              options={characters.map(c => ({ value: c.id, label: c.name }))}
            />
            <Select
              mode="multiple"
              size="small"
              placeholder="涉及场景"
              value={shot.scenes || []}
              onChange={(value) => onScenesChange?.(shot.id, value)}
              className="w-full"
              maxTagCount={1}
              options={scenes.map(s => ({ value: s.id, label: s.name }))}
            />
          </div>
          <TextArea
            value={shot.scriptContent || ''}
            onChange={(e) => onScriptChange(shot.id, e.target.value)}
            placeholder="剧本内容..."
            className="flex-1 w-full bg-transparent border-none resize-none p-3 text-sm focus:ring-0 placeholder-zinc-700"
            style={{ minHeight: 0 }}
          />
        </div>

        {/* 列2: 图像设计 (22%) - 提示词 + 参考图 */}
        <div className="w-[22%] min-w-[200px] border-r border-zinc-800 flex flex-col">
          <div className="px-3 py-2 flex items-center justify-between text-xs font-medium text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
            <span>文生图提示词</span>
            <Button
              type="link"
              size="small"
              className="p-0 h-auto text-xs"
              onClick={() => onGeneratePrompt(shot.id)}
              disabled={isGeneratingPrompt}
              loading={isGeneratingPrompt}
            >
              {hasImagePrompt ? '优化' : 'AI生成'}
            </Button>
          </div>
          <div className="flex-1 relative min-h-[120px]">
            <div className="absolute inset-0">
              <ScriptEditor
                value={shot.imagePrompt || shot.description || ''}
                onChange={(value) => onImagePromptChange(shot.id, value)}
                placeholder="画面描述..."
                mentionItems={mentionItems}
                enableKeywordHighlight={true}
                showLineNumbers={false}
                darkTheme={true}
                style={{ height: '100%' }}
              />
            </div>
          </div>
          {/* 参考图区域 */}
          <div className="h-[100px] border-t border-zinc-800 bg-zinc-900/30 p-2">
            <div className="text-xs text-zinc-600 mb-1">参考图 (ControlNet)</div>
            {referenceImages.length > 0 ? (
              <div className="flex gap-1 overflow-x-auto h-[60px]">
                {referenceImages.map((img, idx) => (
                  <div
                    key={idx}
                    className={`relative h-full aspect-square rounded overflow-hidden cursor-pointer border-2 ${
                      idx === (shot.selectedReferenceIndex || 0) ? 'border-blue-500' : 'border-transparent'
                    }`}
                    onClick={() => handleRefImageSelect(idx)}
                  >
                    <img src={electronService.fs.toLocalUrl(img)} className="w-full h-full object-cover" alt="" />
                    <button
                      className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-xs rounded-bl"
                      onClick={(e) => { e.stopPropagation(); handleRefImageDelete(idx); }}
                    >×</button>
                  </div>
                ))}
                <label className="h-full aspect-square border border-dashed border-zinc-700 rounded flex items-center justify-center cursor-pointer hover:border-zinc-500">
                  <PictureOutlined className="text-zinc-600" />
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleRefImageAdd(URL.createObjectURL(file));
                  }} />
                </label>
              </div>
            ) : (
              <label className="w-full h-[60px] border border-dashed border-zinc-700 rounded flex items-center justify-center cursor-pointer hover:border-zinc-500">
                <div className="text-zinc-600 text-xs flex flex-col items-center">
                  <PictureOutlined />
                  <span className="mt-1">添加参考图</span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleRefImageAdd(URL.createObjectURL(file));
                }} />
              </label>
            )}
          </div>
        </div>

        {/* 列3: 图像结果 (18%) */}
        <div className="w-[18%] min-w-[160px] border-r border-zinc-800 flex flex-col bg-zinc-900/20">
          <div className="px-3 py-2 flex items-center justify-between text-xs font-medium text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
            <span>生成结果</span>
            <Button
              type="link"
              size="small"
              className="p-0 h-auto text-xs"
              onClick={() => onGenerateImage(shot.id)}
              disabled={!hasImagePrompt || isGeneratingImage}
              loading={isGeneratingImage}
            >
              生成
            </Button>
          </div>
          <div className="flex-1 p-2 min-h-0 overflow-y-auto custom-scrollbar">
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
        </div>

        {/* 列4: 视频设计 (22%) */}
        <div className="w-[22%] min-w-[200px] border-r border-zinc-800 flex flex-col">
          <div className="px-3 py-2 flex items-center justify-between text-xs font-medium text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
            <span>图生视频提示词</span>
            <Button
              type="link"
              size="small"
              className="p-0 h-auto text-xs"
              onClick={() => onGeneratePrompt(shot.id)}
              disabled={isGeneratingPrompt}
              loading={isGeneratingPrompt}
            >
              {hasVideoPrompt ? '优化' : 'AI生成'}
            </Button>
          </div>
          <div className="flex-1 relative min-h-0">
            <div className="absolute inset-0">
              <ScriptEditor
                value={shot.videoPrompt || ''}
                onChange={(value) => onVideoPromptChange(shot.id, value)}
                placeholder="运动描述..."
                mentionItems={mentionItems}
                enableKeywordHighlight={true}
                showLineNumbers={false}
                darkTheme={true}
                style={{ height: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* 列5: 视频结果 (18%) */}
        <div className="w-[18%] min-w-[160px] flex flex-col bg-zinc-900/20">
          <div className="px-3 py-2 flex items-center justify-between text-xs font-medium text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
            <span>最终视频</span>
            <Button
              type="link"
              size="small"
              className="p-0 h-auto text-xs"
              onClick={() => onGenerateVideo(shot.id)}
              disabled={images.length === 0 || isGeneratingVideo}
              loading={isGeneratingVideo}
            >
              生成
            </Button>
          </div>
          <div className="flex-1 p-2 min-h-0 overflow-y-auto custom-scrollbar relative">
            {/* 视频播放按钮 */}
            {currentVideo && (
              <Button
                type="primary"
                shape="circle"
                size="large"
                icon={<PlayCircleFilled />}
                className="absolute top-4 right-4 z-10"
                onClick={() => setVideoModalOpen(true)}
              />
            )}
            <VideoCardGrid
              videos={videos}
              selectedIndex={shot.currentVideoIndex || 0}
              onSelect={handleVideoSelect}
              onDelete={handleVideoDelete}
              isGenerating={isGeneratingVideo}
              disabled={images.length === 0}
              compact
            />
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
