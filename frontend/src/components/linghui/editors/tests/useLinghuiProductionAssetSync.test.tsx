import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLinghuiProductionAssetSync } from '../hooks/useLinghuiProductionAssetSync';

const { syncProductionAssetsMock } = vi.hoisted(() => ({
  syncProductionAssetsMock: vi.fn(),
}));

vi.mock('../../../../store/linghuiStorage', () => ({
  syncLinghuiProductionAssets: syncProductionAssetsMock,
}));

describe('useLinghuiProductionAssetSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncProductionAssetsMock.mockReset();
    syncProductionAssetsMock.mockResolvedValue({ records: [], removedIds: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('防抖同步当前生产资产并通知资产抽屉刷新', async () => {
    const onAssetLibraryMutate = vi.fn();
    const { result } = renderHook(() => useLinghuiProductionAssetSync({
      workspaceId: 'workspace-1',
      nodeId: 'script-1',
      nodeType: 'linghui/script',
      assets: [{
        id: 'character-1',
        kind: 'character',
        name: '林夏',
        description: '青年侦探',
        sourceShotIds: ['shot-1'],
        confirmed: true,
      }],
      onAssetLibraryMutate,
    }));

    await act(async () => {
      vi.advanceTimersByTime(350);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncProductionAssetsMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-1',
      nodeId: 'script-1',
      nodeType: 'linghui/script',
    }));
    expect(result.current.status).toBe('synced');
    expect(onAssetLibraryMutate).toHaveBeenCalledTimes(1);
  });
});
