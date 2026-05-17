import { useMemo, type RefObject } from 'react';
import type { LinghuiExecutionLogEntry, LinghuiWorkspaceMeta } from '../../../../types/linghui';
import type { LinghuiLibraryDrawerKey } from '../../library/components/LinghuiLibraryDrawer';
import { LinghuiCanvasFloatingRail } from '../components/LinghuiCanvasFloatingRail';

interface LinghuiPageFloatingRailParams {
  activeDrawer: LinghuiLibraryDrawerKey | null;
  activeWorkspaceId?: string;
  activeWorkspaceName?: string;
  executionLogCollapsed: boolean;
  executionLogErrorCount: number;
  executionLogItems: LinghuiExecutionLogEntry[];
  executionLogLatest?: LinghuiExecutionLogEntry | null;
  executionLogPanelOpen: boolean;
  lastSavedAt: number | null;
  onCloseActiveDrawer: () => void;
  onCommitWorkspaceRename: () => void;
  onCreateWorkspace: () => void;
  onDeleteWorkspace: (id: string) => void;
  onExit?: () => void;
  onExportWorkspace: () => void;
  onFocusLogNode: (nodeId: string) => void;
  onImportWorkspace: () => void;
  onManualSave: () => void;
  onSelectWorkspace: (id: string) => void;
  onSetExecutionLogCollapsed: (collapsed: boolean) => void;
  onSetExecutionLogPanelOpen: (open: boolean) => void;
  onSetProjectPanelOpen: (open: boolean) => void;
  onSetWorkspaceNameDraft: (value: string) => void;
  onToggleDrawer: (drawer: LinghuiLibraryDrawerKey) => void;
  projectPanelOpen: boolean;
  railShellRef: RefObject<HTMLDivElement | null>;
  renameInputRef: RefObject<HTMLInputElement | null>;
  saving: boolean;
  workspaceList: LinghuiWorkspaceMeta[];
  workspaceLogCount: number;
  workspaceNameDraft: string;
}

export function useLinghuiPageFloatingRail({
  activeDrawer,
  activeWorkspaceId,
  activeWorkspaceName,
  executionLogCollapsed,
  executionLogErrorCount,
  executionLogItems,
  executionLogLatest,
  executionLogPanelOpen,
  lastSavedAt,
  onCloseActiveDrawer,
  onCommitWorkspaceRename,
  onCreateWorkspace,
  onDeleteWorkspace,
  onExit,
  onExportWorkspace,
  onFocusLogNode,
  onImportWorkspace,
  onManualSave,
  onSelectWorkspace,
  onSetExecutionLogCollapsed,
  onSetExecutionLogPanelOpen,
  onSetProjectPanelOpen,
  onSetWorkspaceNameDraft,
  onToggleDrawer,
  projectPanelOpen,
  railShellRef,
  renameInputRef,
  saving,
  workspaceList,
  workspaceLogCount,
  workspaceNameDraft,
}: LinghuiPageFloatingRailParams) {
  return useMemo(() => (
    <LinghuiCanvasFloatingRail
      railShellRef={railShellRef}
      renameInputRef={renameInputRef}
      activeDrawer={activeDrawer}
      activeWorkspaceId={activeWorkspaceId}
      activeWorkspaceName={activeWorkspaceName}
      executionLogCollapsed={executionLogCollapsed}
      executionLogErrorCount={executionLogErrorCount}
      executionLogItems={executionLogItems}
      executionLogLatest={executionLogLatest}
      executionLogPanelOpen={executionLogPanelOpen}
      lastSavedAt={lastSavedAt}
      projectPanelOpen={projectPanelOpen}
      saving={saving}
      workspaceLogCount={workspaceLogCount}
      workspaceList={workspaceList}
      workspaceNameDraft={workspaceNameDraft}
      onCloseActiveDrawer={onCloseActiveDrawer}
      onCommitWorkspaceRename={onCommitWorkspaceRename}
      onCreateWorkspace={onCreateWorkspace}
      onDeleteWorkspace={onDeleteWorkspace}
      onExit={onExit}
      onExportWorkspace={onExportWorkspace}
      onFocusLogNode={onFocusLogNode}
      onImportWorkspace={onImportWorkspace}
      onManualSave={onManualSave}
      onSelectWorkspace={onSelectWorkspace}
      onSetExecutionLogCollapsed={onSetExecutionLogCollapsed}
      onSetExecutionLogPanelOpen={onSetExecutionLogPanelOpen}
      onSetProjectPanelOpen={onSetProjectPanelOpen}
      onSetWorkspaceNameDraft={onSetWorkspaceNameDraft}
      onToggleDrawer={onToggleDrawer}
    />
  ), [
    activeDrawer,
    activeWorkspaceId,
    activeWorkspaceName,
    executionLogCollapsed,
    executionLogErrorCount,
    executionLogItems,
    executionLogLatest,
    executionLogPanelOpen,
    lastSavedAt,
    onCloseActiveDrawer,
    onCommitWorkspaceRename,
    onCreateWorkspace,
    onDeleteWorkspace,
    onExit,
    onExportWorkspace,
    onFocusLogNode,
    onImportWorkspace,
    onManualSave,
    onSelectWorkspace,
    onSetExecutionLogCollapsed,
    onSetExecutionLogPanelOpen,
    onSetProjectPanelOpen,
    onSetWorkspaceNameDraft,
    onToggleDrawer,
    projectPanelOpen,
    railShellRef,
    renameInputRef,
    saving,
    workspaceList,
    workspaceLogCount,
    workspaceNameDraft,
  ]);
}
