import React from 'react';
import { Button } from 'antd';
import {
  Users,
  Clapperboard,
  Scissors,
} from 'lucide-react';
import { Project, Episode, EditorStep, EpisodeStepProgress, ScriptAnalysisResult, AppSettings, ProjectStyleSnapshot } from '../../types';
import type { MentionItem } from '../../editor';
import { SimpleEditor } from './index';
import { AssetManager } from '../asset/AssetManager';
import { Storyboard } from '../storyboard/Storyboard';
import { StepNavigator } from '../common/StepNavigator';

interface EditorViewProps {
  activeProject: Project;
  activeEpisode: Episode | null;
  editorStep: EditorStep;
  stepProgress: EpisodeStepProgress;
  scriptText: string;
  analysisData: ScriptAnalysisResult | null;
  appSettings: AppSettings;
  mentionItems: MentionItem[];
  onStepChange: (step: EditorStep) => void;
  onStepChangeWithMark: (step: EditorStep) => void;
  onViewChange: (view: 'projects') => void;
  onOpenProjectSettings: () => void;
}

export const EditorView: React.FC<EditorViewProps> = ({
  activeProject,
  activeEpisode,
  editorStep,
  stepProgress,
  scriptText,
  analysisData,
  appSettings,
  mentionItems,
  onStepChange,
  onStepChangeWithMark,
  onViewChange,
  onOpenProjectSettings: _onOpenProjectSettings,
}) => {
  const styleSnapshot: ProjectStyleSnapshot | undefined = activeProject.styleSnapshot;

  const getActionButton = () => {
    if (editorStep === 'assets') {
      return (
        <Button
          type="primary"
          onClick={() => onStepChangeWithMark('storyboard')}
          className="bg-emerald-600 hover:bg-emerald-500 border-none"
        >
          下一步：AI分镜
        </Button>
      );
    }
    if (editorStep === 'storyboard') {
      return (
        <Button
          type="primary"
          onClick={() => onStepChangeWithMark('video')}
          className="bg-emerald-600 hover:bg-emerald-500 border-none"
        >
          下一步：后期剪辑
        </Button>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* 嵌入式步骤导航 */}
      <StepNavigator
        currentStep={editorStep}
        onStepChange={onStepChange}
        stepProgress={stepProgress}
        actionButton={getActionButton()}
      />

      {/* 主内容区 */}
      <div className="flex-1 overflow-hidden relative">
        {/* 资产管理视图 */}
        {editorStep === 'assets' && (
          activeProject ? (
              <AssetManager
                projectId={activeProject.id}
                ttiConfigId={activeProject.ttiConfigId}
                itvConfigId={activeProject.itvConfigId}
                styleSnapshot={styleSnapshot}
                episodeId={activeEpisode?.id}
                episodeName={activeEpisode?.title || (activeEpisode ? `第${activeEpisode.number}集` : undefined)}
                script={scriptText}
                llmConfigId={activeProject.llmConfigId}
              characters={analysisData?.characters}
              scenes={analysisData?.scenes}
              props={analysisData?.props}
              onNext={() => onStepChange('storyboard')}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-500 flex-col gap-4">
              <Users className="w-16 h-16 opacity-10" />
              <p>请先选择项目。</p>
              <Button type="link" onClick={() => onViewChange('projects')}>返回项目列表</Button>
            </div>
          )
        )}

        {/* 分镜视图 */}
        {editorStep === 'storyboard' && (
          activeProject ? (
            <div className="absolute inset-0">
              <Storyboard
                projectId={activeProject.id}
                episodeId={activeEpisode?.id}
                episodeName={activeEpisode?.title || (activeEpisode ? `第${activeEpisode.number}集` : undefined)}
                script={scriptText}
                llmConfigId={activeProject.llmConfigId}
                ttiConfigId={activeProject.ttiConfigId}
                itvConfigId={activeProject.itvConfigId}
                ttsConfigId={activeProject.ttsConfigId}
                settings={appSettings}
                styleSnapshot={styleSnapshot}
                mentionItems={mentionItems}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-500 flex-col gap-4">
              <Clapperboard className="w-16 h-16 opacity-10" />
              <p>请先选择项目。</p>
              <Button type="link" onClick={() => onViewChange('projects')}>返回项目列表</Button>
            </div>
          )
        )}

        {/* 剪辑视图 */}
        {editorStep === 'video' && (
          analysisData ? (
            <SimpleEditor
              shots={analysisData.shots}
              projectId={activeProject?.id}
              episodeId={activeEpisode?.id}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-500 flex-col gap-4">
              <Scissors className="w-16 h-16 opacity-10" />
              <p>需完成分镜生成后才能进入剪辑环节。</p>
              <Button type="link" onClick={() => onStepChange('storyboard')}>返回分镜</Button>
            </div>
          )
        )}
      </div>
    </div>
  );
};
