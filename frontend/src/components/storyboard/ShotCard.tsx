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
  Empty,
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
  UserOutlined,
  EnvironmentOutlined,
  ToolOutlined,
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
  onPropsChange?: (shotId: string, propIds: string[]) => void;
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
  onPropsChange,
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

  // 当前选中图片
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
      <div className="h-10 px-4 flex items-center justify-between bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-3">
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

      {/* 主体: 6 列 Asset Channel 布局 */}
      <div className="flex items-stretch min-h-[280px] bg-zinc-950 overflow-x-auto">

        {/* 列1: 剧本 (15%) */}
        <div className="w-[15%] min-w-[150px] border-r border-zinc-800 flex flex-col shrink-0">
          <div className="px-4 py-2.5 text-xs font-medium text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
            剧本
          </div>
          <div className="flex-1 p-3">
            <TextArea
              value={shot.scriptContent || ''}
              onChange={(e) => onScriptChange(shot.id, e.target.value)}
              placeholder="剧本内容..."
              className="w-full h-full bg-transparent border-none resize-none text-sm focus:ring-0 placeholder-zinc-600"
              style={{ minHeight: '100%' }}
            />
          </div>
        </div>

        {/* 列2: 资产 (15%) - 角色/场景/道具 */}
        <div className="w-[15%] min-w-[150px] border-r border-zinc-800 flex flex-col shrink-0 bg-zinc-900/10">
          <div className="px-4 py-2.5 text-xs font-medium text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
            资产
          </div>
          <div className="p-3 space-y-4 overflow-y-auto flex-1">
            <div>
              <div className="text-[11px] text-zinc-500 mb-2 flex items-center gap-1.5">
                <UserOutlined className="text-blue-400" /> 角色
              </div>
              <Select
                mode="multiple"
                size="small"
                placeholder="选择角色"
                value={shot.characters || []}
                onChange={(value) => onCharactersChange(shot.id, value)}
                className="w-full"
                maxTagCount="responsive"
                options={characters.map(c => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 mb-2 flex items-center gap-1.5">
                <EnvironmentOutlined className="text-green-400" /> 场景
              </div>
              <Select
                mode="multiple"
                size="small"
                placeholder="选择场景"
                value={shot.scenes || []}
                onChange={(value) => onScenesChange?.(shot.id, value)}
                className="w-full"
                maxTagCount="responsive"
                options={scenes.map(s => ({ value: s.id, label: s.name }))}
              />
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 mb-2 flex items-center gap-1.5">
                <ToolOutlined className="text-orange-400" /> 道具
              </div>
              <Select
                mode="multiple"
                size="small"
                placeholder="选择道具"
                value={shot.props || []}
                onChange={(value) => onPropsChange?.(shot.id, value)}
                className="w-full"
                maxTagCount="responsive"
                options={props.map(p => ({ value: p.id, label: p.name }))}
              />
            </div>
          </div>
        </div>

        {/* 列3: 图像设计 (20%) - 参考图在上，提示词在下 */}
        <div className="w-[20%] min-w-[200px] border-r border-zinc-800 flex flex-col shrink-0">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs font-medium text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
            <span>图像设计</span>
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

          {/* 参考图区域 - 在上 */}
          <div className="p-3 border-b border-zinc-800/50 bg-zinc-900/20">
            <div className="text-[11px] text-zinc-500 mb-2">参考图 (ControlNet)</div>
            {referenceImages.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {referenceImages.map((img, idx) => (
                  <div
                    key={idx}
                    className={`relative h-14 aspect-square rounded overflow-hidden cursor-pointer border-2 shrink-0 ${
                      idx === (shot.selectedReferenceIndex || 0) ? 'border-blue-500' : 'border-zinc-700'
                    }`}
                    onClick={() => handleRefImageSelect(idx)}
                  >
                    <img src={electronService.fs.toLocalUrl(img)} className="w-full h-full object-cover" alt="" />
                    <button
                      className="absolute top-0 right-0 w-4 h-4 bg-red-500/80 text-white text-xs rounded-bl hover:bg-red-500"
                      onClick={(e) => { e.stopPropagation(); handleRefImageDelete(idx); }}
                    >×</button>
                  </div>
                ))}
                <label className="h-14 aspect-square border border-dashed border-zinc-600 rounded flex items-center justify-center cursor-pointer hover:border-zinc-500 shrink-0">
                  <PictureOutlined className="text-zinc-500" />
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleRefImageAdd(URL.createObjectURL(file));
                  }} />
                </label>
              </div>
            ) : (
              <label className="w-full h-14 border border-dashed border-zinc-600 rounded flex items-center justify-center cursor-pointer hover:border-zinc-500">
                <div className="text-zinc-500 text-xs flex items-center gap-2">
                  <PictureOutlined />
                  <span>添加参考图</span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleRefImageAdd(URL.createObjectURL(file));
                }} />
              </label>
            )}
          </div>

          {/* 提示词区域 - 在下 */}
          <div className="flex-1 relative min-h-[120px]">
            <div className="absolute inset-0 p-3">
              <ScriptEditor
                value={shot.imagePrompt || shot.description || ''}
                onChange={(value) => onImagePromptChange(shot.id, value)}
                placeholder="画面描述提示词..."
                mentionItems={mentionItems}
                enableKeywordHighlight={true}
                showLineNumbers={false}
                darkTheme={true}
                style={{ height: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* 列4: 图像结果 (15%) */}
        <div className="w-[15%] min-w-[160px] border-r border-zinc-800 flex flex-col bg-zinc-900/20 shrink-0">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs font-medium text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
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
          <div className="flex-1 p-3 min-h-0 overflow-y-auto custom-scrollbar">
            {images.length === 0 && !isGeneratingImage ? (
              <div className="h-full flex items-center justify-center">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<span className="text-zinc-600 text-xs">暂无图片</span>}
                />
              </div>
            ) : (
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
            )}
          </div>
        </div>

        {/* 列5: 视频设计 (20%) */}
        <div className="w-[20%] min-w-[200px] border-r border-zinc-800 flex flex-col shrink-0">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs font-medium text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
            <span>视频提示词</span>
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
          <div className="flex-1 relative min-h-0 p-3">
            <div className="absolute inset-3">
              <ScriptEditor
                value={shot.videoPrompt || ''}
                onChange={(value) => onVideoPromptChange(shot.id, value)}
                placeholder="运动/转场描述..."
                mentionItems={mentionItems}
                enableKeywordHighlight={true}
                showLineNumbers={false}
                darkTheme={true}
                style={{ height: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* 列6: 视频结果 (15%) */}
        <div className="w-[15%] min-w-[160px] flex flex-col bg-zinc-900/20 shrink-0">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs font-medium text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
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
          <div className="flex-1 p-3 min-h-0 overflow-y-auto custom-scrollbar relative">
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
            {videos.length === 0 && !isGeneratingVideo ? (
              <div className="h-full flex items-center justify-center">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<span className="text-zinc-600 text-xs">暂无视频</span>}
                />
              </div>
            ) : (
              <VideoCardGrid
                videos={videos}
                selectedIndex={shot.currentVideoIndex || 0}
                onSelect={handleVideoSelect}
                onDelete={handleVideoDelete}
                isGenerating={isGeneratingVideo}
                disabled={images.length === 0}
                compact
              />
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
