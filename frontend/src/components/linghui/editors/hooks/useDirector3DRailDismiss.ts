import { useEffect } from 'react';
import type { Director3DAssetTab } from '../components/Director3DAssetLibraryPanel';

interface Director3DRailDismissParams {
  openLeftRailTab: Director3DAssetTab | null;
  rightRailOpen: boolean;
  onSetOpenLeftRailTab: (tab: Director3DAssetTab | null) => void;
  onSetRightRailOpen: (open: boolean) => void;
}

function isInsideRailZone(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('.linghuiDirector3DRail')
    || target.closest('.linghuiDirector3DRailPopover')
    || target.closest('.linghuiDirector3DBattalionPopover')
    || target.closest('.ant-popover')
    || target.closest('.ant-select-dropdown')
    || target.closest('.ant-picker-dropdown')
    || target.closest('.ant-color-picker-dropdown')
    || target.closest('.ant-dropdown')
    || target.closest('.ant-slider-tooltip'),
  );
}

export function useDirector3DRailDismiss({
  openLeftRailTab,
  rightRailOpen,
  onSetOpenLeftRailTab,
  onSetRightRailOpen,
}: Director3DRailDismissParams): void {
  useEffect(() => {
    if (openLeftRailTab === null && !rightRailOpen) return undefined;
    const closeAll = () => {
      onSetOpenLeftRailTab(null);
      onSetRightRailOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (isInsideRailZone(e.target)) return;
      closeAll();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onSetOpenLeftRailTab, onSetRightRailOpen, openLeftRailTab, rightRailOpen]);
}
