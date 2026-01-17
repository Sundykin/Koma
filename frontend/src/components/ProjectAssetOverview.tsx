/**
 * 项目资产总览组件
 * 显示项目中所有角色、场景、道具及其跨集使用情况
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Tabs,
  List,
  Avatar,
  Tag,
  Space,
  Typography,
  Empty,
  Spin,
  Tooltip,
  Badge,
  Button,
} from 'antd';
import {
  UserOutlined,
  EnvironmentOutlined,
  GiftOutlined,
  LinkOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Users, MapPin, Package } from 'lucide-react';
import type { Character, Scene, Prop, EpisodeRef } from '../types';
import { loadCharacters, loadScenes, loadProps, getOrphanedAssets } from '../store/projectStore';

const { Text, Paragraph } = Typography;

interface ProjectAssetOverviewProps {
  projectId: string;
  onAssetClick?: (assetId: string, type: 'character' | 'scene' | 'prop') => void;
}

export const ProjectAssetOverview: React.FC<ProjectAssetOverviewProps> = ({
  projectId,
  onAssetClick,
}) => {
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [orphanedCount, setOrphanedCount] = useState(0);

  // 加载资产数据
  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const [chars, scns, prps, orphaned] = await Promise.all([
        loadCharacters(projectId),
        loadScenes(projectId),
        loadProps(projectId),
        getOrphanedAssets(projectId),
      ]);
      setCharacters(chars);
      setScenes(scns);
      setProps(prps);
      setOrphanedCount(
        orphaned.characters.length + orphaned.scenes.length + orphaned.props.length
      );
    } catch (err) {
      console.error('加载资产失败:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // 渲染分集引用标签
  const renderEpisodeRefs = (refs?: EpisodeRef[]) => {
    if (!refs || refs.length === 0) {
      return <Tag color="default">未使用</Tag>;
    }
    return (
      <Space size={4} wrap>
        {refs.slice(0, 3).map((ref, idx) => (
          <Tooltip key={idx} title={ref.firstAppearance ? '首次出现' : '复用'}>
            <Tag color={ref.firstAppearance ? 'green' : 'blue'}>
              {ref.episodeName || `第${idx + 1}集`}
            </Tag>
          </Tooltip>
        ))}
        {refs.length > 3 && (
          <Tag>+{refs.length - 3}</Tag>
        )}
      </Space>
    );
  };

  // 角色卡片
  const renderCharacterItem = (character: Character) => (
    <List.Item
      key={character.id}
      className="cursor-pointer hover:bg-gray-800 transition-colors rounded-lg px-3"
      onClick={() => onAssetClick?.(character.id, 'character')}
    >
      <List.Item.Meta
        avatar={
          <Avatar
            src={character.avatarUrl}
            icon={<UserOutlined />}
            style={{ backgroundColor: '#10b981' }}
          />
        }
        title={
          <Space>
            <span className="text-white">{character.name}</span>
            <Tag color={
              character.role === 'protagonist' ? 'gold' :
              character.role === 'antagonist' ? 'red' : 'default'
            }>
              {character.role === 'protagonist' ? '主角' :
               character.role === 'antagonist' ? '反派' : '配角'}
            </Tag>
          </Space>
        }
        description={
          <div>
            <Paragraph ellipsis={{ rows: 1 }} style={{ marginBottom: 4, color: '#888', fontSize: 12 }}>
              {character.description || '暂无描述'}
            </Paragraph>
            {renderEpisodeRefs(character.episodeRefs)}
          </div>
        }
      />
    </List.Item>
  );

  // 场景卡片
  const renderSceneItem = (scene: Scene) => (
    <List.Item
      key={scene.id}
      className="cursor-pointer hover:bg-gray-800 transition-colors rounded-lg px-3"
      onClick={() => onAssetClick?.(scene.id, 'scene')}
    >
      <List.Item.Meta
        avatar={
          <Avatar
            icon={<EnvironmentOutlined />}
            style={{ backgroundColor: '#8b5cf6' }}
          />
        }
        title={
          <Space>
            <span className="text-white">{scene.name}</span>
            <Tag color={
              scene.time === 'day' ? 'orange' :
              scene.time === 'night' ? 'purple' : 'gold'
            }>
              {scene.time === 'day' ? '日景' :
               scene.time === 'night' ? '夜景' : '黄昏'}
            </Tag>
          </Space>
        }
        description={
          <div>
            <Paragraph ellipsis={{ rows: 1 }} style={{ marginBottom: 4, color: '#888', fontSize: 12 }}>
              {scene.location} - {scene.mood}
            </Paragraph>
            {renderEpisodeRefs(scene.episodeRefs)}
          </div>
        }
      />
    </List.Item>
  );

  // 道具卡片
  const renderPropItem = (prop: Prop) => (
    <List.Item
      key={prop.id}
      className="cursor-pointer hover:bg-gray-800 transition-colors rounded-lg px-3"
      onClick={() => onAssetClick?.(prop.id, 'prop')}
    >
      <List.Item.Meta
        avatar={
          <Avatar
            icon={<GiftOutlined />}
            style={{ backgroundColor: '#f59e0b' }}
          />
        }
        title={
          <Space>
            <span className="text-white">{prop.name}</span>
            {prop.type && <Tag>{prop.type}</Tag>}
          </Space>
        }
        description={
          <div>
            <Paragraph ellipsis={{ rows: 1 }} style={{ marginBottom: 4, color: '#888', fontSize: 12 }}>
              {prop.description || '暂无描述'}
            </Paragraph>
            {renderEpisodeRefs(prop.episodeRefs)}
          </div>
        }
      />
    </List.Item>
  );

  if (loading) {
    return (
      <div className="py-8 text-center">
        <Spin />
      </div>
    );
  }

  const totalAssets = characters.length + scenes.length + props.length;

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-yellow-500" />
            <span>项目资产</span>
            <Badge count={totalAssets} style={{ backgroundColor: '#10b981' }} />
          </div>
          {orphanedCount > 0 && (
            <Tooltip title="有未被任何分集引用的资产">
              <Tag color="warning" icon={<LinkOutlined />}>
                {orphanedCount} 个未使用
              </Tag>
            </Tooltip>
          )}
        </div>
      }
      style={{ background: '#141414', border: '1px solid #333' }}
      headStyle={{ borderBottom: '1px solid #333' }}
      bodyStyle={{ padding: 0 }}
    >
      <Tabs
        defaultActiveKey="characters"
        centered
        items={[
          {
            key: 'characters',
            label: (
              <span>
                <Users className="w-4 h-4 inline-block mr-1" />
                角色 ({characters.length})
              </span>
            ),
            children: characters.length === 0 ? (
              <Empty description="暂无角色" className="py-8" />
            ) : (
              <List
                dataSource={characters}
                renderItem={renderCharacterItem}
                style={{ maxHeight: 300, overflow: 'auto' }}
              />
            ),
          },
          {
            key: 'scenes',
            label: (
              <span>
                <MapPin className="w-4 h-4 inline-block mr-1" />
                场景 ({scenes.length})
              </span>
            ),
            children: scenes.length === 0 ? (
              <Empty description="暂无场景" className="py-8" />
            ) : (
              <List
                dataSource={scenes}
                renderItem={renderSceneItem}
                style={{ maxHeight: 300, overflow: 'auto' }}
              />
            ),
          },
          {
            key: 'props',
            label: (
              <span>
                <Package className="w-4 h-4 inline-block mr-1" />
                道具 ({props.length})
              </span>
            ),
            children: props.length === 0 ? (
              <Empty description="暂无道具" className="py-8" />
            ) : (
              <List
                dataSource={props}
                renderItem={renderPropItem}
                style={{ maxHeight: 300, overflow: 'auto' }}
              />
            ),
          },
        ]}
      />
    </Card>
  );
};

export default ProjectAssetOverview;
