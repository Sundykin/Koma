import React from 'react';
import { Button } from 'antd';
import {
  SettingOutlined,
  SaveOutlined,
  ExportOutlined,
  ThunderboltOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { ChevronRight, Home } from 'lucide-react';
import { Project, Episode, EditorStep, EpisodeStepProgress } from '../../types';
import { StepNavigator } from './StepNavigator';
import { TaskStatusBar } from './TaskStatusBar';

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
  isAnalyzing,
  scriptText,
  onViewChange,
  onStepChange,
  onStepChangeWithMark,
  onOpenProjectSettings,
  onAnalyze,
}) => {
  return (
    <header className="h-auto border-b border-zinc-800 flex flex-col bg-zinc-900/80 backdrop-blur-md shrink-0 z-30">
      {/* 上层：导航与操作 */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-zinc-800/50">
        <div className="flex items-center text-sm text-zinc-400">
          <button onClick={() => onViewChange('projects')} className="hover:text-white transition-colors flex items-center">
            <Home className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">首页</span>
          </button>
          {/* 项目概览视图面包屑 */}
          {view === 'overview' && activeProject && (
            <>
              <ChevronRight className="w-4 h-4 mx-2 text-zinc-600" />
              <span className="text-white font-bold">{activeProject.title}</span>
              <span className="ml-2 text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded shadow-sm">概览</span>
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
                  <span className="text-white font-bold">第 {activeEpisode.number} 集</span>
                </>
              )}
              {activeProject.mode === 'narration' && (
                <span className="ml-2 text-[10px] bg-blue-900/30 text-blue-300 border border-blue-800/50 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide">旁白解说</span>
              )}
            </>
          )}
          {view === 'settings' && (
            <>
              <ChevronRight className="w-4 h-4 mx-2" />
              <span className="text-white">全局设置</span>
            </>
          )}
        </div>

        {view === 'editor' && (
          <div className="flex gap-3">
            <Button icon={<SettingOutlined />} onClick={onOpenProjectSettings}>
              项目设置
            </Button>
            <Button icon={<SaveOutlined />}>
              保存草稿
            </Button>
            <Button type="primary" icon={<ExportOutlined />}>
              导出工程
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
              editorStep === 'script' ? (
                <Button
                  type="primary"
                  icon={isAnalyzing ? <LoadingOutlined /> : <ThunderboltOutlined />}
                  onClick={onAnalyze}
                  disabled={isAnalyzing || !scriptText.trim()}
                  className="bg-green-600 hover:bg-green-500 border-none"
                >
                  {isAnalyzing ? '解析中...' : '开始智能解析'}
                </Button>
              ) : editorStep === 'assets' ? (
                <Button
                  type="primary"
                  onClick={() => onStepChangeWithMark('storyboard')}
                  className="bg-green-600 hover:bg-green-500 border-none"
                >
                  下一步：AI分镜
                </Button>
              ) : editorStep === 'storyboard' ? (
                <Button
                  type="primary"
                  onClick={() => onStepChangeWithMark('video')}
                  className="bg-green-600 hover:bg-green-500 border-none"
                >
                  下一步：后期剪辑
                </Button>
              ) : null
            }
          />
          {activeProject && <TaskStatusBar projectId={activeProject.id} />}
        </>
      )}
    </header>
  );
};
