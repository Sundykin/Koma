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
  Dropdown,
  Input,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  ThunderboltOutlined,
  VideoCameraOutlined,
  RobotOutlined,
  LoadingOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  MoreOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MergeCellsOutlined,
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
  onSelectChange: (selected: boolean) => void;
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

  // 视频列表
  const videos = shot.videos || [];

  // 行操作菜单
  const actionMenuItems: MenuProps['items'] = [
    {
      key: 'confirm',
      icon: shot.confirmed ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <CheckCircleOutlined />,
      label: shot.confirmed ? '取消确认' : '确认',
      onClick: () => onToggleConfirm(shot),
    },
    { type: 'divider' },
    {
      key: 'mergeUp',
      icon: <MergeCellsOutlined />,
      label: '向上合并',
      disabled: isFirst,
      onClick: () => onMergeUp(shot.id),
    },
    {
      key: 'mergeDown',
      icon: <MergeCellsOutlined style={{ transform: 'rotate(180deg)' }} />,
      label: '向下合并',
      disabled: isLast,
      onClick: () => onMergeDown(shot.id),
    },
    { type: 'divider' },
    {
      key: 'moveUp',
      icon: <ArrowUpOutlined />,
      label: '上移',
      disabled: isFirst,
      onClick: () => onMoveUp(shot.id),
    },
    {
      key: 'moveDown',
      icon: <ArrowDownOutlined />,
      label: '下移',
      disabled: isLast,
      onClick: () => onMoveDown(shot.id),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => onDelete(shot.id),
    },
  ];

  // 图片选择/添加/删除
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

  // 视频选择/删除
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
          onChange={(e) => onSelectChange(e.target.checked)}
        />
      </div>

      {/* 操作菜单 */}
      <div className="shotRowActions">
        <Dropdown menu={{ items: actionMenuItems }} trigger={['click']} placement="bottomLeft">
          <Button type="text" size="small" icon={<MoreOutlined />} />
        </Dropdown>
      </div>

      {/* 序号 */}
      <div className="shotRowIndex">
        <span className="indexNumber">{index + 1}</span>
        {shot.confirmed && <CheckCircleFilled className="confirmedIcon" />}
      </div>

      {/* 剧本文案（可编辑） */}
      <div className="shotRowScript">
        <TextArea
          value={shot.scriptContent || ''}
          onChange={(e) => onScriptChange(shot.id, e.target.value)}
          placeholder="剧本内容..."
          autoSize={{ minRows: 2, maxRows: 6 }}
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
        <div className="promptEditor">
          <ScriptEditor
            value={shot.description || ''}
            onChange={(value) => onPromptChange(shot.id, value)}
            placeholder={hasPrompt ? '' : '点击 AI生成 或手动输入提示词...'}
            mentionItems={mentionItems}
            enableKeywordHighlight={true}
            minHeight="120px"
            maxHeight="160px"
            showLineNumbers={false}
            darkTheme={true}
          />
        </div>
        <Tooltip title="AI 生成提示词">
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
        </Tooltip>
      </div>

      {/* 参考图（多图卡片） */}
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

      {/* 视频（多版本卡片） */}
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
});

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
  onBatchGeneratePrompts: () => void;
  onGenerateImage: (shotId: string) => void;
  onBatchGenerateImages: () => void;
  onGenerateVideo: (shotId: string) => void;
  onBatchGenerateVideos: () => void;
  onToggleConfirm: (shot: Shot) => void;
  onDelete: (shotId: string) => void;
  onBatchDelete: (shotIds: string[]) => void;
  onBatchConfirm: (shotIds: string[], confirm: boolean) => void;
  onMergeUp: (shotId: string) => void;
  onMergeDown: (shotId: string) => void;
  onMoveUp: (shotId: string) => void;
  onMoveDown: (shotId: string) => void;
  onAddShot: () => void;
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
  onGenerateImage,
  onBatchGenerateImages,
  onGenerateVideo,
  onBatchGenerateVideos,
  onToggleConfirm,
  onDelete,
  onBatchDelete,
  onBatchConfirm,
  onMergeUp,
  onMergeDown,
  onMoveUp,
  onMoveDown,
  onAddShot,
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

  const noPromptCount = stats.total - stats.withPrompt;
  const noImageCount = stats.total - stats.withImage;
  const selectedCount = selectedIds.size;

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

  const isAllSelected = shots.length > 0 && selectedIds.size === shots.length;
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < shots.length;

  return (
    <div className="shotListEditor">
      {/* 顶部工具栏 */}
      <div className="shotListToolbar">
        <Space>
          <Button
            icon={<RobotOutlined />}
            disabled={noPromptCount === 0 || generatingPrompts.size > 0}
            onClick={onBatchGeneratePrompts}
          >
            批量生成提示词 ({noPromptCount})
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            disabled={noImageCount === 0 || generatingImages.size > 0}
            onClick={onBatchGenerateImages}
          >
            批量生成图片 ({noImageCount})
          </Button>
          <Button
            icon={<VideoCameraOutlined />}
            disabled={stats.confirmed === 0 || generatingVideos.size > 0}
            onClick={onBatchGenerateVideos}
          >
            批量生成视频 ({stats.confirmed})
          </Button>
          <Button icon={<PlusOutlined />} onClick={onAddShot}>
            添加分镜
          </Button>
        </Space>

        {/* 批量操作 */}
        {selectedCount > 0 && (
          <Space style={{ marginLeft: 16 }}>
            <Text type="secondary">已选 {selectedCount} 项</Text>
            <Button size="small" onClick={() => handleBatchConfirm(true)}>批量确认</Button>
            <Button size="small" onClick={() => handleBatchConfirm(false)}>取消确认</Button>
            <Popconfirm title={`确定删除 ${selectedCount} 个分镜？`} onConfirm={handleBatchDelete}>
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
        <div className="headerCol headerActions">操作</div>
        <div className="headerCol headerIndex">#</div>
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
              onSelectChange={(selected) => handleSelectChange(shot.id, selected)}
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
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ShotListEditor;
