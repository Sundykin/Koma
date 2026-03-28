import { useEffect, useRef } from 'react';
import type { LinghuiCanvasSelection } from '../../types/linghui';

type LinghuiCanvasDrawer = 'add' | 'workflow' | 'asset' | 'history' | 'tutorial';

interface UseLinghuiCanvasCallbackRefsParams {
  onSelectionChange?: (selection: LinghuiCanvasSelection) => void;
  onNodeMutate?: (nodeId: string) => void;
  onConnectionError?: (message: string) => void;
  onRunSingleNode?: (nodeId: string) => void;
  onOpenDrawer?: (drawer: LinghuiCanvasDrawer) => void;
}

export function useLinghuiCanvasCallbackRefs({
  onSelectionChange,
  onNodeMutate,
  onConnectionError,
  onRunSingleNode,
  onOpenDrawer,
}: UseLinghuiCanvasCallbackRefsParams) {
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onNodeMutateRef = useRef(onNodeMutate);
  const onConnectionErrorRef = useRef(onConnectionError);
  const onRunSingleNodeRef = useRef(onRunSingleNode);
  const onOpenDrawerRef = useRef(onOpenDrawer);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    onNodeMutateRef.current = onNodeMutate;
  }, [onNodeMutate]);

  useEffect(() => {
    onConnectionErrorRef.current = onConnectionError;
  }, [onConnectionError]);

  useEffect(() => {
    onRunSingleNodeRef.current = onRunSingleNode;
  }, [onRunSingleNode]);

  useEffect(() => {
    onOpenDrawerRef.current = onOpenDrawer;
  }, [onOpenDrawer]);

  return {
    onSelectionChangeRef,
    onNodeMutateRef,
    onConnectionErrorRef,
    onRunSingleNodeRef,
    onOpenDrawerRef,
  };
}
