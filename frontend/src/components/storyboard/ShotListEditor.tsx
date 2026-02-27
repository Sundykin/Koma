/**
 * 分镜列表编辑器
 * 内联编辑模式，每行一个分镜
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Button, Typography, Progress } from 'antd';
import { PlusOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { TaskManager } from '../../services/TaskManager';
import { StoryboardLayout } from './StoryboardLayout';
import { ShotListHeader } from './ShotListHeader';
import type { MentionItem } from '../../editor';
import type { Shot, Character, Scene, Prop, ShotVideo } from '../../types';
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
  onBatchGeneratePrompts: (shotIds?: string[]) => void;
  onBatchReGeneratePrompts: (shotIds?: string[]) => void;
  onGenerateImage: (shotId: string) => void;
  onBatchGenerateImages: (shotIds?: string[]) => void;
  onBatchReGenerateImages: (shotIds?: string[]) => void;
  onGenerateVideo: (shotId: string) => void;
  onBatchGenerateVideos: (shotIds?: string[]) => void;
  onBatchReGenerateVideos: (shotIds?: string[]) => void;
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
  onReorder?: (fromIndex: number, toIndex: number) => void;
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
  onBatchGeneratePrompts,
  onBatchReGeneratePrompts,
  onGenerateImage,
  onBatchGenerateImages,
  onBatchReGenerateImages,
  onGenerateVideo,
  onBatchGenerateVideos,
  onBatchReGenerateVideos,
  onToggleConfirm,
  onDelete,
  onBatchDelete,
  onBatchConfirm,
  onMergeUp,
  onMergeDown,
  onMoveUp,
  onMoveDown,
  onAddShot,
  onInsertAbove,
  onInsertBelow,
  onReorder,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragIndexRef = React.useRef<number | null>(null);

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
    onBatchGeneratePrompts(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchGeneratePrompts]);

  const handleBatchRePrompts = useCallback(() => {
    onBatchReGeneratePrompts(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchReGeneratePrompts]);

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
    onBatchGeneratePrompts(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchGeneratePrompts]);

  const handleBatchReVideoPrompts = useCallback(() => {
    onBatchReGeneratePrompts(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchReGeneratePrompts]);

  const handleBatchDelete = useCallback(() => {
    if (hasSelected) {
      onBatchDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  }, [hasSelected, selectedIds, onBatchDelete]);

  return (
    <StoryboardLayout>
      <div className="flex flex-col h-full">
        {/* 批量进度 */}
        {batchProgress && batchProgress.total > 0 && (
          <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 flex items-center gap-2">
            <div className="flex-1">
              <Progress
                percent={Math.round((batchProgress.current / batchProgress.total) * 100)}
                size="small"
                status={TaskManager.isPaused() ? 'exception' : 'active'}
                strokeColor={TaskManager.isPaused() ? '#faad14' : '#10b981'}
              />
              <Text type="secondary" style={{ fontSize: 10 }}>
                {TaskManager.isPaused() ? '已暂停 - ' : ''}{batchProgress.step || `${batchProgress.current}/${batchProgress.total}`}
              </Text>
            </div>
            <Button
              size="small"
              type="text"
              icon={TaskManager.isPaused() ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
              onClick={() => { TaskManager.isPaused() ? TaskManager.resume() : TaskManager.pause(); }}
            >
              {TaskManager.isPaused() ? '继续' : '暂停'}
            </Button>
            <Button
              size="small"
              type="text"
              danger
              icon={<StopOutlined />}
              onClick={() => { TaskManager.cancelAll(projectId); }}
            >
              取消
            </Button>
          </div>
        )}

        {/* 分镜列表 */}
        <div className="flex-1 overflow-y-auto">
          {shots.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <Text type="secondary">暂无分镜数据</Text>
              <Button type="primary" icon={<PlusOutlined />} onClick={onAddShot} style={{ marginTop: 12 }}>
                添加分镜
              </Button>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* 公共表头 - 集成全选和批量操作 */}
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
              {/* 分镜行 */}
              {shots.map((shot, index) => (
                <div
                  key={shot.id}
                  draggable={!!onReorder}
                  onDragStart={() => { dragIndexRef.current = index; }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={() => {
                    if (dragIndexRef.current !== null && dragIndexRef.current !== index && onReorder) {
                      onReorder(dragIndexRef.current, index);
                    }
                    dragIndexRef.current = null;
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null); }}
                  className={dragOverIndex === index ? 'ring-2 ring-emerald-500/50 ring-inset' : ''}
                >
                <ShotCard
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
                  onToggleConfirm={onToggleConfirm}
                  onDelete={onDelete}
                  onMergeUp={onMergeUp}
                  onMergeDown={onMergeDown}
                  onMoveUp={onMoveUp}
                  onMoveDown={onMoveDown}
                  onInsertAbove={onInsertAbove}
                  onInsertBelow={onInsertBelow}
                />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </StoryboardLayout>
  );
};

export default ShotListEditor;
