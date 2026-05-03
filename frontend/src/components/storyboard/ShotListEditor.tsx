/**
 * 分镜列表编辑器
 * 内联编辑模式，每行一个分镜
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button, Typography, Progress } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { StoryboardLayout } from './StoryboardLayout';
import { ShotListHeader } from './ShotListHeader';
import type { MentionItem } from '../../editor';
import type { Shot, Character, Scene, Prop, StoredMediaAsset } from '../../types';
import { ShotCard } from './ShotCard';

const { Text } = Typography;

export interface ShotListEditorProps {
  projectId: string;
  shots: Shot[];
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  mentionItems: MentionItem[];
  // 状态拆分：图片/视频提示词独立
  generatingImagePrompts: Set<string>;
  generatingVideoPrompts: Set<string>;
  generatingImages: Set<string>;
  generatingVideos: Set<string>;
  batchProgress?: { current: number; total: number; step?: string };
  activeShotId?: string | null;
  onActiveShotChange?: (shotId: string | null) => void;
  onScriptChange: (shotId: string, script: string) => void;
  onImagePromptChange: (shotId: string, imagePrompt: string) => void;
  onVideoPromptChange: (shotId: string, videoPrompt: string) => void;
  onDurationChange?: (shotId: string, duration: number) => void;
  onCharactersChange: (shotId: string, characterIds: string[]) => void;
  onScenesChange?: (shotId: string, sceneIds: string[]) => void;
  onPropsChange?: (shotId: string, propIds: string[]) => void;
  onReferenceImagesChange?: (shotId: string, assets: StoredMediaAsset[], selectedIndex: number) => void;
  onImagesChange: (shotId: string, assets: StoredMediaAsset[], selectedIndex: number) => void;
  onVideosChange: (shotId: string, assets: StoredMediaAsset[], selectedIndex: number) => void;
  // 回调拆分：生成 vs 优化，图片 vs 视频
  onGenerateImagePrompt: (shotId: string) => void;
  onGenerateVideoPrompt: (shotId: string) => void;
  onOptimizeImagePrompt: (shotId: string, currentPrompt: string) => void;
  onOptimizeVideoPrompt: (shotId: string, currentPrompt: string) => void;
  onBatchGenerateImagePrompts: (shotIds?: string[]) => void;
  onBatchReGenerateImagePrompts: (shotIds?: string[]) => void;
  onBatchGenerateVideoPrompts: (shotIds?: string[]) => void;
  onBatchReGenerateVideoPrompts: (shotIds?: string[]) => void;
  onGenerateImage: (shotId: string) => void;
  onBatchGenerateImages: (shotIds?: string[]) => void;
  onBatchReGenerateImages: (shotIds?: string[]) => void;
  onGenerateVideo: (shotId: string) => void;
  onBatchGenerateVideos: (shotIds?: string[]) => void;
  onBatchReGenerateVideos: (shotIds?: string[]) => void;
  getVideoCapabilityLabel?: (shotId: string) => string | undefined;
  getVideoGenerateDisabledReason?: (shotId: string) => string | undefined;
  onToggleConfirm: (shot: Shot) => void;
  onDelete: (shotId: string) => void;
  onBatchDelete: (shotIds: string[]) => void;
  onBatchConfirm: (shotIds: string[], confirm: boolean) => void;
  onMergeUp: (shotId: string) => void;
  onMergeDown: (shotId: string) => void;
  onMoveUp: (shotId: string) => void;
  onMoveDown: (shotId: string) => void;
  onAddShot: () => void;
  onInsertAbove: (shotId: string) => void;
  onInsertBelow: (shotId: string) => void;
  onShotImageModeChange: (shotId: string, mode: 'normal' | 'grid-9' | 'grid-4') => void;
  onShotVideoModeChange?: (shotId: string, mode: 'multi-ref' | 'first-frame') => void;
  onBulkVideoModeChange?: (mode: 'multi-ref' | 'first-frame') => void;
  /** 当前项目选择的 ITV 渠道时长规格，透传给 ShotCard 决定时长控件渲染方式 */
  durationSpec?: import('../../providers/itv/durationSpec').VideoDurationSpec;
  /** 单镜头视频生成进度（按 shotId 聚合），透传给 ShotCard 渲染百分比与阶段文本 */
  videoProgressMap?: Map<string, { progress: number; step: string }>;
}

export const ShotListEditor: React.FC<ShotListEditorProps> = ({
  projectId,
  shots,
  characters,
  scenes,
  props,
  mentionItems,
  generatingImagePrompts,
  generatingVideoPrompts,
  generatingImages,
  generatingVideos,
  batchProgress,
  activeShotId,
  onActiveShotChange,
  onScriptChange,
  onImagePromptChange,
  onVideoPromptChange,
  onDurationChange,
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
  onBatchGenerateImagePrompts,
  onBatchReGenerateImagePrompts,
  onBatchGenerateVideoPrompts,
  onBatchReGenerateVideoPrompts,
  onGenerateImage,
  onBatchGenerateImages,
  onBatchReGenerateImages,
  onGenerateVideo,
  onBatchGenerateVideos,
  onBatchReGenerateVideos,
  getVideoCapabilityLabel,
  getVideoGenerateDisabledReason,
  onToggleConfirm,
  onDelete,
  onBatchDelete,
  onBatchConfirm: _onBatchConfirm,
  onMergeUp,
  onMergeDown,
  onMoveUp,
  onMoveDown,
  onAddShot,
  onInsertAbove,
  onInsertBelow,
  onShotImageModeChange,
  onShotVideoModeChange,
  onBulkVideoModeChange,
  durationSpec,
  videoProgressMap,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const selectedCount = selectedIds.size;
  const hasSelected = selectedCount > 0;
  const isAllSelected = shots.length > 0 && selectedIds.size === shots.length;
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < shots.length;

  // 全选
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(shots.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [shots]);

  // 单选
  const handleSelectChange = useCallback((shotId: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(shotId);
      } else {
        next.delete(shotId);
      }
      return next;
    });
  }, []);

  // 批量操作
  const handleBatchPrompts = useCallback(() => {
    onBatchGenerateImagePrompts(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchGenerateImagePrompts]);

  const handleBatchRePrompts = useCallback(() => {
    onBatchReGenerateImagePrompts(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchReGenerateImagePrompts]);

  const handleBatchImages = useCallback(() => {
    onBatchGenerateImages(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchGenerateImages]);

  const handleBatchReImages = useCallback(() => {
    onBatchReGenerateImages(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchReGenerateImages]);

  const handleBatchVideos = useCallback(() => {
    onBatchGenerateVideos(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchGenerateVideos]);

  const handleBatchReVideos = useCallback(() => {
    onBatchReGenerateVideos(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchReGenerateVideos]);

  const handleBatchVideoPrompts = useCallback(() => {
    onBatchGenerateVideoPrompts(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchGenerateVideoPrompts]);

  const handleBatchReVideoPrompts = useCallback(() => {
    onBatchReGenerateVideoPrompts(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchReGenerateVideoPrompts]);

  const handleBatchDelete = useCallback(() => {
    if (hasSelected) {
      onBatchDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  }, [hasSelected, selectedIds, onBatchDelete]);

  // 当外部切换 activeShotId 时，把对应行滚动到可视区域内
  useEffect(() => {
    if (!activeShotId) return;
    const idx = shots.findIndex((s) => s.id === activeShotId);
    if (idx < 0) return;
    virtuosoRef.current?.scrollIntoView({
      index: idx,
      align: 'center',
      behavior: 'smooth',
    });
  }, [activeShotId, shots]);

  const renderShotRow = useCallback(
    (index: number, shot: Shot) => (
      <ShotCard
        projectId={projectId}
        shot={shot}
        index={index}
        totalCount={shots.length}
        characters={characters}
        scenes={scenes}
        props={props}
        mentionItems={mentionItems}
        isSelected={selectedIds.has(shot.id)}
        isActive={activeShotId === shot.id}
        isGeneratingImagePrompt={generatingImagePrompts.has(shot.id)}
        isGeneratingVideoPrompt={generatingVideoPrompts.has(shot.id)}
        isGeneratingImage={generatingImages.has(shot.id)}
        isGeneratingVideo={generatingVideos.has(shot.id)}
        onSelectChange={handleSelectChange}
        onActivate={onActiveShotChange}
        onScriptChange={onScriptChange}
        onImagePromptChange={onImagePromptChange}
        onVideoPromptChange={onVideoPromptChange}
        onDurationChange={onDurationChange}
        onImageModeChange={onShotImageModeChange}
        onVideoModeChange={onShotVideoModeChange}
        onCharactersChange={onCharactersChange}
        onScenesChange={onScenesChange}
        onPropsChange={onPropsChange}
        onReferenceImagesChange={onReferenceImagesChange}
        onImagesChange={onImagesChange}
        onVideosChange={onVideosChange}
        onGenerateImagePrompt={onGenerateImagePrompt}
        onGenerateVideoPrompt={onGenerateVideoPrompt}
        onOptimizeImagePrompt={onOptimizeImagePrompt}
        onOptimizeVideoPrompt={onOptimizeVideoPrompt}
        onGenerateImage={onGenerateImage}
        onGenerateVideo={onGenerateVideo}
        videoCapabilityLabel={getVideoCapabilityLabel?.(shot.id)}
        videoGenerateDisabledReason={getVideoGenerateDisabledReason?.(shot.id)}
        onToggleConfirm={onToggleConfirm}
        onDelete={onDelete}
        onMergeUp={onMergeUp}
        onMergeDown={onMergeDown}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onInsertAbove={onInsertAbove}
        onInsertBelow={onInsertBelow}
        durationSpec={durationSpec}
        videoProgress={videoProgressMap?.get(shot.id)}
      />
    ),
    [
      projectId,
      shots.length,
      characters,
      scenes,
      props,
      mentionItems,
      selectedIds,
      activeShotId,
      generatingImagePrompts,
      generatingVideoPrompts,
      generatingImages,
      generatingVideos,
      handleSelectChange,
      onActiveShotChange,
      onScriptChange,
      onImagePromptChange,
      onVideoPromptChange,
      onDurationChange,
      onShotImageModeChange,
      onShotVideoModeChange,
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
      getVideoCapabilityLabel,
      getVideoGenerateDisabledReason,
      onToggleConfirm,
      onDelete,
      onMergeUp,
      onMergeDown,
      onMoveUp,
      onMoveDown,
      onInsertAbove,
      onInsertBelow,
    ],
  );

  return (
    <StoryboardLayout>
      <div className="flex flex-col h-full">
        {/* 批量进度 */}
        {batchProgress && batchProgress.total > 0 && (
          <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
            <Progress
              percent={Math.round((batchProgress.current / batchProgress.total) * 100)}
              size="small"
              status="active"
              strokeColor="var(--token-accent-base)"
              trailColor="var(--token-border-subtle)"
            />
            <Text type="secondary" className="batchProgressStep">
              {batchProgress.step || `${batchProgress.current}/${batchProgress.total}`}
            </Text>
          </div>
        )}

        {/* 分镜列表 */}
        {shots.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <Text type="secondary">暂无分镜数据</Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={onAddShot} className="emptyAddButton">
              添加分镜
            </Button>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* 公共表头 - 集成全选和批量操作；置于虚拟滚动外，长列表滚动时常驻可见 */}
            <ShotListHeader
              totalCount={shots.length}
              selectedCount={selectedCount}
              isAllSelected={isAllSelected}
              isIndeterminate={isIndeterminate}
              generatingImagePrompts={generatingImagePrompts.size > 0}
              generatingVideoPrompts={generatingVideoPrompts.size > 0}
              generatingImages={generatingImages.size > 0}
              generatingVideos={generatingVideos.size > 0}
              onSelectAll={handleSelectAll}
              onBatchPrompts={handleBatchPrompts}
              onBatchRePrompts={handleBatchRePrompts}
              onBatchImages={handleBatchImages}
              onBatchReImages={handleBatchReImages}
              onBatchVideos={handleBatchVideos}
              onBatchReVideos={handleBatchReVideos}
              onBatchVideoPrompts={handleBatchVideoPrompts}
              onBatchReVideoPrompts={handleBatchReVideoPrompts}
              onBulkVideoModeChange={onBulkVideoModeChange}
              onAddShot={onAddShot}
              onBatchDelete={handleBatchDelete}
            />
            {/* 虚拟滚动：变高行由 react-virtuoso 自动测量 */}
            <Virtuoso
              ref={virtuosoRef}
              data={shots}
              computeItemKey={(_, shot) => shot.id}
              itemContent={renderShotRow}
              increaseViewportBy={400}
              className="virtuosoScroller"
            />
          </div>
        )}
      </div>
    </StoryboardLayout>
  );
};

export default ShotListEditor;
