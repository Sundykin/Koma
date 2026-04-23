import React from 'react';
import { Button } from 'antd';
import {
  SettingOutlined,
  SaveOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { ChevronRight, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Project, Episode, EditorStep, EpisodeStepProgress } from '../../types';
import { StepNavigator } from './StepNavigator';

interface HeaderProps {
  view: 'projects' | 'overview' | 'editor' | 'settings';
  activeProject: Project | null;
  activeEpisode: Episode | null;
  editorStep: EditorStep;
  stepProgress: EpisodeStepProgress;
  isAnalyzing: boolean;
  scriptText: string;
  onViewChange: (view: 'projects' | 'overview') => void;
  onStepChange: (step: EditorStep) => void;
  onStepChangeWithMark: (step: EditorStep) => void;
  onOpenProjectSettings: () => void;
  onAnalyze: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  view,
  activeProject,
  activeEpisode,
  editorStep,
  stepProgress,
  isAnalyzing: _isAnalyzing,
  scriptText: _scriptText,
  onViewChange,
  onStepChange,
  onStepChangeWithMark,
  onOpenProjectSettings,
  onAnalyze: _onAnalyze,
}) => {
  const { t } = useTranslation();

  return (
    <header className="h-auto border-b border-zinc-800 flex flex-col bg-zinc-900/80 backdrop-blur-md shrink-0 z-30">
      {/* 上层：导航与操作 */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-zinc-800/50">
        <div className="flex items-center text-sm text-zinc-400">
          <button onClick={() => onViewChange('projects')} className="hover:text-white transition-colors flex items-center">
            <Home className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">{t('common.home')}</span>
          </button>
          {/* 项目概览视图面包屑 */}
          {view === 'overview' && activeProject && (
            <>
              <ChevronRight className="w-4 h-4 mx-2 text-zinc-600" />
              <span className="text-white font-bold">{activeProject.title}</span>
              <span className="ml-2 text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded shadow-sm">{t('common.overview')}</span>
            </>
          )}
          {/* 编辑视图面包屑 */}
          {view === 'editor' && activeProject && (
            <>
              <ChevronRight className="w-4 h-4 mx-2 text-zinc-600" />
              <button
                onClick={() => onViewChange('overview')}
                className="hover:text-white transition-colors"
              >
                {activeProject.title}
              </button>
              {activeEpisode && (
                <>
                  <ChevronRight className="w-4 h-4 mx-2 text-zinc-600" />
                  <span className="text-white font-bold">{t('editor.episode')} {activeEpisode.number}</span>
                </>
              )}
              {activeProject.mode === 'narration' && (
                <span className="ml-2 text-[10px] bg-blue-900/30 text-blue-300 border border-blue-800/50 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide">{t('editor.narrationMode')}</span>
              )}
            </>
          )}
          {view === 'settings' && (
            <>
              <ChevronRight className="w-4 h-4 mx-2" />
              <span className="text-white">{t('settings.globalSettings')}</span>
            </>
          )}
        </div>

        {view === 'editor' && (
          <div className="flex gap-3">
            <Button icon={<SettingOutlined />} onClick={onOpenProjectSettings}>
              {t('project.settings')}
            </Button>
            <Button icon={<SaveOutlined />}>
              {t('common.saveDraft')}
            </Button>
            <Button type="primary" icon={<ExportOutlined />}>
              {t('common.exportProject')}
            </Button>
          </div>
        )}
      </div>

      {/* 下层：步骤导航 (仅在编辑器模式显示) */}
      {view === 'editor' && (
        <>
          <StepNavigator
            currentStep={editorStep}
            onStepChange={onStepChange}
            stepProgress={stepProgress}
            actionButton={
              editorStep === 'assets' ? (
                <Button
                  type="primary"
                  onClick={() => onStepChangeWithMark('storyboard')}
                  className="bg-green-600 hover:bg-green-500 border-none"
                >
                  {t('editor.nextStoryboard')}
                </Button>
              ) : editorStep === 'storyboard' ? (
                <Button
                  type="primary"
                  onClick={() => onStepChangeWithMark('video')}
                  className="bg-green-600 hover:bg-green-500 border-none"
                >
                  {t('editor.nextVideo')}
                </Button>
              ) : null
            }
          />
        </>
      )}
    </header>
  );
};
