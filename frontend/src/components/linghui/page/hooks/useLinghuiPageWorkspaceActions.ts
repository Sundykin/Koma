import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import {
  createLinghuiWorkspace,
  deleteLinghuiWorkspace,
  exportLinghuiWorkspace,
  importLinghuiWorkspace,
  listLinghuiWorkspaces,
  loadLinghuiWorkspace,
} from '../../../../store/linghuiStorage';
import { electronService } from '../../../../services/electronService';
import {
  DEFAULT_LINGHUI_WORKSPACE_NAME,
  type LinghuiWorkspaceDocument,
  type LinghuiWorkspaceMeta,
} from '../../../../types/linghui';

interface ConfirmModalApi {
  confirm: (config: {
    title: string;
    content: string;
    okText: string;
    okType: 'danger';
    cancelText: string;
    onOk: () => Promise<void>;
  }) => void;
}

interface UseLinghuiPageWorkspaceActionsParams {
  activeWorkspace: LinghuiWorkspaceDocument | null;
  activeWorkspaceRef: React.MutableRefObject<LinghuiWorkspaceDocument | null>;
  activateWorkspace: (workspace: LinghuiWorkspaceDocument) => void;
  closeActiveDrawer: () => void;
  flushWorkspaceSave: (options?: {
    notify?: boolean;
    syncActiveWorkspace?: boolean;
    refreshWorkspaceList?: boolean;
    showIndicator?: boolean;
  }) => Promise<boolean>;
  message: MessageInstance;
  modal: ConfirmModalApi;
  refreshWorkspaceList: (preferredId?: string) => Promise<void>;
  scheduleWorkspaceSave: (
    doc: LinghuiWorkspaceDocument,
    options?: {
      syncActiveWorkspace?: boolean;
      refreshWorkspaceList?: boolean;
    },
  ) => void;
  setExecutionLogPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setProjectPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setWorkspaceList: React.Dispatch<React.SetStateAction<LinghuiWorkspaceMeta[]>>;
  workspaceList: LinghuiWorkspaceMeta[];
}

export function useLinghuiPageWorkspaceActions({
  activeWorkspace,
  activeWorkspaceRef,
  activateWorkspace,
  closeActiveDrawer,
  flushWorkspaceSave,
  message,
  modal,
  refreshWorkspaceList,
  scheduleWorkspaceSave,
  setExecutionLogPanelOpen,
  setProjectPanelOpen,
  setWorkspaceList,
  workspaceList,
}: UseLinghuiPageWorkspaceActionsParams) {
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState(DEFAULT_LINGHUI_WORKSPACE_NAME);

  useEffect(() => {
    setWorkspaceNameDraft(activeWorkspace?.name ?? DEFAULT_LINGHUI_WORKSPACE_NAME);
  }, [activeWorkspace?.id, activeWorkspace?.name]);

  const handleManualSave = useCallback(async () => {
    const success = await flushWorkspaceSave({
      notify: true,
      syncActiveWorkspace: true,
      refreshWorkspaceList: true,
      showIndicator: true,
    });
    if (success) {
      setProjectPanelOpen(false);
    }
  }, [flushWorkspaceSave, setProjectPanelOpen]);

  const handleExportWorkspace = useCallback(async (workspaceId?: string) => {
    const current = activeWorkspaceRef.current;
    const targetWorkspaceId = workspaceId || current?.id;
    if (!targetWorkspaceId) {
      message.info('请先打开一个灵绘项目');
      return;
    }

    const shouldFlushActive = targetWorkspaceId === current?.id;
    if (shouldFlushActive) {
      const flushed = await flushWorkspaceSave({
        syncActiveWorkspace: true,
        refreshWorkspaceList: true,
        showIndicator: true,
      });
      if (!flushed) {
        return;
      }
    }

    try {
      const workspace = shouldFlushActive && activeWorkspaceRef.current
        ? activeWorkspaceRef.current
        : await loadLinghuiWorkspace(targetWorkspaceId);
      if (!workspace) {
        message.error('无法读取要导出的灵绘项目');
        return;
      }
      const exportPath = await exportLinghuiWorkspace(workspace);
      if (exportPath) {
        message.success('灵绘项目已导出');
      }
    } catch (error: any) {
      message.error(error?.message || '导出灵绘项目失败');
    }
  }, [activeWorkspaceRef, flushWorkspaceSave, message]);

  const handleImportWorkspace = useCallback(async () => {
    try {
      const result = await electronService.dialog.openFile({
        title: '导入灵绘项目',
        filters: [
          { name: 'Linghui Workspace Package', extensions: ['zip'] },
          { name: 'Linghui JSON', extensions: ['json'] },
        ],
      });
      const filePath = result.filePaths?.[0];
      if (result.canceled || !filePath) {
        return;
      }

      const flushed = await flushWorkspaceSave({
        syncActiveWorkspace: true,
        refreshWorkspaceList: true,
        showIndicator: true,
      });
      if (!flushed) {
        return;
      }

      const imported = await importLinghuiWorkspace(filePath);
      activateWorkspace(imported);
      await refreshWorkspaceList(imported.id);
      closeActiveDrawer();
      setExecutionLogPanelOpen(false);
      setProjectPanelOpen(true);
      message.success('灵绘项目已导入');
    } catch (error: any) {
      message.error(error?.message || '导入灵绘项目失败');
    }
  }, [
    activateWorkspace,
    closeActiveDrawer,
    flushWorkspaceSave,
    message,
    refreshWorkspaceList,
    setExecutionLogPanelOpen,
    setProjectPanelOpen,
  ]);

  const handleDeleteWorkspace = useCallback((workspaceId: string) => {
    const workspace = workspaceList.find(item => item.id === workspaceId);
    if (!workspace) {
      message.error('无法找到要删除的灵绘项目');
      return;
    }

    modal.confirm({
      title: '删除灵绘项目',
      content: `确定删除「${workspace.name}」吗？画布、资产、历史结果和本地静态资源都会一起删除。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      async onOk() {
        await deleteLinghuiWorkspace(workspaceId);
        const nextList = await listLinghuiWorkspaces();
        if (nextList.length === 0) {
          const created = await createLinghuiWorkspace(DEFAULT_LINGHUI_WORKSPACE_NAME);
          activateWorkspace(created);
          setWorkspaceList([created]);
          setProjectPanelOpen(true);
          message.success('已删除灵绘项目，并创建了新的空项目');
          return;
        }

        setWorkspaceList(nextList);
        if (activeWorkspaceRef.current?.id === workspaceId) {
          const nextWorkspace = await loadLinghuiWorkspace(nextList[0].id);
          if (nextWorkspace) {
            activateWorkspace(nextWorkspace);
          }
        }
        setProjectPanelOpen(true);
        message.success('已删除灵绘项目');
      },
    });
  }, [activeWorkspaceRef, activateWorkspace, message, modal, setProjectPanelOpen, setWorkspaceList, workspaceList]);

  const handleCreateWorkspace = useCallback(async () => {
    const flushed = await flushWorkspaceSave({
      syncActiveWorkspace: true,
      refreshWorkspaceList: true,
      showIndicator: true,
    });
    if (!flushed) {
      return;
    }

    try {
      const workspace = await createLinghuiWorkspace(DEFAULT_LINGHUI_WORKSPACE_NAME);
      activateWorkspace(workspace);
      await refreshWorkspaceList(workspace.id);
      closeActiveDrawer();
      setExecutionLogPanelOpen(false);
      setProjectPanelOpen(true);
      message.success('已创建新的灵绘项目');
      window.setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 0);
    } catch (error: any) {
      message.error(error?.message || '创建新的灵绘项目失败');
    }
  }, [
    activateWorkspace,
    closeActiveDrawer,
    flushWorkspaceSave,
    message,
    refreshWorkspaceList,
    setExecutionLogPanelOpen,
    setProjectPanelOpen,
  ]);

  const handleSelectWorkspace = useCallback(async (workspaceId: string) => {
    if (!workspaceId || workspaceId === activeWorkspaceRef.current?.id) {
      setProjectPanelOpen(false);
      return;
    }

    const flushed = await flushWorkspaceSave({
      syncActiveWorkspace: false,
      refreshWorkspaceList: false,
      showIndicator: true,
    });
    if (!flushed) {
      return;
    }

    const workspace = await loadLinghuiWorkspace(workspaceId);
    if (!workspace) {
      message.error('无法加载所选灵绘项目');
      return;
    }

    activateWorkspace(workspace);
    setProjectPanelOpen(false);
  }, [activeWorkspaceRef, activateWorkspace, flushWorkspaceSave, message, setProjectPanelOpen]);

  const commitWorkspaceRename = useCallback((nextName?: string) => {
    const current = activeWorkspaceRef.current;
    if (!current) {
      return;
    }

    const normalizedName = (nextName ?? workspaceNameDraft).trim() || DEFAULT_LINGHUI_WORKSPACE_NAME;
    setWorkspaceNameDraft(normalizedName);

    if (current.name === normalizedName) {
      return;
    }

    scheduleWorkspaceSave({
      ...current,
      name: normalizedName,
    }, {
      syncActiveWorkspace: true,
      refreshWorkspaceList: true,
    });
  }, [activeWorkspaceRef, scheduleWorkspaceSave, workspaceNameDraft]);

  return {
    commitWorkspaceRename,
    handleCreateWorkspace,
    handleDeleteWorkspace,
    handleExportWorkspace,
    handleImportWorkspace,
    handleManualSave,
    handleSelectWorkspace,
    renameInputRef,
    setWorkspaceNameDraft,
    workspaceNameDraft,
  };
}
