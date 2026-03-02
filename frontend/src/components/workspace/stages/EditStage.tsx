/**
 * Edit 阶段 — 时间线剪辑 + 导出
 * 复用 SimpleEditor 剪辑器
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Button, Spin } from 'antd';
import { Scissors, Film } from 'lucide-react';
import { SimpleEditor } from '../../editor/SimpleEditor';
import { loadEpisodeShots } from '../../../store/projectStore';
import type { Shot } from '../../../types';

interface Episode {
  id: string;
  number: number;
  title: string;
}

interface EditStageProps {
  projectId: string;
  episode: Episode | null;
  projectConfig: Record<string, any>;
  onRefreshStatuses: () => void;
  onStageChange: (stage: string) => void;
  onEpisodeUpdate: (episodeId: string, updates: any) => void;
}

const EditStage: React.FC<EditStageProps> = ({
  projectId,
  episode,
  onStageChange,
}) => {
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(false);

  const loadShots = useCallback(async () => {
    if (!episode) return;
    setLoading(true);
    try {
      const data = await loadEpisodeShots(projectId, episode.id);
      setShots(data);
    } catch (err) {
      console.error('加载分镜失败:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, episode?.id]);

  useEffect(() => {
    loadShots();
  }, [loadShots]);

  if (!episode) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <div className="text-center space-y-3">
          <Scissors className="w-12 h-12 mx-auto opacity-20" />
          <p>请先选择一个剧集</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin size="large" tip="加载剪辑数据..."><div className="p-12" /></Spin>
      </div>
    );
  }

  if (shots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <div className="text-center space-y-4">
          <Scissors className="w-16 h-16 mx-auto opacity-10" />
          <p>需完成分镜和视频生成后才能进入剪辑</p>
          <Button type="link" onClick={() => onStageChange('video')}>
            返回视频阶段
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SimpleEditor
      shots={shots}
      projectId={projectId}
      episodeId={episode.id}
    />
  );
};

export default EditStage;
