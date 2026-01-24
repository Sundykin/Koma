/**
 * StoryboardStudio - 分镜工作室
 * 舞台区 + 时间线布局
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Typography, Empty, Space, Button, Tag, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  ExpandOutlined,
  CompressOutlined,
  UserOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import type { Shot, Character, Scene, ShotVideo } from '../../types';
import { StagePlayer } from '../video/StagePlayer';
import { electronService } from '../../services/electronService';

const { Text, Title } = Typography;

interface StoryboardStudioProps {
  selectedShot: Shot | null;
  characters: Character[];
  scenes: Scene[];
  onShotSelect?: (shotId: string | null) => void;
  stageHeight?: number;
  children: React.ReactNode;
}

export const StoryboardStudio: React.FC<StoryboardStudioProps> = ({
  selectedShot,
  characters,
  scenes,
  onShotSelect,
  stageHeight = 320,
  children,
}) => {
  const [isStageExpanded, setIsStageExpanded] = useState(false);

  // 获取选中分镜的视频
  const selectedVideo = useMemo((): ShotVideo | null => {
    if (!selectedShot?.videos?.length) return null;
    const index = selectedShot.currentVideoIndex ?? selectedShot.selectedVideoIndex ?? selectedShot.videos.length - 1;
    return selectedShot.videos[index] || selectedShot.videos[selectedShot.videos.length - 1];
  }, [selectedShot]);

  // 获取选中分镜的参考图
  const selectedImage = useMemo(() => {
    if (!selectedShot?.imagePaths?.length) return null;
    const index = selectedShot.currentImageIndex ?? 0;
    return selectedShot.imagePaths[index];
  }, [selectedShot]);

  // 获取关联的角色
  const shotCharacters = useMemo(() => {
    if (!selectedShot?.characters?.length) return [];
    return characters.filter(c => selectedShot.characters.includes(c.id));
  }, [selectedShot, characters]);

  // 获取关联的场景（根据 scenes 数组匹配）
  const shotScenes = useMemo(() => {
    if (!selectedShot?.scenes?.length) return [];
    return scenes.filter(s => selectedShot.scenes?.includes(s.id));
  }, [selectedShot, scenes]);

  const actualStageHeight = isStageExpanded ? 480 : stageHeight;

  return (
    <div
      className="storyboardStudio"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#09090b',
        overflow: 'hidden',
      }}
    >
      {/* 舞台区域 */}
      <div
        className="stageArea"
        style={{
          height: actualStageHeight,
          minHeight: 200,
          borderBottom: '1px solid #27272a',
          display: 'flex',
          flexShrink: 0,
          transition: 'height 0.2s ease',
        }}
      >
        {/* 视频预览 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#09090b',
          }}
        >
          <div
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid #27272a',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text strong style={{ color: '#a1a1aa', fontSize: 12 }}>
              舞台预览
            </Text>
            <Space size="small">
              <Tooltip title={isStageExpanded ? '收起' : '展开'}>
                <Button
                  type="text"
                  size="small"
                  icon={isStageExpanded ? <CompressOutlined /> : <ExpandOutlined />}
                  onClick={() => setIsStageExpanded(!isStageExpanded)}
                />
              </Tooltip>
            </Space>
          </div>
          <div style={{ flex: 1, padding: 8 }}>
            <StagePlayer
              videoPath={selectedVideo?.path}
              videoUrl={selectedVideo?.url}
              poster={selectedImage ? electronService.fs.toLocalUrl(selectedImage) : undefined}
            />
          </div>
        </div>

        {/* 分镜信息面板 */}
        <div
          style={{
            width: 280,
            borderLeft: '1px solid #27272a',
            display: 'flex',
            flexDirection: 'column',
            background: '#18181b',
          }}
        >
          <div
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid #27272a',
            }}
          >
            <Text strong style={{ color: '#a1a1aa', fontSize: 12 }}>
              分镜信息
            </Text>
          </div>

          {selectedShot ? (
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              {/* 剧本文案 */}
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>剧本文案</Text>
                <div
                  style={{
                    marginTop: 4,
                    padding: 8,
                    background: '#09090b',
                    borderRadius: 4,
                    fontSize: 13,
                    color: '#e4e4e7',
                    lineHeight: 1.6,
                    maxHeight: 80,
                    overflow: 'auto',
                  }}
                >
                  {selectedShot.scriptContent || '-'}
                </div>
              </div>

              {/* 关联角色 */}
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  <UserOutlined style={{ marginRight: 4 }} />
                  关联角色
                </Text>
                <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {shotCharacters.length > 0 ? (
                    shotCharacters.map(c => (
                      <Tag key={c.id} color="blue" style={{ margin: 0 }}>
                        {c.name}
                      </Tag>
                    ))
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>无</Text>
                  )}
                </div>
              </div>

              {/* 关联场景 */}
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  <EnvironmentOutlined style={{ marginRight: 4 }} />
                  关联场景
                </Text>
                <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {shotScenes.length > 0 ? (
                    shotScenes.map(s => (
                      <Tag key={s.id} color="green" style={{ margin: 0 }}>
                        {s.name}
                      </Tag>
                    ))
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>无</Text>
                  )}
                </div>
              </div>

              {/* 视频信息 */}
              {selectedVideo && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>视频版本</Text>
                  <div style={{ marginTop: 4 }}>
                    <Tag color="purple">
                      {selectedShot.videos?.length || 0} 个版本
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                      当前: v{(selectedShot.currentVideoIndex ?? selectedShot.selectedVideoIndex ?? (selectedShot.videos?.length || 1) - 1) + 1}
                    </Text>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text type="secondary">选择分镜查看详情</Text>}
              />
            </div>
          )}
        </div>
      </div>

      {/* 时间线/分镜列表区域 */}
      <div
        className="timelineArea"
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default StoryboardStudio;
