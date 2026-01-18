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
import type { Shot, Character, Scene, Prop, ShotVideo } from '../types';
import { ScriptEditor } from '../editor';
import type { MentionItem } from '../editor';
import { ImageCardGrid } from './ImageCardGrid';
import { VideoCardGrid } from './VideoCardGrid';
import './ImageCardGrid.css';
import './VideoCardGrid.css';

const { Text } = Typography;
const { TextArea } = Input;

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

// ============ 单行分镜组件 ============
interface ShotRowProps {
  shot: Shot;
  index: number;
  totalCount: number;
  projectId: string;
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

// 自定义 memo 比较函数，只比较数据相关的 props，忽略回调函数
function shotRowPropsAreEqual(prevProps: ShotRowProps, nextProps: ShotRowProps): boolean {
  return (
    prevProps.shot === nextProps.shot &&
    prevProps.index === nextProps.index &&
    prevProps.totalCount === nextProps.totalCount &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isGeneratingPrompt === nextProps.isGeneratingPrompt &&
    prevProps.isGeneratingImage === nextProps.isGeneratingImage &&
    prevProps.isGeneratingVideo === nextProps.isGeneratingVideo &&
    prevProps.characters === nextProps.characters &&
    prevProps.scenes === nextProps.scenes &&
    prevProps.props === nextProps.props &&
    prevProps.mentionItems === nextProps.mentionItems
  );
}

const ShotRow = memo<ShotRowProps>(({
  shot,
  index,
  totalCount,
  projectId,
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

  // 图片列表（兼容旧数据）
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
    <div className={`shotRow ${isSelected ? 'selected' : ''}`}>
      {/* 复选框 */}
      <div className="shotRowCheckbox">
        <Checkbox
          checked={isSelected}
          onChange={(e) => onSelectChange(shot.id, e.target.checked)}
        />
      </div>

      {/* 序号 */}
      <div className="shotRowIndex">
        <span className="indexNumber">{index + 1}</span>
        {shot.confirmed && <CheckCircleFilled className="confirmedIcon" />}
      </div>

      {/* 操作 - 放在左侧，紧凑布局 */}
      <div className="shotRowActions">
        <Tooltip title={shot.confirmed ? '取消确认' : '确认'}>
          <Button
            size="small"
            type={shot.confirmed ? 'primary' : 'default'}
            icon={shot.confirmed ? <CheckCircleFilled /> : <CheckCircleOutlined />}
            onClick={() => onToggleConfirm(shot)}
            className="actionBtn"
          />
        </Tooltip>
        <Tooltip title="上方插入">
          <Button
            size="small"
            icon={<InsertRowAboveOutlined />}
            onClick={() => onInsertAbove(shot.id)}
            className="actionBtn"
          />
        </Tooltip>
        <Tooltip title="下方插入">
          <Button
            size="small"
            icon={<InsertRowBelowOutlined />}
            onClick={() => onInsertBelow(shot.id)}
            className="actionBtn"
          />
        </Tooltip>
        <Tooltip title="上移">
          <Button
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={isFirst}
            onClick={() => onMoveUp(shot.id)}
            className="actionBtn"
          />
        </Tooltip>
        <Tooltip title="下移">
          <Button
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={isLast}
            onClick={() => onMoveDown(shot.id)}
            className="actionBtn"
          />
        </Tooltip>
        <Tooltip title="向上合并">
          <Button
            size="small"
            icon={<MergeCellsOutlined />}
            disabled={isFirst}
            onClick={() => onMergeUp(shot.id)}
            className="actionBtn"
          />
        </Tooltip>
        <Tooltip title="向下合并">
          <Button
            size="small"
            icon={<MergeCellsOutlined style={{ transform: 'rotate(180deg)' }} />}
            disabled={isLast}
            onClick={() => onMergeDown(shot.id)}
            className="actionBtn"
          />
        </Tooltip>
        <Popconfirm title="确定删除？" onConfirm={() => onDelete(shot.id)}>
          <Tooltip title="删除">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              className="actionBtn"
            />
          </Tooltip>
        </Popconfirm>
      </div>

      {/* 剧本文案 */}
      <div className="shotRowScript">
        <TextArea
          value={shot.scriptContent || ''}
          onChange={(e) => onScriptChange(shot.id, e.target.value)}
          placeholder="剧本内容..."
          className="scriptTextarea"
        />
        <Space size={4} wrap className="shotMeta">
          <Tag color="blue">{SHOT_TYPE_MAP[shot.shotType] || shot.shotType}</Tag>
          {shot.cameraMovement !== 'static' && (
            <Tag color="purple">{CAMERA_MOVEMENT_MAP[shot.cameraMovement]}</Tag>
          )}
          <Tag>{shot.duration}s</Tag>
          {characterNames.map(name => (
            <Tag key={name} color="cyan">{name}</Tag>
          ))}
        </Space>
      </div>

      {/* 提示词编辑器 */}
      <div className="shotRowPrompt">
        <div className="promptEditorWrapper">
          <ScriptEditor
            value={shot.description || ''}
            onChange={(value) => onPromptChange(shot.id, value)}
            placeholder={hasPrompt ? '' : '输入提示词...'}
            mentionItems={mentionItems}
            enableKeywordHighlight={true}
            minHeight="120px"
            maxHeight="120px"
            showLineNumbers={false}
            darkTheme={true}
          />
        </div>
        <Button
          type="text"
          size="small"
          icon={isGeneratingPrompt ? <LoadingOutlined /> : <RobotOutlined />}
          disabled={isGeneratingPrompt}
          onClick={() => onGeneratePrompt(shot.id)}
          className="promptGenBtn"
        >
          {hasPrompt ? '重新生成' : 'AI生成'}
        </Button>
      </div>

      {/* 参考图 */}
      <div className="shotRowImage">
        <ImageCardGrid
          images={images}
          selectedIndex={shot.currentImageIndex || 0}
          onSelect={handleImageSelect}
          onAdd={handleImageAdd}
          onDelete={handleImageDelete}
          onGenerate={() => onGenerateImage(shot.id)}
          isGenerating={isGeneratingImage}
          disabled={!hasPrompt}
          characters={characters}
          scenes={scenes}
          props={props}
        />
      </div>

      {/* 视频 */}
      <div className="shotRowVideo">
        <VideoCardGrid
          videos={videos}
          selectedIndex={shot.currentVideoIndex || 0}
          onSelect={handleVideoSelect}
          onDelete={handleVideoDelete}
          onGenerate={() => onGenerateVideo(shot.id)}
          isGenerating={isGeneratingVideo}
          disabled={images.length === 0}
        />
      </div>
    </div>
  );
}, shotRowPropsAreEqual);

ShotRow.displayName = 'ShotRow';

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
  onScriptChange: (shotId: string, script: string) => void;
  onPromptChange: (shotId: string, description: string) => void;
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
  onScriptChange,
  onPromptChange,
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
    const withPrompt = shots.filter(s => s.description?.trim()).length;
    const withImage = shots.filter(s => (s.imagePaths?.length || 0) > 0 || s.imagePath).length;
    const withVideo = shots.filter(s => (s.videos?.length || 0) > 0).length;
    const confirmed = shots.filter(s => s.confirmed).length;
    return { total, withPrompt, withImage, withVideo, confirmed };
  }, [shots]);

  // 选中项统计
  const selectedStats = useMemo(() => {
    const selectedShots = shots.filter(s => selectedIds.has(s.id));
    const total = selectedShots.length;
    const withPrompt = selectedShots.filter(s => s.description?.trim()).length;
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
    <div className="shotListEditor">
      {/* 顶部工具栏 */}
      <div className="shotListToolbar">
        <Space wrap>
          <Button
            icon={<RobotOutlined />}
            disabled={!hasSelected || selectedStats.noPrompt === 0 || generatingPrompts.size > 0}
            onClick={handleBatchPrompts}
          >
            批量生成提示词 ({selectedStats.noPrompt})
          </Button>
          <Button
            icon={<ReloadOutlined />}
            disabled={!hasSelected || selectedStats.withPrompt === 0 || generatingPrompts.size > 0}
            onClick={handleBatchRePrompts}
          >
            重新生成提示词 ({selectedStats.withPrompt})
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            disabled={!hasSelected || selectedStats.noImage === 0 || generatingImages.size > 0}
            onClick={handleBatchImages}
          >
            批量生成图片 ({selectedStats.noImage})
          </Button>
          <Button
            icon={<ReloadOutlined />}
            disabled={!hasSelected || selectedStats.withImage === 0 || generatingImages.size > 0}
            onClick={handleBatchReImages}
          >
            重新生成图片 ({selectedStats.withImage})
          </Button>
          <Button
            icon={<VideoCameraOutlined />}
            disabled={!hasSelected || selectedStats.total === 0 || generatingVideos.size > 0}
            onClick={handleBatchVideos}
          >
            批量生成视频 ({selectedStats.total})
          </Button>
          <Button
            icon={<ReloadOutlined />}
            disabled={!hasSelected || selectedStats.withVideo === 0 || generatingVideos.size > 0}
            onClick={handleBatchReVideos}
          >
            重新生成视频 ({selectedStats.withVideo})
          </Button>
          <Button icon={<PlusOutlined />} onClick={onAddShot}>
            添加
          </Button>
        </Space>

        {/* 选中时显示批量操作 */}
        {hasSelected && (
          <Space style={{ marginLeft: 16 }}>
            <Text type="secondary">已选 {selectedCount} 项</Text>
            <Button size="small" onClick={() => handleBatchConfirm(true)}>批量确认</Button>
            <Button size="small" onClick={() => handleBatchConfirm(false)}>取消确认</Button>
            <Popconfirm title={`删除 ${selectedCount} 个分镜？`} onConfirm={handleBatchDelete}>
              <Button size="small" danger>批量删除</Button>
            </Popconfirm>
          </Space>
        )}

        <div className="toolbarStats">
          <Text type="secondary">
            提示词: {stats.withPrompt}/{stats.total} |
            图片: {stats.withImage}/{stats.total} |
            视频: {stats.withVideo}/{stats.total} |
            已确认: {stats.confirmed}/{stats.total}
          </Text>
        </div>
      </div>

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

      {/* 表头 */}
      <div className="shotListHeader">
        <div className="headerCol headerCheckbox">
          <Checkbox
            checked={isAllSelected}
            indeterminate={isIndeterminate}
            onChange={(e) => handleSelectAll(e.target.checked)}
          />
        </div>
        <div className="headerCol headerIndex">#</div>
        <div className="headerCol headerActions">操作</div>
        <div className="headerCol headerScript">剧本文案</div>
        <div className="headerCol headerPrompt">提示词</div>
        <div className="headerCol headerImage">参考图</div>
        <div className="headerCol headerVideo">视频</div>
      </div>

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
          shots.map((shot, index) => (
            <ShotRow
              key={shot.id}
              shot={shot}
              index={index}
              totalCount={shots.length}
              projectId={projectId}
              characters={characters}
              scenes={scenes}
              props={props}
              mentionItems={mentionItems}
              isSelected={selectedIds.has(shot.id)}
              isGeneratingPrompt={generatingPrompts.has(shot.id)}
              isGeneratingImage={generatingImages.has(shot.id)}
              isGeneratingVideo={generatingVideos.has(shot.id)}
              onSelectChange={handleSelectChange}
              onScriptChange={onScriptChange}
              onPromptChange={onPromptChange}
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
          ))
        )}
      </div>
    </div>
  );
};

export default ShotListEditor;
