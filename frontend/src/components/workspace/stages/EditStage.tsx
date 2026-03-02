/**
 * Edit 阶段 — 时间线剪辑 + 导出
 * 复用 SimpleEditor 剪辑器
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Button, Spin } from 'antd';
import { Scissors, Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('stage');
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
          <p>{t('edit.emptyState')}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin size="large" tip={t('edit.loadingTip')}><div className="p-12" /></Spin>
      </div>
    );
  }

  if (shots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <div className="text-center space-y-4">
          <Scissors className="w-16 h-16 mx-auto opacity-10" />
          <p>{t('edit.noShotsMsg')}</p>
          <Button type="link" onClick={() => onStageChange('video')}>
            {t('edit.backToVideo')}
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
