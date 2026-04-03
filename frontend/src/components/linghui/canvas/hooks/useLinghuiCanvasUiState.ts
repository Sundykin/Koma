import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  LinghuiCanvasMode,
  LinghuiCanvasSelection,
  LinghuiGridType,
  LinghuiNodeToolState,
} from '../../../../types/linghui';
import type { LinghuiPendingGroupFrame } from '../state/linghuiCanvasShared';
import { useLinghuiCanvasStore } from '../state/linghuiCanvasStore';

function resolveSetterValue<T>(value: SetStateAction<T>, currentValue: T): T {
  return typeof value === 'function'
    ? (value as (previous: T) => T)(currentValue)
    : value;
}

export function useLinghuiCanvasUiState({
}: Record<string, never> = {}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorSelection = useLinghuiCanvasStore(state => state.editorSelection);
  const activeNodeTool = useLinghuiCanvasStore(state => state.activeNodeTool);
  const canvasRect = useLinghuiCanvasStore(state => state.canvasRect);
  const canvasMode = useLinghuiCanvasStore(state => state.canvasMode);
  const pendingGroupFrame = useLinghuiCanvasStore(state => state.pendingGroupFrame);
  const gridSplitType = useLinghuiCanvasStore(state => state.gridSplitType);
  const gridSplitSelectedCells = useLinghuiCanvasStore(state => state.gridSplitSelectedCells);
  const gridSplitUpscaleFactor = useLinghuiCanvasStore(state => state.gridSplitUpscaleFactor);

  const storeSetSelection = useLinghuiCanvasStore(state => state.setSelection);
  const storeSetEditorSelection = useLinghuiCanvasStore(state => state.setEditorSelection);
  const storeSetActiveNodeTool = useLinghuiCanvasStore(state => state.setActiveNodeTool);
  const storeSetCanvasRect = useLinghuiCanvasStore(state => state.setCanvasRect);
  const storeSetCanvasMode = useLinghuiCanvasStore(state => state.setCanvasMode);
  const storeSetPendingGroupFrame = useLinghuiCanvasStore(state => state.setPendingGroupFrame);
  const storeSetGridSplitType = useLinghuiCanvasStore(state => state.setGridSplitType);
  const storeSetGridSplitSelectedCells = useLinghuiCanvasStore(state => state.setGridSplitSelectedCells);
  const storeSetGridSplitUpscaleFactor = useLinghuiCanvasStore(state => state.setGridSplitUpscaleFactor);
  const toggleGridSplitCell = useLinghuiCanvasStore(state => state.toggleGridSplitCell);
  const revertGridSplitTool = useLinghuiCanvasStore(state => state.revertGridSplitTool);
  const resetCanvasUiState = useLinghuiCanvasStore(state => state.resetCanvasUiState);
  const resetCanvasSurfaceState = useLinghuiCanvasStore(state => state.resetCanvasSurfaceState);

  const setSelection = useCallback<Dispatch<SetStateAction<LinghuiCanvasSelection>>>((nextValue) => {
    const currentValue = useLinghuiCanvasStore.getState().selection;
    storeSetSelection(resolveSetterValue(nextValue, currentValue));
  }, [storeSetSelection]);

  const setEditorSelection = useCallback<Dispatch<SetStateAction<LinghuiCanvasSelection>>>((nextValue) => {
    const currentValue = useLinghuiCanvasStore.getState().editorSelection;
    storeSetEditorSelection(resolveSetterValue(nextValue, currentValue));
  }, [storeSetEditorSelection]);

  const setActiveNodeTool = useCallback<Dispatch<SetStateAction<LinghuiNodeToolState>>>((nextValue) => {
    const currentValue = useLinghuiCanvasStore.getState().activeNodeTool;
    storeSetActiveNodeTool(resolveSetterValue(nextValue, currentValue));
  }, [storeSetActiveNodeTool]);

  const setCanvasRect = useCallback<Dispatch<SetStateAction<DOMRect | null>>>((nextValue) => {
    const currentValue = useLinghuiCanvasStore.getState().canvasRect;
    storeSetCanvasRect(resolveSetterValue(nextValue, currentValue));
  }, [storeSetCanvasRect]);

  const setCanvasMode = useCallback<Dispatch<SetStateAction<LinghuiCanvasMode>>>((nextValue) => {
    const currentValue = useLinghuiCanvasStore.getState().canvasMode;
    storeSetCanvasMode(resolveSetterValue(nextValue, currentValue));
  }, [storeSetCanvasMode]);

  const setPendingGroupFrame = useCallback<Dispatch<SetStateAction<LinghuiPendingGroupFrame | null>>>((nextValue) => {
    const currentValue = useLinghuiCanvasStore.getState().pendingGroupFrame;
    storeSetPendingGroupFrame(resolveSetterValue(nextValue, currentValue));
  }, [storeSetPendingGroupFrame]);

  const setGridSplitType = useCallback<Dispatch<SetStateAction<LinghuiGridType>>>((nextValue) => {
    const currentValue = useLinghuiCanvasStore.getState().gridSplitType;
    storeSetGridSplitType(resolveSetterValue(nextValue, currentValue));
  }, [storeSetGridSplitType]);

  const setGridSplitSelectedCells = useCallback<Dispatch<SetStateAction<number[]>>>((nextValue) => {
    const currentValue = useLinghuiCanvasStore.getState().gridSplitSelectedCells;
    storeSetGridSplitSelectedCells(resolveSetterValue(nextValue, currentValue));
  }, [storeSetGridSplitSelectedCells]);

  const setGridSplitUpscaleFactor = useCallback<Dispatch<SetStateAction<2 | 4>>>((nextValue) => {
    const currentValue = useLinghuiCanvasStore.getState().gridSplitUpscaleFactor;
    storeSetGridSplitUpscaleFactor(resolveSetterValue(nextValue, currentValue));
  }, [storeSetGridSplitUpscaleFactor]);

  useEffect(() => {
    resetCanvasSurfaceState();
    const host = hostRef.current;
    if (!host) {
      return () => {
        resetCanvasSurfaceState();
      };
    }

    const observer = new ResizeObserver(() => {
      if (hostRef.current) {
        setCanvasRect(hostRef.current.getBoundingClientRect());
      }
    });

    observer.observe(host);
    setCanvasRect(host.getBoundingClientRect());

    return () => {
      observer.disconnect();
      resetCanvasSurfaceState();
    };
  }, [resetCanvasSurfaceState, setCanvasRect]);

  const resetLocalCanvasUiState = useCallback(() => {
    setSelection(null);
    resetCanvasUiState();
  }, [resetCanvasUiState, setSelection]);

  return {
    setSelection,
    editorSelection,
    setEditorSelection,
    activeNodeTool,
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
