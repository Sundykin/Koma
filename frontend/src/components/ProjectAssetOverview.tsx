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
} from 'antd';
import {
  UserOutlined,
  EnvironmentOutlined,
  GiftOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { Users, MapPin, Package } from 'lucide-react';
import type { Character, Scene, Prop, EpisodeRef } from '../types';
import { loadCharacters, loadScenes, loadProps, getOrphanedAssets } from '../store/projectStore';
import { electronService } from '../services/electronService';

const { Paragraph } = Typography;

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

  const renderEpisodeRefs = (refs?: EpisodeRef[]) => {
    if (!refs || refs.length === 0) {
      return <Tag color="default" style={{ fontSize: 10 }}>未使用</Tag>;
    }
    return (
      <Space size={2} wrap>
        {refs.slice(0, 2).map((ref, idx) => (
          <Tooltip key={idx} title={ref.firstAppearance ? '首次出现' : '复用'}>
            <Tag color={ref.firstAppearance ? 'green' : 'blue'} style={{ fontSize: 10 }}>
              {ref.episodeName || `第${idx + 1}集`}
            </Tag>
          </Tooltip>
        ))}
        {refs.length > 2 && <Tag style={{ fontSize: 10 }}>+{refs.length - 2}</Tag>}
      </Space>
    );
  };

  const renderCharacterItem = (character: Character) => (
    <List.Item
      key={character.id}
      className="cursor-pointer hover:bg-gray-800 transition-colors rounded px-2 py-1"
      style={{ padding: '6px 8px' }}
      onClick={() => onAssetClick?.(character.id, 'character')}
    >
      <List.Item.Meta
        avatar={
          <Avatar
            size="small"
            src={character.costumePhotoPath ? electronService.fs.toLocalUrl(character.costumePhotoPath) : undefined}
            icon={<UserOutlined />}
            style={{ backgroundColor: '#10b981' }}
          />
        }
        title={
          <span className="text-white text-sm">{character.name}</span>
        }
        description={renderEpisodeRefs(character.episodeRefs)}
      />
    </List.Item>
  );

  const renderSceneItem = (scene: Scene) => (
    <List.Item
      key={scene.id}
      className="cursor-pointer hover:bg-gray-800 transition-colors rounded px-2 py-1"
      style={{ padding: '6px 8px' }}
      onClick={() => onAssetClick?.(scene.id, 'scene')}
    >
      <List.Item.Meta
        avatar={
          <Avatar
            size="small"
            icon={<EnvironmentOutlined />}
            style={{ backgroundColor: '#8b5cf6' }}
          />
        }
        title={
          <span className="text-white text-sm">{scene.name}</span>
        }
        description={renderEpisodeRefs(scene.episodeRefs)}
      />
    </List.Item>
  );

  const renderPropItem = (prop: Prop) => (
    <List.Item
      key={prop.id}
      className="cursor-pointer hover:bg-gray-800 transition-colors rounded px-2 py-1"
      style={{ padding: '6px 8px' }}
      onClick={() => onAssetClick?.(prop.id, 'prop')}
    >
      <List.Item.Meta
        avatar={
          <Avatar
            size="small"
            icon={<GiftOutlined />}
            style={{ backgroundColor: '#f59e0b' }}
          />
        }
        title={
          <span className="text-white text-sm">{prop.name}</span>
        }
        description={renderEpisodeRefs(prop.episodeRefs)}
      />
    </List.Item>
  );

  if (loading) {
    return (
      <Card
        className="h-full flex flex-col"
        style={{ background: '#141414', border: '1px solid #333' }}
        bodyStyle={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Spin />
      </Card>
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
              <Tag color="warning" icon={<LinkOutlined />} style={{ fontSize: 10 }}>
                {orphanedCount} 未用
              </Tag>
            </Tooltip>
          )}
        </div>
      }
      className="h-full flex flex-col"
      style={{ background: '#141414', border: '1px solid #333' }}
      headStyle={{ borderBottom: '1px solid #333', flexShrink: 0 }}
      bodyStyle={{ flex: 1, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}
    >
      <Tabs
        defaultActiveKey="characters"
        centered
        size="small"
        className="h-full flex flex-col"
        style={{ height: '100%' }}
        items={[
          {
            key: 'characters',
            label: (
              <span className="text-xs">
                <Users className="w-3 h-3 inline-block mr-1" />
                角色({characters.length})
              </span>
            ),
            children: (
              <div className="flex-1 overflow-y-auto px-2" style={{ maxHeight: 'calc(100% - 46px)' }}>
                {characters.length === 0 ? (
                  <Empty description="暂无角色" className="py-4" />
                ) : (
                  <List
                    dataSource={characters}
                    renderItem={renderCharacterItem}
                    split={false}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'scenes',
            label: (
              <span className="text-xs">
                <MapPin className="w-3 h-3 inline-block mr-1" />
                场景({scenes.length})
              </span>
            ),
            children: (
              <div className="flex-1 overflow-y-auto px-2" style={{ maxHeight: 'calc(100% - 46px)' }}>
                {scenes.length === 0 ? (
                  <Empty description="暂无场景" className="py-4" />
                ) : (
                  <List
                    dataSource={scenes}
                    renderItem={renderSceneItem}
                    split={false}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'props',
            label: (
              <span className="text-xs">
                <Package className="w-3 h-3 inline-block mr-1" />
                道具({props.length})
              </span>
            ),
            children: (
              <div className="flex-1 overflow-y-auto px-2" style={{ maxHeight: 'calc(100% - 46px)' }}>
                {props.length === 0 ? (
                  <Empty description="暂无道具" className="py-4" />
                ) : (
                  <List
                    dataSource={props}
                    renderItem={renderPropItem}
                    split={false}
                  />
                )}
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
};

export default ProjectAssetOverview;
