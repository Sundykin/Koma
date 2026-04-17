/**
 * ToolPanelDrawer - 右侧弹出式工具面板框架
 * 使用 Ant Design Drawer 封装，支持侧板状态保活和会话恢复。
 */
import React from 'react';
import { Drawer, Tag } from 'antd';
import type { ProjectStyleSnapshot } from '../../../types';
import { AssetManagerPanel } from './AssetManagerPanel';
import { ChapterInferencePanel } from './ChapterInferencePanel';
import { ExportCenterPanel } from './ExportCenterPanel';
import { ScriptStudioPanel } from './ScriptStudioPanel';
import { StyleSettingsPanel } from './StyleSettingsPanel';
import { WorkflowRecipesPanel } from './WorkflowRecipesPanel';
import {
  describeWorkflowSession,
  type StoryboardWorkflowContext,
  type WorkflowPanelId,
  type WorkflowPanelSessions,
} from './workflowSessions';

interface ToolPanelDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  panelId: WorkflowPanelId | null;
  projectId: string;
  episodeId: string;
  ttiSelection?: string;
  activeStylePresetId?: string;
  styleSnapshot?: ProjectStyleSnapshot;
  workflowSessions: WorkflowPanelSessions;
  storyboardContext: StoryboardWorkflowContext;
  onScriptSessionChange: (updates: Partial<WorkflowPanelSessions['script']>) => void;
  onAssetSessionChange: (updates: Partial<WorkflowPanelSessions['assets']>) => void;
  onInferenceSessionChange: (updates: Partial<WorkflowPanelSessions['inference']>) => void;
  onStyleSessionChange: (updates: Partial<WorkflowPanelSessions['style']>) => void;
  onExportSessionChange: (updates: Partial<WorkflowPanelSessions['export']>) => void;
  onAssistantSessionChange: (updates: Partial<WorkflowPanelSessions['assistant']>) => void;
  onShotsChanged?: () => void;
  onAssetsChanged?: () => void;
  onEpisodesChanged?: (preferredEpisodeId?: string) => void;
  onOpenPanel?: (panelId: WorkflowPanelId) => void;
}

export const ToolPanelDrawer: React.FC<ToolPanelDrawerProps> = ({
  open,
  title,
  onClose,
  panelId,
  projectId,
  episodeId,
  ttiSelection,
  activeStylePresetId,
  styleSnapshot,
  workflowSessions,
  storyboardContext,
  onScriptSessionChange,
  onAssetSessionChange,
  onInferenceSessionChange,
  onStyleSessionChange,
  onExportSessionChange,
  onAssistantSessionChange,
  onShotsChanged,
  onAssetsChanged,
  onEpisodesChanged,
  onOpenPanel,
}) => {
  const descriptor = panelId ? describeWorkflowSession(panelId, workflowSessions) : null;

  const panels: Partial<Record<WorkflowPanelId, React.ReactNode>> = {
    script: (
      <ScriptStudioPanel
        projectId={projectId}
        episodeId={episodeId}
        session={workflowSessions.script}
        onSessionChange={onScriptSessionChange}
        onShotsImported={onShotsChanged}
        onEpisodesChanged={onEpisodesChanged}
      />
    ),
    assets: (
      <AssetManagerPanel
        projectId={projectId}
        episodeId={episodeId}
        ttiSelection={ttiSelection}
        styleSnapshot={styleSnapshot}
        session={workflowSessions.assets}
        onSessionChange={onAssetSessionChange}
        onAssetsChanged={onAssetsChanged}
      />
    ),
    inference: (
      <ChapterInferencePanel
        projectId={projectId}
        episodeId={episodeId}
        storyboardContext={storyboardContext}
        session={workflowSessions.inference}
        onSessionChange={onInferenceSessionChange}
        onShotsChanged={onShotsChanged}
      />
    ),
    style: (
      <StyleSettingsPanel
        projectId={projectId}
        episodeId={episodeId}
        activeStylePresetId={activeStylePresetId}
        activeStyleSnapshot={styleSnapshot}
        storyboardContext={storyboardContext}
        session={workflowSessions.style}
        onSessionChange={onStyleSessionChange}
        onPrepareInferencePlan={onInferenceSessionChange}
        onOpenInference={() => onOpenPanel?.('inference')}
      />
    ),
    export: (
      <ExportCenterPanel
        projectId={projectId}
        episodeId={episodeId}
        storyboardContext={storyboardContext}
        session={workflowSessions.export}
        onSessionChange={onExportSessionChange}
      />
    ),
    assistant: (
      <WorkflowRecipesPanel
        workflowSessions={workflowSessions}
        session={workflowSessions.assistant}
        storyboardContext={storyboardContext}
        onAssistantSessionChange={onAssistantSessionChange}
        onScriptSessionChange={onScriptSessionChange}
        onAssetSessionChange={onAssetSessionChange}
        onInferenceSessionChange={onInferenceSessionChange}
        onExportSessionChange={onExportSessionChange}
        onOpenPanel={(nextPanelId) => onOpenPanel?.(nextPanelId)}
      />
    ),
  };

  return (
    <Drawer
      title={title}
      placement="right"
      open={open}
      onClose={onClose}
      width="clamp(360px, 32vw, 520px)"
      mask={false}
      forceRender
      styles={{
        header: { background: '#18181b', borderBottom: '1px solid #27272a', color: '#fff' },
        body: { background: '#09090b', padding: 0, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
      }}
    >
      {descriptor && (
        <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/80 flex flex-wrap items-center gap-2 text-xs shrink-0">
          <Tag className="m-0 border-zinc-700 bg-zinc-900 text-zinc-300">步骤 {descriptor.stepText}</Tag>
          {descriptor.draftText && (
            <Tag className="m-0 border-sky-800 bg-sky-950/30 text-sky-200">{descriptor.draftText}</Tag>
          )}
          {descriptor.scopeText && (
            <Tag className="m-0 border-purple-800 bg-purple-950/30 text-purple-200">{descriptor.scopeText}</Tag>
          )}
          {descriptor.lastAppliedText && (
            <Tag className="m-0 border-emerald-800 bg-emerald-950/30 text-emerald-200">{descriptor.lastAppliedText}</Tag>
          )}
        </div>
      )}
      {(Object.entries(panels) as Array<[WorkflowPanelId, React.ReactNode]>).map(([id, content]) => (
        <div key={id} className={panelId === id ? 'flex-1 min-h-0' : 'hidden'}>
          {content}
        </div>
      ))}
    </Drawer>
  );
};
