/**
 * 分镜列表编辑器
 * 内联编辑模式，每行一个分镜
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Button, Typography, Progress } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Virtuoso } from 'react-virtuoso';
import { StoryboardLayout } from './StoryboardLayout';
import { ShotListHeader } from './ShotListHeader';
import type { MentionItem } from '../../editor';
import type { Shot, Character, Scene, Prop, StoredMediaAsset } from '../../types';
import { ShotCard } from './ShotCard';

const { Text } = Typography;
const DEFAULT_VIRTUAL_ROW_HEIGHT = 138;

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
  selectedShotIds?: string[];
  onActiveShotChange?: (shotId: string | null) => void;
  onSelectedShotIdsChange?: (shotIds: string[]) => void;
  onScriptChange: (shotId: string, script: string) => void;
  onImagePromptChange: (shotId: string, imagePrompt: string) => void;
  onVideoPromptChange: (shotId: string, videoPrompt: string) => void;
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
  onShotImageModeChange: (shotId: string, mode: 'normal' | 'grid') => void;
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
  selectedShotIds,
  onActiveShotChange,
  onSelectedShotIdsChange,
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
}) => {
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  const selectedIdSet = useMemo(
    () => (selectedShotIds ? new Set(selectedShotIds) : internalSelectedIds),
    [internalSelectedIds, selectedShotIds],
  );

  const updateSelectedIds = useCallback((next: Set<string>) => {
    if (selectedShotIds) {
      onSelectedShotIdsChange?.(Array.from(next));
      return;
    }
    setInternalSelectedIds(next);
    onSelectedShotIdsChange?.(Array.from(next));
  }, [onSelectedShotIdsChange, selectedShotIds]);

  const selectedCount = selectedIdSet.size;
  const hasSelected = selectedCount > 0;
  const isAllSelected = shots.length > 0 && selectedIdSet.size === shots.length;
  const isIndeterminate = selectedIdSet.size > 0 && selectedIdSet.size < shots.length;

  // 全选
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      updateSelectedIds(new Set(shots.map(s => s.id)));
    } else {
      updateSelectedIds(new Set());
    }
  }, [shots, updateSelectedIds]);

  // 单选
  const handleSelectChange = useCallback((shotId: string, selected: boolean) => {
    const next = new Set(selectedIdSet);
    if (selected) {
      next.add(shotId);
    } else {
      next.delete(shotId);
    }
    updateSelectedIds(next);
  }, [selectedIdSet, updateSelectedIds]);

  // 批量操作
  const handleBatchPrompts = useCallback(() => {
    onBatchGenerateImagePrompts(hasSelected ? Array.from(selectedIdSet) : undefined);
  }, [hasSelected, selectedIdSet, onBatchGenerateImagePrompts]);

  const handleBatchRePrompts = useCallback(() => {
    onBatchReGenerateImagePrompts(hasSelected ? Array.from(selectedIdSet) : undefined);
  }, [hasSelected, selectedIdSet, onBatchReGenerateImagePrompts]);

  const handleBatchImages = useCallback(() => {
    onBatchGenerateImages(hasSelected ? Array.from(selectedIdSet) : undefined);
  }, [hasSelected, selectedIdSet, onBatchGenerateImages]);

  const handleBatchReImages = useCallback(() => {
    onBatchReGenerateImages(hasSelected ? Array.from(selectedIdSet) : undefined);
  }, [hasSelected, selectedIdSet, onBatchReGenerateImages]);

  const handleBatchVideos = useCallback(() => {
    onBatchGenerateVideos(hasSelected ? Array.from(selectedIdSet) : undefined);
  }, [hasSelected, selectedIdSet, onBatchGenerateVideos]);

  const handleBatchReVideos = useCallback(() => {
    onBatchReGenerateVideos(hasSelected ? Array.from(selectedIdSet) : undefined);
  }, [hasSelected, selectedIdSet, onBatchReGenerateVideos]);

  const handleBatchVideoPrompts = useCallback(() => {
    onBatchGenerateVideoPrompts(hasSelected ? Array.from(selectedIdSet) : undefined);
  }, [hasSelected, selectedIdSet, onBatchGenerateVideoPrompts]);

  const handleBatchReVideoPrompts = useCallback(() => {
    onBatchReGenerateVideoPrompts(hasSelected ? Array.from(selectedIdSet) : undefined);
  }, [hasSelected, selectedIdSet, onBatchReGenerateVideoPrompts]);

  const handleBatchDelete = useCallback(() => {
    if (hasSelected) {
      onBatchDelete(Array.from(selectedIdSet));
      updateSelectedIds(new Set());
    }
  }, [hasSelected, selectedIdSet, onBatchDelete, updateSelectedIds]);

  const renderShotRow = useCallback((actualIndex: number, shot: Shot) => (
    <ShotCard
      projectId={projectId}
      shot={shot}
      index={actualIndex}
      totalCount={shots.length}
      characters={characters}
      scenes={scenes}
      props={props}
      mentionItems={mentionItems}
      isSelected={selectedIdSet.has(shot.id)}
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
      onImageModeChange={onShotImageModeChange}
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
    />
  ), [
    activeShotId,
    characters,
    generatingImagePrompts,
    generatingImages,
    generatingVideoPrompts,
    generatingVideos,
    getVideoCapabilityLabel,
    getVideoGenerateDisabledReason,
    handleSelectChange,
    mentionItems,
    onActiveShotChange,
    onCharactersChange,
    onDelete,
    onGenerateImage,
    onGenerateImagePrompt,
    onGenerateVideo,
    onGenerateVideoPrompt,
    onImagePromptChange,
    onImagesChange,
    onInsertAbove,
    onInsertBelow,
    onMergeDown,
    onMergeUp,
    onMoveDown,
    onMoveUp,
    onOptimizeImagePrompt,
    onOptimizeVideoPrompt,
    onPropsChange,
    onReferenceImagesChange,
    onScenesChange,
    onScriptChange,
    onShotImageModeChange,
    onToggleConfirm,
    onVideoPromptChange,
    onVideosChange,
    projectId,
    props,
    scenes,
    selectedIdSet,
    shots.length,
  ]);

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
              strokeColor="#10b981"
            />
            <Text type="secondary" style={{ fontSize: 10 }}>
              {batchProgress.step || `${batchProgress.current}/${batchProgress.total}`}
            </Text>
          </div>
        )}

        {/* 分镜列表 */}
        {shots.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <Text type="secondary">暂无分镜数据</Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={onAddShot} style={{ marginTop: 12 }}>
              添加分镜
            </Button>
          </div>
        ) : (
          <>
            <ShotListHeader
              totalCount={shots.length}
              selectedCount={selectedCount}
              isAllSelected={isAllSelected}
              isIndeterminate={isIndeterminate}
              generatingPrompts={generatingImagePrompts.size > 0 || generatingVideoPrompts.size > 0}
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
              onAddShot={onAddShot}
              onBatchDelete={handleBatchDelete}
            />
            <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950/80 shrink-0">
              <Text type="secondary" style={{ fontSize: 12 }}>
                已加载 {shots.length} 条分镜，虚拟滚动已启用
              </Text>
            </div>
            <div className="flex-1 min-h-0">
              <Virtuoso
                style={{ height: '100%' }}
                data={shots}
                defaultItemHeight={DEFAULT_VIRTUAL_ROW_HEIGHT}
                increaseViewportBy={{
                  top: DEFAULT_VIRTUAL_ROW_HEIGHT * 2,
                  bottom: DEFAULT_VIRTUAL_ROW_HEIGHT * 4,
                }}
                computeItemKey={(_, shot) => shot.id}
                itemContent={(index, shot) => renderShotRow(index, shot)}
              />
            </div>
          </>
        )}
      </div>
    </StoryboardLayout>
  );
};

export default ShotListEditor;
