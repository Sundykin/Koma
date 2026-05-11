/**
 * UpdateButton — 标题栏右侧的极简更新按钮。
 *
 * 四种渲染：
 *   - 无更新     → 不渲染任何元素
 *   - 有更新     → "更新到 vX.Y.Z" 点击 = 下载
 *   - 下载中     → "更新中… 47%" 不可点
 *   - 已下载     → "重启以更新" 点击 = quitAndInstall（长任务时由 main 静默忽略）
 *
 * 没有红点、没有 banner、没有模态、没有 changelog 展开。用户全部交互只有"点一下"。
 */
import React, { useCallback } from 'react';
import { useUpdater } from '../../hooks/useUpdater';
import { useUpdaterStore } from '../../store/updater/updaterStore';

export const UpdateButton: React.FC = () => {
  const { state, isAvailable } = useUpdater();
  const download = useUpdaterStore((s) => s.download);
  const installNow = useUpdaterStore((s) => s.installNow);

  const handleClick = useCallback(() => {
    if (!state) return;
    if (state.kind === 'downloaded') {
      void installNow();
      return;
    }
    if (state.kind === 'idle' && state.availableVersion) {
      void download();
    }
  }, [state, download, installNow]);

  if (!isAvailable || !state) return null;

  // 仅在 idle+有可用版本 / downloading / downloaded 时可见
  if (state.kind === 'idle' && !state.availableVersion) return null;
  if (state.kind === 'checking' || state.kind === 'failed') return null;

  let label = '';
  let clickable = false;
  if (state.kind === 'idle' && state.availableVersion) {
    label = `更新到 v${state.availableVersion}`;
    clickable = true;
  } else if (state.kind === 'downloading') {
    const pct = Math.round((state.downloadProgress ?? 0) * 100);
    label = `更新中… ${pct}%`;
  } else if (state.kind === 'downloaded') {
    label = '重启以更新';
    clickable = true;
  }

  return (
    <button
      onClick={clickable ? handleClick : undefined}
      disabled={!clickable}
      className={`no-drag h-full px-3 flex items-center text-xs transition-colors ${
        clickable
          ? 'text-accent hover:bg-bg-hover cursor-pointer'
          : 'text-text-secondary cursor-default'
      }`}
      title={label}
    >
      {label}
    </button>
  );
};
