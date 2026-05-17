import { useEffect } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import {
  createLinghuiWorkspace,
  listLinghuiWorkspaces,
  loadLinghuiWorkspace,
} from '../../../../store/linghuiStorage';
import type {
  LinghuiWorkspaceDocument,
  LinghuiWorkspaceMeta,
} from '../../../../types/linghui';
import { DEFAULT_LINGHUI_WORKSPACE_NAME } from '../../../../types/linghui';

export function useLinghuiPageBootstrap(params: {
  activateWorkspace: (workspace: LinghuiWorkspaceDocument) => void;
  message: MessageInstance;
  onCleanup: () => void;
  saveTimerRef: React.MutableRefObject<number | null>;
  setLoading: (loading: boolean) => void;
  setWorkspaceList: (items: LinghuiWorkspaceMeta[]) => void;
}): void {
  const {
    activateWorkspace,
    message,
    onCleanup,
    saveTimerRef,
    setLoading,
    setWorkspaceList,
  } = params;

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const items = await listLinghuiWorkspaces();
        if (!mounted) return;

        setWorkspaceList(items);

        if (!items.length) {
          const workspace = await createLinghuiWorkspace(DEFAULT_LINGHUI_WORKSPACE_NAME);
          if (!mounted) return;
          setWorkspaceList([workspace]);
          activateWorkspace(workspace);
        } else {
          const latest = await loadLinghuiWorkspace(items[0].id);
          if (!mounted || !latest) return;
          activateWorkspace(latest);
        }
      } catch (error: any) {
        message.error(error?.message || '初始化灵绘工作区失败');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      mounted = false;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      onCleanup();
    };
  }, [activateWorkspace, message, onCleanup, saveTimerRef, setLoading, setWorkspaceList]);
}
