import { useEffect, useMemo, type RefObject } from 'react';
import type { LinghuiDirector3DRenderMode } from '../../../../types/linghui';

interface Director3DKeyboardShortcutsParams {
  panelRootRef: RefObject<HTMLDivElement | null>;
  renderModeLabels: Record<LinghuiDirector3DRenderMode, string>;
  onSetImmersive: (updater: (prev: boolean) => boolean) => void;
  onSetPreviewMode: (mode: 'preview' | 'lineart' | 'silhouette') => void;
  onSetRenderModeForExport: (mode: LinghuiDirector3DRenderMode) => void;
}

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function useDirector3DKeyboardShortcuts({
  panelRootRef,
  renderModeLabels,
  onSetImmersive,
  onSetPreviewMode,
  onSetRenderModeForExport,
}: Director3DKeyboardShortcutsParams): void {
  const renderModeKeys = useMemo<LinghuiDirector3DRenderMode[]>(
    () => Object.keys(renderModeLabels) as LinghuiDirector3DRenderMode[],
    [renderModeLabels],
  );

  useEffect(() => {
    const root = panelRootRef.current;
    if (!root) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      // 文本输入态：放行键盘事件给输入框自身，但仍 stopPropagation 阻止冒泡到画布
      if (!isTextInput(event.target)) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          onSetImmersive(prev => !prev);
        } else if (/^[1-9]$/.test(event.key)) {
          const idx = Number(event.key) - 1;
          const mode = renderModeKeys[idx];
          if (mode) {
            event.preventDefault();
            onSetRenderModeForExport(mode);
            onSetPreviewMode(mode === 'silhouette' ? 'silhouette' : mode === 'lineart' ? 'lineart' : 'preview');
          }
        }
      }
      event.stopPropagation();
    };
    const blockBubble = (event: KeyboardEvent) => {
      event.stopPropagation();
    };

    // bubble 阶段：先让 antd 子控件处理，再阻止冒泡到 ReactFlow / 画布快捷键。
    root.addEventListener('keydown', onKeyDown, false);
    root.addEventListener('keyup', blockBubble, false);
    root.addEventListener('keypress', blockBubble, false);
    return () => {
      root.removeEventListener('keydown', onKeyDown, false);
      root.removeEventListener('keyup', blockBubble, false);
      root.removeEventListener('keypress', blockBubble, false);
    };
  }, [
    onSetImmersive,
    onSetPreviewMode,
    onSetRenderModeForExport,
    panelRootRef,
    renderModeKeys,
  ]);
}
