import React, { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Segmented,
  Select,
  Tooltip,
  Typography,
  Image,
  Form,
  Badge,
  Statistic,
  message,
} from 'antd';
import {
  PlayCircleOutlined,
  VideoCameraOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  CameraOutlined,
  InfoCircleOutlined,
  CaretRightOutlined,
  CheckCircleOutlined,
  CheckCircleFilled,
  SendOutlined,
} from '@ant-design/icons';
import type { Shot, Character, AppSettings } from '../types';
import './Storyboard.css';

const { Text, Paragraph } = Typography;

interface StoryboardProps {
  shots: Shot[];
  characters: Character[];
  settings: AppSettings;
  onShotUpdate?: (updatedShot: Shot) => void;
  onConfirmedShotsToTimeline?: (shots: Shot[]) => void;
}

export const Storyboard: React.FC<StoryboardProps> = ({
  shots,
  characters,
  settings,
  onShotUpdate,
  onConfirmedShotsToTimeline,
}) => {
  const [selectedShotId, setSelectedShotId] = useState<string | null>(shots[0]?.id || null);

  const selectedShot = shots.find(s => s.id === selectedShotId);
  const confirmedShots = shots.filter(s => s.confirmed);
  const confirmedCount = confirmedShots.length;

  // 切换分镜确认状态
  const handleToggleConfirm = (shot: Shot) => {
    if (onShotUpdate) {
      onShotUpdate({ ...shot, confirmed: !shot.confirmed });
    }
  };

  // 将已确认的分镜送入时间线
  const handleSendToTimeline = () => {
    if (confirmedCount === 0) {
      message.warning('请先确认至少一个分镜');
      return;
    }
    if (onConfirmedShotsToTimeline) {
      onConfirmedShotsToTimeline(confirmedShots);
      message.success(`${confirmedCount} 个分镜已入轨`);
    }
  };

  const shotTypeMap: Record<string, string> = {
    'close-up': '特写',
    'medium': '中景',
    'wide': '全景',
    'extreme-wide': '大全景'
  };

  const cameraMovementMap: Record<string, string> = {
    'static': '固定',
    'pan': '摇镜',
    'zoom-in': '推镜',
    'tracking': '跟随',
    'handheld': '手持'
  };

  const shotTypeOptions = [
    { label: 'CU', value: 'close-up' },
    { label: 'MED', value: 'medium' },
    { label: 'WIDE', value: 'wide' },
    { label: 'X-WIDE', value: 'extreme-wide' },
  ];

  const cameraOptions = [
    { label: '📷 固定镜头', value: 'static' },
    { label: '↔️ 水平摇镜', value: 'pan' },
    { label: '🏃 跟随镜头', value: 'tracking' },
    { label: '🔍 缓慢推镜', value: 'zoom-in' },
    { label: '👋 手持晃动', value: 'handheld' },
  ];

  const totalDuration = shots.reduce((acc, s) => acc + s.duration, 0);

  return (
    <div className="storyboardContainer">
      {/* 左侧：分镜列表 */}
      <div className="storyboardMain">
        {/* 顶部统计栏 */}
        <div className="storyboardHeader">
          <Space size="large">
            <div className="headerStat">
              <VideoCameraOutlined />
              <Text strong style={{ color: '#fff' }}>{shots.length}</Text>
              <Text type="secondary">Shots</Text>
            </div>
            <div className="headerStat">
              <CheckCircleOutlined style={{ color: confirmedCount > 0 ? '#52c41a' : undefined }} />
              <Text strong style={{ color: confirmedCount > 0 ? '#52c41a' : '#fff' }}>{confirmedCount}</Text>
              <Text type="secondary">已确认</Text>
            </div>
            <div className="headerStat">
              <Text strong style={{ color: '#fff' }}>{totalDuration}s</Text>
              <Text type="secondary">Duration</Text>
            </div>
          </Space>
          <Space>
            <Button icon={<ThunderboltOutlined />}>批量渲染</Button>
            <Button
              icon={<SendOutlined />}
              disabled={confirmedCount === 0}
              onClick={handleSendToTimeline}
            >
              入轨 ({confirmedCount})
            </Button>
            <Button type="primary" icon={<PlayCircleOutlined />}>预览整片</Button>
          </Space>
        </div>

        {/* 镜头卡片列表 */}
        <div className="storyboardList">
          {shots.map((shot, index) => (
            <div
              key={shot.id}
              className={`shotCard ${selectedShotId === shot.id ? 'selected' : ''} ${shot.confirmed ? 'confirmed' : ''}`}
              onClick={() => setSelectedShotId(shot.id)}
            >
              <Badge count={index + 1} className="shotIndex" />
              {shot.confirmed && (
                <CheckCircleFilled className="confirmedBadge" style={{ color: '#52c41a', position: 'absolute', top: 8, right: 8, fontSize: 18, zIndex: 10 }} />
              )}

              {/* 缩略图 */}
              <div className="shotThumbnail">
                <Image
                  src={`https://picsum.photos/seed/${shot.id}/300/169`}
                  alt="Storyboard thumbnail"
                  preview={false}
                />
                <div className="thumbnailOverlay">
                  <PlayCircleOutlined className="playIcon" />
                </div>
                <Tag className="durationTag">{shot.duration}s</Tag>
                <Tag className="shotTypeTag">{shotTypeMap[shot.shotType] || shot.shotType}</Tag>
              </div>

              {/* 内容区 */}
              <div className="shotContent">
                <Paragraph
                  className="scriptContent"
                  ellipsis={{ rows: 1 }}
                >
                  "{shot.scriptContent}"
                </Paragraph>

                <div className="shotDescription">
                  <CameraOutlined />
                  <Paragraph ellipsis={{ rows: 2 }} className="descText">
                    {shot.description}
                  </Paragraph>
                </div>

                <div className="shotFooter">
                  <Space size={4} wrap>
                    {shot.cameraMovement !== 'static' && (
                      <Tag color="purple">
                        {cameraMovementMap[shot.cameraMovement] || shot.cameraMovement}
                      </Tag>
                    )}
                    {shot.characters.map(charId => {
                      const char = characters.find(c => c.id === charId);
                      return char ? (
                        <Tag key={charId} color="blue">{char.name}</Tag>
                      ) : null;
                    })}
                  </Space>

                  <Space size={4}>
                    <Tooltip title={shot.confirmed ? '取消确认' : '确认此分镜'}>
                      <Button
                        type="text"
                        size="small"
                        icon={shot.confirmed ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <CheckCircleOutlined />}
                        onClick={(e) => { e.stopPropagation(); handleToggleConfirm(shot); }}
                      />
                    </Tooltip>
                    <Tooltip title="详细参数">
                      <Button
                        type="text"
                        size="small"
                        icon={<InfoCircleOutlined />}
                        onClick={(e) => { e.stopPropagation(); setSelectedShotId(shot.id); }}
                      />
                    </Tooltip>
                    <Tooltip title="播放预览">
                      <Button
                        type="text"
                        size="small"
                        icon={<CaretRightOutlined />}
                      />
                    </Tooltip>
                  </Space>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：AI 导演控制面板 */}
      <div className="directorPanel">
        <div className="panelHeader">
          <SettingOutlined style={{ color: '#10b981' }} />
          <Text strong>AI 导演控制台</Text>
        </div>

        {selectedShot ? (
          <div className="panelContent">
            {/* 模型信息 */}
            <Form layout="vertical">
              <Form.Item label="视频生成引擎 (Global)">
                <Card size="small" className="engineCard">
                  <div className="engineInfo">
                    <div className="engineIcon">
                      {settings.itv.provider.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <Text strong style={{ textTransform: 'capitalize' }}>
                        {settings.itv.provider}
                      </Text>
                      <br />
                      <Text type="secondary" code style={{ fontSize: 10 }}>
                        {settings.itv.modelName}
                      </Text>
                    </div>
                    <Badge status="success" className="statusBadge" />
                  </div>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    使用全局设置中配置的模型进行生成。
                  </Text>
                </Card>
              </Form.Item>

              <Form.Item label="画面提示词 (Prompt)">
                <textarea
                  className="promptTextarea"
                  defaultValue={selectedShot.description}
                  rows={4}
                />
              </Form.Item>

              <Form.Item label="景别 (Shot Size)">
                <Segmented
                  options={shotTypeOptions}
                  value={selectedShot.shotType}
                  block
                />
              </Form.Item>

              <Form.Item label="运镜 (Movement)">
                <Select
                  options={cameraOptions}
                  defaultValue={selectedShot.cameraMovement}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Form>

            <div className="panelActions">
              <Button type="primary" size="large" icon={<CaretRightOutlined />} block>
                生成此镜头 (Render)
              </Button>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', textAlign: 'center', marginTop: 8 }}>
                预计消耗 40 Tokens
              </Text>
            </div>
          </div>
        ) : (
          <div className="panelEmpty">
            <SettingOutlined style={{ fontSize: 48, opacity: 0.1 }} />
            <Text>请选择一个分镜</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>以配置详细的导演参数</Text>
          </div>
        )}
      </div>
    </div>
  );
};
