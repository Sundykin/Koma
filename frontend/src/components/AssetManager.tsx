import React, { useState } from 'react';
import { Tabs, Button, Card, Tag, Image, Empty, Modal, Row, Col, Tooltip } from 'antd';
import {
  UserOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  PlusOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import type { Character, Scene, Prop } from '../types';
import './AssetManager.css';

interface AssetManagerProps {
  characters: Character[];
  scenes: Scene[];
  props?: Prop[];
  onNext: () => void;
}

type TabType = 'characters' | 'scenes' | 'props';

export const AssetManager: React.FC<AssetManagerProps> = ({ characters, scenes, props = [], onNext }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const getRoleTag = (role: string) => {
    switch (role) {
      case 'protagonist': return <Tag color="blue">主角</Tag>;
      case 'antagonist': return <Tag color="red">反派</Tag>;
      default: return <Tag>配角</Tag>;
    }
  };

  const getTimeEmoji = (time: string) => {
    switch (time) {
      case 'day': return '☀️';
      case 'night': return '🌙';
      default: return '🌇';
    }
  };

  // 角色网格
  const renderCharacters = () => (
    <Row gutter={[16, 16]}>
      {characters.map((char) => (
        <Col key={char.id} xs={12} sm={8} md={6} lg={4} xl={3}>
          <Card
            hoverable
            cover={
              <div className="assetImageContainer">
                <Image
                  src={`https://picsum.photos/seed/${char.id}/400/533`}
                  alt={char.name}
                  preview={false}
                  onClick={() => setPreviewUrl(`https://picsum.photos/seed/${char.id}/800/1066`)}
                  style={{ aspectRatio: '1/1', objectFit: 'cover', objectPosition: 'top' }}
                />
                <div className="assetRoleTag">{getRoleTag(char.role)}</div>
                <div className="assetOverlay">
                  <Button
                    type="primary"
                    shape="circle"
                    icon={<EyeOutlined />}
                    onClick={(e) => { e.stopPropagation(); setPreviewUrl(`https://picsum.photos/seed/${char.id}/800/1066`); }}
                  />
                </div>
              </div>
            }
            styles={{ body: { padding: '8px 12px' } }}
          >
            <Card.Meta
              title={<span className="assetTitle">{char.name}</span>}
              description={<span className="assetDesc">{char.appearance}</span>}
            />
          </Card>
        </Col>
      ))}
      {/* 添加角色按钮 */}
      <Col xs={12} sm={8} md={6} lg={4} xl={3}>
        <Card className="assetAddCard" hoverable>
          <div className="assetAddContent">
            <PlusOutlined style={{ fontSize: 24 }} />
            <span>新建角色</span>
          </div>
        </Card>
      </Col>
    </Row>
  );

  // 场景网格
  const renderScenes = () => (
    <Row gutter={[16, 16]}>
      {scenes.map((scene) => (
        <Col key={scene.id} xs={12} sm={8} md={6} lg={4} xl={3}>
          <Card
            hoverable
            cover={
              <div className="assetImageContainer">
                <Image
                  src={`https://picsum.photos/seed/${scene.id}scene/600/338`}
                  alt={scene.name}
                  preview={false}
                  onClick={() => setPreviewUrl(`https://picsum.photos/seed/${scene.id}scene/1200/676`)}
                  style={{ aspectRatio: '1/1', objectFit: 'cover' }}
                />
                <div className="assetTimeTag">{getTimeEmoji(scene.time)}</div>
                <div className="assetOverlay">
                  <Button
                    type="primary"
                    shape="circle"
                    icon={<EyeOutlined />}
                    onClick={(e) => { e.stopPropagation(); setPreviewUrl(`https://picsum.photos/seed/${scene.id}scene/1200/676`); }}
                  />
                </div>
              </div>
            }
            styles={{ body: { padding: '8px 12px' } }}
          >
            <Card.Meta
              title={<span className="assetTitle">{scene.name}</span>}
              description={<span className="assetDesc">{scene.mood}</span>}
            />
          </Card>
        </Col>
      ))}
      <Col xs={12} sm={8} md={6} lg={4} xl={3}>
        <Card className="assetAddCard" hoverable>
          <div className="assetAddContent">
            <PlusOutlined style={{ fontSize: 24 }} />
            <span>新建场景</span>
          </div>
        </Card>
      </Col>
    </Row>
  );

  // 道具网格
  const renderProps = () => (
    <Row gutter={[16, 16]}>
      {props.length > 0 ? props.map((prop) => (
        <Col key={prop.id} xs={12} sm={8} md={6} lg={4} xl={3}>
          <Card
            hoverable
            cover={
              <div className="assetImageContainer propContainer">
                <Image
                  src={`https://picsum.photos/seed/${prop.id}prop/300/300`}
                  alt={prop.name}
                  preview={false}
                  onClick={() => setPreviewUrl(`https://picsum.photos/seed/${prop.id}prop/600/600`)}
                  style={{ aspectRatio: '1/1', objectFit: 'contain', padding: 8 }}
                />
                <div className="assetOverlay">
                  <Button
                    type="primary"
                    shape="circle"
                    icon={<EyeOutlined />}
                    onClick={(e) => { e.stopPropagation(); setPreviewUrl(`https://picsum.photos/seed/${prop.id}prop/600/600`); }}
                  />
                </div>
              </div>
            }
            styles={{ body: { padding: '8px 12px' } }}
          >
            <Card.Meta
              title={
                <div>
                  <Tag style={{ marginBottom: 4 }}>{prop.type}</Tag>
                  <div className="assetTitle">{prop.name}</div>
                </div>
              }
            />
          </Card>
        </Col>
      )) : (
        <Col span={24}>
          <Empty description="未检测到关键道具" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Col>
      )}
      <Col xs={12} sm={8} md={6} lg={4} xl={3}>
        <Card className="assetAddCard" hoverable>
          <div className="assetAddContent">
            <PlusOutlined style={{ fontSize: 24 }} />
            <span>新建道具</span>
          </div>
        </Card>
      </Col>
    </Row>
  );

  const tabItems = [
    { key: 'characters', label: <span><UserOutlined /> 角色</span>, children: renderCharacters() },
    { key: 'scenes', label: <span><EnvironmentOutlined /> 场景</span>, children: renderScenes() },
    { key: 'props', label: <span><InboxOutlined /> 道具</span>, children: renderProps() },
  ];

  return (
    <div className="assetManagerContainer">
      <Tabs
        items={tabItems}
        tabBarExtraContent={
          <Tooltip title="批量生成素材">
            <Button icon={<ThunderboltOutlined />}>批量生成</Button>
          </Tooltip>
        }
      />

      {/* 底部操作栏 */}
      <div className="assetFooter">
        <Button
          type="primary"
          size="large"
          icon={<ArrowRightOutlined />}
          onClick={onNext}
          className="assetNextBtn"
        >
          下一步：生成 AI 分镜
        </Button>
      </div>

      {/* 全图预览 */}
      <Modal
        open={!!previewUrl}
        onCancel={() => setPreviewUrl(null)}
        footer={null}
        centered
        width="auto"
        styles={{ body: { padding: 0 } }}
      >
        {previewUrl && <img src={previewUrl} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '85vh' }} />}
      </Modal>
    </div>
  );
};
