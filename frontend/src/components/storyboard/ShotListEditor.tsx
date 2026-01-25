/**
 * 分镜列表编辑器
 * 内联编辑模式，每行一个分镜
 */
import React, { useState, useCallback, useMemo, memo } from 'react';
import {
  Button,
  Space,
  Tooltip,
  Typography,
  Tag,
  Progress,
  Popconfirm,
  Checkbox,
  Input,
} from 'antd';
import {
  ThunderboltOutlined,
  VideoCameraOutlined,
  RobotOutlined,
  LoadingOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MergeCellsOutlined,
  ReloadOutlined,
  InsertRowAboveOutlined,
  InsertRowBelowOutlined,
} from '@ant-design/icons';
import { StoryboardToolbar } from './StoryboardToolbar';
import { StoryboardLayout } from './StoryboardLayout';
import { ScriptEditor } from '../../editor';
import type { MentionItem } from '../../editor';
import { ImageCardGrid } from '../asset/ImageCardGrid';
import type { Shot, Character, Scene, Prop, ShotVideo } from '../../types';
import '../asset/ImageCardGrid.css';
import { ShotCard } from './ShotCard';

const { Text } = Typography;
const { TextArea } = Input;

// ============ 主组件 ============
export interface ShotListEditorProps {
  projectId: string;
  shots: Shot[];
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  mentionItems: MentionItem[];
  generatingPrompts: Set<string>;
  generatingImages: Set<string>;
  generatingVideos: Set<string>;
  batchProgress?: { current: number; total: number; step?: string };
  // 舞台激活相关
  activeShotId?: string | null;
  onActiveShotChange?: (shotId: string | null) => void;
  onScriptChange: (shotId: string, script: string) => void;
  onImagePromptChange: (shotId: string, imagePrompt: string) => void;
  onVideoPromptChange: (shotId: string, videoPrompt: string) => void;
  onCharactersChange: (shotId: string, characterIds: string[]) => void;
  onScenesChange?: (shotId: string, sceneIds: string[]) => void;
  onReferenceImagesChange?: (shotId: string, images: string[], selectedIndex: number) => void;
  onImagesChange: (shotId: string, images: string[], selectedIndex: number) => void;
  onVideosChange: (shotId: string, videos: ShotVideo[], selectedIndex: number) => void;
  onGeneratePrompt: (shotId: string) => void;
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
}

export const ShotListEditor: React.FC<ShotListEditorProps> = ({
  projectId,
  shots,
  characters,
  scenes,
  props,
  mentionItems,
  generatingPrompts,
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
  onReferenceImagesChange,
  onImagesChange,
  onVideosChange,
  onGeneratePrompt,
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
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 统计
  const stats = useMemo(() => {
    const total = shots.length;
    const withPrompt = shots.filter(s => s.imagePrompt?.trim() || s.videoPrompt?.trim()).length;
    const withImage = shots.filter(s => (s.imagePaths?.length || 0) > 0 || s.imagePath).length;
    const withVideo = shots.filter(s => (s.videos?.length || 0) > 0).length;
    const confirmed = shots.filter(s => s.confirmed).length;
    return { total, withPrompt, withImage, withVideo, confirmed };
  }, [shots]);

  // 选中项���计
  const selectedStats = useMemo(() => {
    const selectedShots = shots.filter(s => selectedIds.has(s.id));
    const total = selectedShots.length;
    const withPrompt = selectedShots.filter(s => s.imagePrompt?.trim() || s.videoPrompt?.trim()).length;
    const withImage = selectedShots.filter(s => (s.imagePaths?.length || 0) > 0 || s.imagePath).length;
    const withVideo = selectedShots.filter(s => (s.videos?.length || 0) > 0).length;
    return {
      total,
      noPrompt: total - withPrompt,
      noImage: total - withImage,
      noVideo: total - withVideo,
      withPrompt,
      withImage,
      withVideo,
    };
  }, [shots, selectedIds]);

  const selectedCount = selectedIds.size;
  const hasSelected = selectedCount > 0;

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

  // 批量删除
  const handleBatchDelete = useCallback(() => {
    onBatchDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
  }, [selectedIds, onBatchDelete]);

  // 批量确认
  const handleBatchConfirm = useCallback((confirm: boolean) => {
    onBatchConfirm(Array.from(selectedIds), confirm);
  }, [selectedIds, onBatchConfirm]);

  // 批量生成提示词（选中项或全部）
  const handleBatchPrompts = useCallback(() => {
    onBatchGeneratePrompts(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchGeneratePrompts]);

  // 批量重新生成提示词
  const handleBatchRePrompts = useCallback(() => {
    onBatchReGeneratePrompts(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchReGeneratePrompts]);

  // 批量生成图片
  const handleBatchImages = useCallback(() => {
    onBatchGenerateImages(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchGenerateImages]);

  // 批量重新生成图片
  const handleBatchReImages = useCallback(() => {
    onBatchReGenerateImages(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchReGenerateImages]);

  // 批量生成视频
  const handleBatchVideos = useCallback(() => {
    onBatchGenerateVideos(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchGenerateVideos]);

  // 批量重新生成视频
  const handleBatchReVideos = useCallback(() => {
    onBatchReGenerateVideos(hasSelected ? Array.from(selectedIds) : undefined);
  }, [hasSelected, selectedIds, onBatchReGenerateVideos]);

  const isAllSelected = shots.length > 0 && selectedIds.size === shots.length;
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < shots.length;

  // 计算显示的数量
  const promptCount = hasSelected ? selectedStats.noPrompt : (stats.total - stats.withPrompt);
  const imageCount = hasSelected ? selectedStats.noImage : (stats.total - stats.withImage);
  const videoCount = hasSelected ? selectedStats.total : stats.confirmed;

  return (
    <StoryboardLayout
      toolbar={
        <StoryboardToolbar
          stats={stats}
          selectedStats={selectedStats}
          hasSelected={hasSelected}
          selectedCount={selectedCount}
          generatingPrompts={generatingPrompts.size > 0}
          generatingImages={generatingImages.size > 0}
          generatingVideos={generatingVideos.size > 0}
          onBatchPrompts={handleBatchPrompts}
          onBatchRePrompts={handleBatchRePrompts}
          onBatchImages={handleBatchImages}
          onBatchReImages={handleBatchReImages}
          onBatchVideos={handleBatchVideos}
          onBatchReVideos={handleBatchReVideos}
          onAddShot={onAddShot}
          onBatchConfirm={handleBatchConfirm}
          onBatchDelete={handleBatchDelete}
        />
      }
    >
      <div className="shotListEditor">
        {/* 批量进度 */}
        {batchProgress && batchProgress.total > 0 && (
          <div className="batchProgressBar">
            <Progress
              percent={Math.round((batchProgress.current / batchProgress.total) * 100)}
              size="small"
              status="active"
              strokeColor="#10b981"
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {batchProgress.step || `${batchProgress.current}/${batchProgress.total}`}
            </Text>
          </div>
        )}

        {/* 全选区域 */}
        {shots.length > 0 && (
          <div className="selectAllRow">
            <Checkbox
              checked={isAllSelected}
              indeterminate={isIndeterminate}
              onChange={(e) => handleSelectAll(e.target.checked)}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>
                {isAllSelected ? '取消全选' : '全选'} ({shots.length})
              </Text>
            </Checkbox>
          </div>
        )}

        {/* 分镜列表 */}
        <div className="shotListBody">
          {shots.length === 0 ? (
            <div className="emptyList">
              <Text type="secondary">暂无分镜数据</Text>
              <Button type="primary" icon={<PlusOutlined />} onClick={onAddShot} style={{ marginTop: 12 }}>
                添加分镜
              </Button>
            </div>
          ) : (
            <div className="shot-list-container">
              {shots.map((shot, index) => (
                <ShotCard
                  key={shot.id}
                  shot={shot}
                  index={index}
                  totalCount={shots.length}
                  characters={characters}
                  scenes={scenes}
                  props={props}
                  mentionItems={mentionItems}
                  isSelected={selectedIds.has(shot.id)}
                  isActive={activeShotId === shot.id}
                  isGeneratingPrompt={generatingPrompts.has(shot.id)}
                  isGeneratingImage={generatingImages.has(shot.id)}
                  isGeneratingVideo={generatingVideos.has(shot.id)}
                  onSelectChange={handleSelectChange}
                  onActivate={onActiveShotChange}
                  onScriptChange={onScriptChange}
                  onImagePromptChange={onImagePromptChange}
                  onVideoPromptChange={onVideoPromptChange}
                  onCharactersChange={onCharactersChange}
                  onScenesChange={onScenesChange}
                  onReferenceImagesChange={onReferenceImagesChange}
                  onImagesChange={onImagesChange}
                  onVideosChange={onVideosChange}
                  onGeneratePrompt={onGeneratePrompt}
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
              ))}
            </div>
          )}
        </div>
      </div>
    </StoryboardLayout>
  );
};

export default ShotListEditor;
