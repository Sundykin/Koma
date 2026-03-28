import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LinghuiCanvasMode,
  LinghuiCanvasSelection,
  LinghuiNodeToolState,
} from '../../types/linghui';
import type { LinghuiPendingGroupFrame } from './linghuiCanvasShared';

export function useLinghuiCanvasUiState({
}: Record<string, never> = {}) {
  const [, setSelection] = useState<LinghuiCanvasSelection>(null);
  const [editorSelection, setEditorSelection] = useState<LinghuiCanvasSelection>(null);
  const [activeNodeTool, setActiveNodeTool] = useState<LinghuiNodeToolState>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const [canvasMode, setCanvasMode] = useState<LinghuiCanvasMode>('mouse');
  const [pendingGroupFrame, setPendingGroupFrame] = useState<LinghuiPendingGroupFrame | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const observer = new ResizeObserver(() => {
      if (hostRef.current) {
        setCanvasRect(hostRef.current.getBoundingClientRect());
      }
    });

    observer.observe(hostRef.current);
    setCanvasRect(hostRef.current.getBoundingClientRect());

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeNodeTool) return;
    if (editorSelection?.kind !== 'node' || editorSelection.nodeId !== activeNodeTool.nodeId) {
      setActiveNodeTool(null);
    }
  }, [activeNodeTool, editorSelection]);

  const resetLocalCanvasUiState = useCallback(() => {
    setSelection(null);
    setEditorSelection(null);
    setActiveNodeTool(null);
    setPendingGroupFrame(null);
  }, []);

  return {
    setSelection,
    editorSelection,
    setEditorSelection,
    activeNodeTool,
    setActiveNodeTool,
    hostRef,
    canvasRect,
    setCanvasRect,
    canvasMode,
    setCanvasMode,
    pendingGroupFrame,
    setPendingGroupFrame,
    resetLocalCanvasUiState,
  };
}
