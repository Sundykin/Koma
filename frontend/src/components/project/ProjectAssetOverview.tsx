/**
 * 项目资产总览组件
 * 显示项目中所有角色、场景、道具及其跨集使用情况
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, Avatar, Tag, Empty, Spin, Tooltip } from 'antd';
import { User, MapPin, Box, Link } from 'lucide-react';
import type { Character, Scene, Prop, EpisodeRef } from '../../types';
import { loadCharacters, loadScenes, loadProps, getOrphanedAssets } from '../../store/projectStore';
import { electronService } from '../../services/electronService';
import { createLogger } from '../../store/logger';

const logger = createLogger('ProjectAssetOverview');

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
      logger.error('加载资产失败:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const renderEpisodeRefs = (refs?: EpisodeRef[]) => {
    if (!refs || refs.length === 0) {
      return <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">未使用</span>;
    }
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {refs.slice(0, 2).map((ref, idx) => (
          <Tooltip key={idx} title={ref.firstAppearance ? '首次出现' : '复用'}>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              ref.firstAppearance
                ? 'bg-emerald-900/50 text-emerald-400'
                : 'bg-blue-900/50 text-blue-400'
            }`}>
              {ref.episodeName || `E${idx + 1}`}
            </span>
          </Tooltip>
        ))}
        {refs.length > 2 && (
          <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
            +{refs.length - 2}
          </span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spin />
      </div>
    );
  }

  const totalAssets = characters.length + scenes.length + props.length;

  return (
    <div className="h-full flex flex-col">
      {/* 统计栏 */}
      <div className="px-4 py-3 border-b border-zinc-800/80">
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-lg font-semibold text-zinc-200">{characters.length}</div>
            <div className="text-[10px] text-zinc-500">角色</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-zinc-200">{scenes.length}</div>
            <div className="text-[10px] text-zinc-500">场景</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-zinc-200">{props.length}</div>
            <div className="text-[10px] text-zinc-500">道具</div>
          </div>
        </div>
        {orphanedCount > 0 && (
          <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-orange-400">
            <Link className="w-3 h-3" />
            {orphanedCount} 个未使用
          </div>
        )}
      </div>

      {/* Tab 内容 */}
      <Tabs
        defaultActiveKey="characters"
        centered
        size="small"
        className="flex-1 overflow-hidden [&_.ant-tabs-content]:h-full [&_.ant-tabs-tabpane]:h-full"
        items={[
          {
            key: 'characters',
            label: (
              <span className="flex items-center gap-1 text-xs">
                <User className="w-3 h-3" />
                角色
              </span>
            ),
            children: (
              <div className="h-full overflow-y-auto p-2">
                {characters.length === 0 ? (
                  <Empty description="暂无角色" className="py-6" imageStyle={{ height: 40 }} />
                ) : (
                  <div className="flex flex-col gap-1">
                    {characters.map((char) => (
                      <div
                        key={char.id}
                        onClick={() => onAssetClick?.(char.id, 'character')}
                        className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-zinc-800/50 transition-colors"
                      >
                        <Avatar
                          size={32}
                          src={char.costumePhotoPath ? electronService.fs.toLocalUrl(char.costumePhotoPath) : undefined}
                          className="bg-emerald-600 flex-shrink-0"
                        >
                          {char.name.charAt(0)}
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-200 truncate">{char.name}</div>
                          {renderEpisodeRefs(char.episodeRefs)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'scenes',
            label: (
              <span className="flex items-center gap-1 text-xs">
                <MapPin className="w-3 h-3" />
                场景
              </span>
            ),
            children: (
              <div className="h-full overflow-y-auto p-2">
                {scenes.length === 0 ? (
                  <Empty description="暂无场景" className="py-6" imageStyle={{ height: 40 }} />
                ) : (
                  <div className="flex flex-col gap-1">
                    {scenes.map((scene) => (
                      <div
                        key={scene.id}
                        onClick={() => onAssetClick?.(scene.id, 'scene')}
                        className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-zinc-800/50 transition-colors"
                      >
                        <Avatar size={32} className="bg-purple-600 flex-shrink-0">
                          <MapPin className="w-4 h-4" />
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-200 truncate">{scene.name}</div>
                          {renderEpisodeRefs(scene.episodeRefs)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'props',
            label: (
              <span className="flex items-center gap-1 text-xs">
                <Box className="w-3 h-3" />
                道具
              </span>
            ),
            children: (
              <div className="h-full overflow-y-auto p-2">
                {props.length === 0 ? (
                  <Empty description="暂无道具" className="py-6" imageStyle={{ height: 40 }} />
                ) : (
                  <div className="flex flex-col gap-1">
                    {props.map((prop) => (
                      <div
                        key={prop.id}
                        onClick={() => onAssetClick?.(prop.id, 'prop')}
                        className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-zinc-800/50 transition-colors"
                      >
                        <Avatar size={32} className="bg-amber-600 flex-shrink-0">
                          <Box className="w-4 h-4" />
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-200 truncate">{prop.name}</div>
                          {renderEpisodeRefs(prop.episodeRefs)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};

export default ProjectAssetOverview;
