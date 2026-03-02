/**
 * Storyboard 阶段 — 分镜生成
 * 功能：分镜列表 + 图片生成 + 分镜编辑
 * 复用现有 Storyboard 组件
 */
import React, { useCallback } from 'react';
import { Clapperboard, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Storyboard } from '../../storyboard/Storyboard';

interface Episode {
  id: string;
  number: number;
  title: string;
  scriptText?: string;
}

interface StoryboardStageProps {
  projectId: string;
  episode: Episode | null;
  projectConfig: {
    llmConfigId?: string;
    ttiConfigId?: string;
    [key: string]: any;
  };
  onRefreshStatuses: () => void;
  onStageChange: (stage: string) => void;
  onEpisodeUpdate: (episodeId: string, updates: Partial<Episode>) => void;
}

const StoryboardStage: React.FC<StoryboardStageProps> = ({
  projectId,
  episode,
  projectConfig,
  onRefreshStatuses,
  onStageChange,
}) => {
  const { t } = useTranslation('stage');
  const handleNext = useCallback(() => {
    onRefreshStatuses();
    onStageChange('video');
  }, [onRefreshStatuses, onStageChange]);

  if (!episode) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <div className="text-center space-y-3">
          <Clapperboard className="w-12 h-12 mx-auto opacity-20" />
          <p>{t('storyboard.emptyState')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Storyboard
        projectId={projectId}
        episodeId={episode.id}
        episodeName={episode.title || t('storyboard.episodeNameFallback', { number: episode.number })}
        script={episode.scriptText || ''}
        llmConfigId={projectConfig.llmConfigId}
        ttiConfigId={projectConfig.ttiConfigId}
        settings={{} as any}
        mentionItems={[]}
      />

      {/* 固定在右下角的下一步按钮 */}
      <button
        onClick={handleNext}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-900/30 transition-colors"
      >
        {t('storyboard.nextBtn')}
        <ArrowRight size={18} />
      </button>
    </div>
  );
};

export default StoryboardStage;
