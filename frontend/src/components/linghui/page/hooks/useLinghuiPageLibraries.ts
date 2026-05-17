import { useCallback, useEffect, useState } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { RefObject } from 'react';
import {
  listLinghuiWorkflowTemplates,
  listLinghuiWorkspaceAssets,
  listLinghuiWorkspaceHistoryRecords,
  type LinghuiWorkflowTemplateRecord,
  type LinghuiWorkspaceAssetRecord,
  type LinghuiWorkspaceHistoryRecord,
} from '../../../../store/linghuiStorage';
import type { LinghuiCanvasHandle } from '../../canvas/components/LinghuiCanvas';
import type { LinghuiAssetFilter, LinghuiLibraryDrawerKey } from '../../library/components/LinghuiLibraryDrawer';

interface UseLinghuiPageLibrariesParams {
  activeDrawer: LinghuiLibraryDrawerKey | null;
  activeWorkspaceId?: string | null;
  canvasRef: RefObject<LinghuiCanvasHandle | null>;
  message: MessageInstance;
}

export function useLinghuiPageLibraries({
  activeDrawer,
  activeWorkspaceId,
  canvasRef,
  message,
}: UseLinghuiPageLibrariesParams) {
  const [assetFilter, setAssetFilter] = useState<LinghuiAssetFilter>('all');
  const [assetLoading, setAssetLoading] = useState(false);
  const [workspaceAssets, setWorkspaceAssets] = useState<LinghuiWorkspaceAssetRecord[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowTemplates, setWorkflowTemplates] = useState<LinghuiWorkflowTemplateRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [workspaceHistory, setWorkspaceHistory] = useState<LinghuiWorkspaceHistoryRecord[]>([]);

  const loadAssetLibrary = useCallback(async (workspaceId: string | null | undefined) => {
    if (!workspaceId) {
      setWorkspaceAssets([]);
      return;
    }

    setAssetLoading(true);
    try {
      const assets = await listLinghuiWorkspaceAssets(workspaceId);
      setWorkspaceAssets(assets);
    } catch (error: any) {
      message.error(error?.message || '读取灵绘资产库失败');
    } finally {
      setAssetLoading(false);
    }
  }, [message]);

  const loadWorkflowLibrary = useCallback(async (workspaceId: string | null | undefined) => {
    if (!workspaceId) {
      setWorkflowTemplates([]);
      return;
    }

    setWorkflowLoading(true);
    try {
      const items = await listLinghuiWorkflowTemplates(workspaceId);
      setWorkflowTemplates(items);
    } catch (error: any) {
      message.error(error?.message || '读取灵绘工作流模板失败');
    } finally {
      setWorkflowLoading(false);
    }
  }, [message]);

  const loadHistoryLibrary = useCallback(async (workspaceId: string | null | undefined) => {
    if (!workspaceId) {
      setWorkspaceHistory([]);
      return;
    }

    setHistoryLoading(true);
    try {
      const items = await listLinghuiWorkspaceHistoryRecords(workspaceId);
      setWorkspaceHistory(items);
    } catch (error: any) {
      message.error(error?.message || '读取灵绘历史结果失败');
    } finally {
      setHistoryLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (activeDrawer !== 'asset') return;
    void loadAssetLibrary(activeWorkspaceId ?? null);
  }, [activeDrawer, activeWorkspaceId, loadAssetLibrary]);

  useEffect(() => {
    if (activeDrawer !== 'workflow') return;
    void loadWorkflowLibrary(activeWorkspaceId ?? null);
  }, [activeDrawer, activeWorkspaceId, loadWorkflowLibrary]);

  useEffect(() => {
    if (activeDrawer !== 'history') return;
    void loadHistoryLibrary(activeWorkspaceId ?? null);
  }, [activeDrawer, activeWorkspaceId, loadHistoryLibrary]);

  const handleAssetLibraryMutate = useCallback(() => {
    void loadAssetLibrary(activeWorkspaceId ?? null);
  }, [activeWorkspaceId, loadAssetLibrary]);

  const handleWorkflowTemplateMutate = useCallback(() => {
    void loadWorkflowLibrary(activeWorkspaceId ?? null);
  }, [activeWorkspaceId, loadWorkflowLibrary]);

  const handleHistoryLibraryMutate = useCallback(() => {
    void loadHistoryLibrary(activeWorkspaceId ?? null);
  }, [activeWorkspaceId, loadHistoryLibrary]);

  const handleSendAssetToCanvas = useCallback((asset: LinghuiWorkspaceAssetRecord) => {
    canvasRef.current?.addWorkspaceAsset(asset);
    message.success(`已将 ${asset.name} 发送到画布`);
  }, [canvasRef, message]);

  const handleSendWorkflowToCanvas = useCallback((template: LinghuiWorkflowTemplateRecord) => {
    canvasRef.current?.addWorkflowTemplate(template);
    message.success(`已将工作流 ${template.name} 发送到画布`);
  }, [canvasRef, message]);

  const handleSendHistoryToCanvas = useCallback((record: LinghuiWorkspaceHistoryRecord) => {
    canvasRef.current?.addWorkspaceAsset(record);
    message.success(`已将历史结果 ${record.name} 发送到画布`);
  }, [canvasRef, message]);

  return {
    assetFilter,
    assetLoading,
    historyLoading,
    loadAssetLibrary,
    loadHistoryLibrary,
    loadWorkflowLibrary,
    setAssetFilter,
    workspaceAssets,
    workspaceHistory,
    workflowLoading,
    workflowTemplates,
    handleAssetLibraryMutate,
    handleHistoryLibraryMutate,
    handleSendAssetToCanvas,
    handleSendHistoryToCanvas,
    handleSendWorkflowToCanvas,
    handleWorkflowTemplateMutate,
  };
}
