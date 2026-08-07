import { useCallback, useEffect, useRef, useState } from 'react';
import { syncLinghuiProductionAssets } from '../../../../store/linghuiStorage';
import type {
  LinghuiNodeType,
  LinghuiProductionAsset,
} from '../../../../types/linghui';

export type LinghuiProductionAssetSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface UseLinghuiProductionAssetSyncParams {
  workspaceId?: string;
  nodeId: string;
  nodeType: LinghuiNodeType;
  assets: LinghuiProductionAsset[];
  onAssetLibraryMutate?: () => void;
}

export function useLinghuiProductionAssetSync({
  workspaceId,
  nodeId,
  nodeType,
  assets,
  onAssetLibraryMutate,
}: UseLinghuiProductionAssetSyncParams) {
  const [status, setStatus] = useState<LinghuiProductionAssetSyncStatus>('idle');
  const [error, setError] = useState('');
  const requestVersionRef = useRef(0);

  const syncNow = useCallback(async () => {
    if (!workspaceId) {
      setStatus('idle');
      setError('');
      return;
    }

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setStatus('syncing');
    setError('');

    try {
      await syncLinghuiProductionAssets({
        workspaceId,
        nodeId,
        nodeType,
        assets,
      });
      if (requestVersionRef.current !== requestVersion) return;
      setStatus('synced');
      onAssetLibraryMutate?.();
    } catch (syncError) {
      if (requestVersionRef.current !== requestVersion) return;
      setStatus('error');
      setError(syncError instanceof Error ? syncError.message : '项目资产同步失败');
    }
  }, [assets, nodeId, nodeType, onAssetLibraryMutate, workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      setStatus('idle');
      setError('');
      return;
    }
    const timer = window.setTimeout(() => {
      void syncNow();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [syncNow, workspaceId]);

  return {
    status,
    error,
    retry: syncNow,
  };
}
