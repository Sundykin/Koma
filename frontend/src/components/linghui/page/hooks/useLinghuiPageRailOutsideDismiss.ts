import { useEffect, type RefObject } from 'react';

interface LinghuiPageRailOutsideDismissParams {
  executionLogPanelOpen: boolean;
  projectPanelOpen: boolean;
  railShellRef: RefObject<HTMLDivElement | null>;
  onSetExecutionLogPanelOpen: (open: boolean) => void;
  onSetProjectPanelOpen: (open: boolean) => void;
}

export function useLinghuiPageRailOutsideDismiss({
  executionLogPanelOpen,
  projectPanelOpen,
  railShellRef,
  onSetExecutionLogPanelOpen,
  onSetProjectPanelOpen,
}: LinghuiPageRailOutsideDismissParams): void {
  useEffect(() => {
    if (!projectPanelOpen && !executionLogPanelOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (railShellRef.current && target instanceof Node && railShellRef.current.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest('.ant-modal-root, .ant-modal, .ant-popover, .ant-dropdown')) {
        return;
      }
      onSetProjectPanelOpen(false);
      onSetExecutionLogPanelOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [
    executionLogPanelOpen,
    onSetExecutionLogPanelOpen,
    onSetProjectPanelOpen,
    projectPanelOpen,
    railShellRef,
  ]);
}
