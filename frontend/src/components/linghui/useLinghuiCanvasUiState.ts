import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LinghuiCanvasMode,
  LinghuiCanvasSelection,
  LinghuiGridType,
  LinghuiNodeToolState,
} from '../../types/linghui';
import type { LinghuiPendingGroupFrame } from './linghuiCanvasShared';

export function useLinghuiCanvasUiState({
}: Record<string, never> = {}) {
  const [, setSelection] = useState<LinghuiCanvasSelection>(null);
  const [editorSelection, setEditorSelection] = useState<LinghuiCanvasSelection>(null);
  const [activeNodeToolState, setActiveNodeToolState] = useState<LinghuiNodeToolState>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const [canvasMode, setCanvasMode] = useState<LinghuiCanvasMode>('mouse');
  const [pendingGroupFrame, setPendingGroupFrame] = useState<LinghuiPendingGroupFrame | null>(null);
  const [gridSplitType, setGridSplitType] = useState<LinghuiGridType>('2x2');
  const [gridSplitSelectedCells, setGridSplitSelectedCells] = useState<number[]>([]);
  const [gridSplitUpscaleFactor, setGridSplitUpscaleFactor] = useState<2 | 4>(2);
  const previousGridSplitToolRef = useRef<LinghuiNodeToolState>(null);

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
    if (!activeNodeToolState) return;
    if (editorSelection?.kind !== 'node' || editorSelection.nodeId !== activeNodeToolState.nodeId) {
      setActiveNodeTool(null);
    }
  }, [activeNodeToolState, editorSelection]);

  const setActiveNodeTool = useCallback((tool: LinghuiNodeToolState) => {
    setActiveNodeToolState(current => {
      const enteringGridSplit = tool?.kind === 'image' && tool.tool === 'grid-split';
      const alreadyInGridSplit = current?.kind === 'image' && current.tool === 'grid-split';
      if (enteringGridSplit && !alreadyInGridSplit) {
        previousGridSplitToolRef.current = current;
      }
      return tool;
    });
  }, []);

  const revertGridSplitTool = useCallback(() => {
    setGridSplitSelectedCells([]);
    setActiveNodeToolState(previousGridSplitToolRef.current ?? null);
  }, []);

  const toggleGridSplitCell = useCallback((index: number) => {
    setGridSplitSelectedCells(current => (
      current.includes(index)
        ? current.filter(item => item !== index)
        : [...current, index].sort((a, b) => a - b)
    ));
  }, []);

  useEffect(() => {
    if (!activeNodeToolState || activeNodeToolState.kind !== 'image' || activeNodeToolState.tool !== 'grid-split') {
      setGridSplitSelectedCells([]);
    }
  }, [activeNodeToolState]);

  const resetLocalCanvasUiState = useCallback(() => {
    setSelection(null);
    setEditorSelection(null);
    setActiveNodeToolState(null);
    setPendingGroupFrame(null);
    setGridSplitSelectedCells([]);
    setGridSplitUpscaleFactor(2);
  }, []);

  return {
    setSelection,
    editorSelection,
    setEditorSelection,
    activeNodeTool: activeNodeToolState,
    setActiveNodeTool,
    revertGridSplitTool,
    hostRef,
    canvasRect,
    setCanvasRect,
    canvasMode,
    setCanvasMode,
    pendingGroupFrame,
    setPendingGroupFrame,
    gridSplitType,
    setGridSplitType,
    gridSplitSelectedCells,
    setGridSplitSelectedCells,
    gridSplitUpscaleFactor,
    setGridSplitUpscaleFactor,
    toggleGridSplitCell,
    resetLocalCanvasUiState,
  };
}
