import React from 'react';
import { Project, Episode, AppSettings, ProjectStyleSnapshot, ScriptAnalysisResult } from '../../types';
import type { MentionItem } from '../../editor';
import { StoryboardWorkspace } from '../storyboard/StoryboardWorkspace';

interface EditorViewProps {
  activeProject: Project;
  activeEpisode: Episode | null;
  scriptText: string;
  analysisData: ScriptAnalysisResult | null;
  appSettings: AppSettings;
  mentionItems: MentionItem[];
  onViewChange: (view: 'projects') => void;
  onEpisodeChange?: (episode: Episode) => void;
  onProjectStyleApplied?: (updates: { stylePresetId: string; styleSnapshot: ProjectStyleSnapshot }) => void;
}

export const EditorView: React.FC<EditorViewProps> = ({
  activeProject,
  activeEpisode,
  scriptText,
  appSettings,
  mentionItems,
  onViewChange,
  onEpisodeChange,
  onProjectStyleApplied,
}) => {
  const styleSnapshot: ProjectStyleSnapshot | undefined = activeProject.styleSnapshot;

  return (
    <StoryboardWorkspace
      activeProject={activeProject}
      activeEpisode={activeEpisode}
      scriptText={scriptText}
      appSettings={appSettings}
      mentionItems={mentionItems}
      styleSnapshot={styleSnapshot}
      onViewChange={onViewChange}
      onEpisodeChange={onEpisodeChange}
      onProjectStyleApplied={onProjectStyleApplied}
    />
  );
};
