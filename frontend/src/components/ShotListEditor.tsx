/**
 * 分镜列表编辑器
 * 内联编辑模式，每行一个分镜
 */
import React, { useState, useCallback, useMemo, memo } from 'react';
import { Button, Space, Tooltip, Typography, Tag, Progress, Popconfirm, message } from 'antd';
import {
  ThunderboltOutlined,
  VideoCameraOutlined,
  RobotOutlined,
  LoadingOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { Shot, Character, Scene, Prop } from '../types';
import { ScriptEditor } from '../editor';
import type { MentionItem } from '../editor';
import { ReferenceImagePicker } from './ReferenceImagePicker';
import { VideoVersionList } from './VideoVersionList';
import './ReferenceImagePicker.css';
import './VideoVersionList.css';

const { Text, Paragraph } = Typography;

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
  projectId: string;
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  mentionItems: MentionItem[];
  isGeneratingPrompt: boolean;
  isGeneratingImage: boolean;
  isGeneratingVideo: boolean;
  onPromptChange: (shotId: string, description: string) => void;
  onImageChange: (shotId: string, imagePath: string | undefined) => void;
  onGeneratePrompt: (shotId: string) => void;
  onGenerateImage: (shotId: string) => void;
  onGenerateVideo: (shotId: string) => void;
  onToggleConfirm: (shot: Shot) => void;
  onDelete: (shotId: string) => void;
}

const ShotRow = memo<ShotRowProps>(({
  shot,
  index,
  projectId,
  characters,
  scenes,
  props,
  mentionItems,
  isGeneratingPrompt,
  isGeneratingImage,
  isGeneratingVideo,
  onPromptChange,
  onImageChange,
  onGeneratePrompt,
  onGenerateImage,
  onGenerateVideo,
  onToggleConfirm,
  onDelete,
}) => {
  // 关联的角色名
  const characterNames = useMemo(() => {
    return shot.characters?.map(charId => {
      const char = characters.find(c => c.id === charId);
      return char?.name || charId;
    }) || [];
  }, [shot.characters, characters]);

  const hasPrompt = !!shot.description?.trim();

  return (
    <div className="shotRow">
      {/* 序号 */}
      <div className="shotRowIndex">
        <span className="indexNumber">{index + 1}</span>
        {shot.confirmed && <CheckCircleFilled className="confirmedIcon" />}
      </div>

      {/* 剧本文案 */}
      <div className="shotRowScript">
        <Paragraph ellipsis={{ rows: 2 }} className="scriptText">
          {shot.scriptContent || '(无剧本内容)'}
        </Paragraph>
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
            minHeight="60px"
            maxHeight="100px"
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

      {/* 参考图 */}
      <div className="shotRowImage">
        <ReferenceImagePicker
          value={shot.imagePath}
          onChange={(path) => onImageChange(shot.id, path)}
          characters={characters}
          scenes={scenes}
          props={props}
          size="default"
          placeholder="选择"
        />
        <Tooltip title="AI生成图片">
          <Button
            type="text"
            size="small"
            icon={isGeneratingImage ? <LoadingOutlined /> : <ThunderboltOutlined />}
            disabled={isGeneratingImage || !hasPrompt}
            onClick={() => onGenerateImage(shot.id)}
          />
        </Tooltip>
      </div>

      {/* 视频版本 */}
      <div className="shotRowVideo">
        <VideoVersionList
          projectId={projectId}
          shotId={shot.id}
          currentVersion={shot.currentVersion}
          onGenerateNew={() => onGenerateVideo(shot.id)}
          isGenerating={isGeneratingVideo}
          compact={true}
        />
      </div>

      {/* 操作 */}
      <div className="shotRowActions">
        <Tooltip title={shot.confirmed ? '取消确认' : '确认'}>
          <Button
            type="text"
            size="small"
            icon={shot.confirmed ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <CheckCircleOutlined />}
            onClick={() => onToggleConfirm(shot)}
          />
        </Tooltip>
        <Popconfirm
          title="确定删除此分镜？"
          onConfirm={() => onDelete(shot.id)}
        >
          <Tooltip title="删除">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
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
  onPromptChange: (shotId: string, description: string) => void;
  onImageChange: (shotId: string, imagePath: string | undefined) => void;
  onGeneratePrompt: (shotId: string) => void;
  onBatchGeneratePrompts: () => void;
  onGenerateImage: (shotId: string) => void;
  onBatchGenerateImages: () => void;
  onGenerateVideo: (shotId: string) => void;
  onBatchGenerateVideos: () => void;
  onToggleConfirm: (shot: Shot) => void;
  onDelete: (shotId: string) => void;
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
  onPromptChange,
  onImageChange,
  onGeneratePrompt,
  onBatchGeneratePrompts,
  onGenerateImage,
  onBatchGenerateImages,
  onGenerateVideo,
  onBatchGenerateVideos,
  onToggleConfirm,
  onDelete,
  onAddShot,
}) => {
  // 统计
  const stats = useMemo(() => {
    const total = shots.length;
    const withPrompt = shots.filter(s => s.description?.trim()).length;
    const withImage = shots.filter(s => s.imagePath).length;
    const withVideo = shots.filter(s => s.currentVersion).length;
    const confirmed = shots.filter(s => s.confirmed).length;
    return { total, withPrompt, withImage, withVideo, confirmed };
  }, [shots]);

  const noPromptCount = stats.total - stats.withPrompt;
  const noImageCount = stats.total - stats.withImage;

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
        <div className="headerCol headerIndex">#</div>
        <div className="headerCol headerScript">剧本文案</div>
        <div className="headerCol headerPrompt">提示词</div>
        <div className="headerCol headerImage">参考图</div>
        <div className="headerCol headerVideo">视频</div>
        <div className="headerCol headerActions">操作</div>
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
              projectId={projectId}
              characters={characters}
              scenes={scenes}
              props={props}
              mentionItems={mentionItems}
              isGeneratingPrompt={generatingPrompts.has(shot.id)}
              isGeneratingImage={generatingImages.has(shot.id)}
              isGeneratingVideo={generatingVideos.has(shot.id)}
              onPromptChange={onPromptChange}
              onImageChange={onImageChange}
              onGeneratePrompt={onGeneratePrompt}
              onGenerateImage={onGenerateImage}
              onGenerateVideo={onGenerateVideo}
              onToggleConfirm={onToggleConfirm}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ShotListEditor;
