import { createContext, useContext } from 'react';
import type { PointerEventHandler } from 'react';
import type { LinghuiCanvasMode, LinghuiNodeData, LinghuiNodeRunState } from '../../../types/linghui';

export const LinghuiNodeRunsContext = createContext<Record<string, LinghuiNodeRunState>>({});

export function useNodeRunState(nodeId: string): LinghuiNodeRunState | undefined {
  const runs = useContext(LinghuiNodeRunsContext);
  return runs[nodeId];
}

export type ConnectionErrorHandler = (message: string) => void;
export const LinghuiConnectionErrorContext = createContext<ConnectionErrorHandler>(() => {});

export interface LinghuiNodeMutationOptions {
  markStale?: boolean;
}

export interface LinghuiNodeMutationApi {
  updateNodeData: (
    nodeId: string,
    updater: (prev: LinghuiNodeData) => LinghuiNodeData,
    options?: LinghuiNodeMutationOptions,
  ) => void;
}

const noopMutationApi: LinghuiNodeMutationApi = {
  updateNodeData: () => undefined,
};

export const LinghuiNodeMutationContext = createContext<LinghuiNodeMutationApi>(noopMutationApi);

export function useLinghuiNodeMutation(): LinghuiNodeMutationApi {
  return useContext(LinghuiNodeMutationContext);
}

export interface LinghuiNodeInteractionHandlers {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
}

export interface LinghuiNodeInteractionApi {
  canvasMode: LinghuiCanvasMode;
  bindNodeSurface: (nodeId: string) => LinghuiNodeInteractionHandlers;
}

const noopHandlers: LinghuiNodeInteractionHandlers = {
  onPointerDown: () => undefined,
  onPointerMove: () => undefined,
  onPointerUp: () => undefined,
  onPointerCancel: () => undefined,
};

const noopInteractionApi: LinghuiNodeInteractionApi = {
  canvasMode: 'mouse',
  bindNodeSurface: () => noopHandlers,
};

export const LinghuiNodeInteractionContext = createContext<LinghuiNodeInteractionApi>(noopInteractionApi);

export function useLinghuiNodeInteraction(nodeId: string): LinghuiNodeInteractionHandlers {
  const api = useContext(LinghuiNodeInteractionContext);
  return api.bindNodeSurface(nodeId);
}

export function useLinghuiCanvasMode(): LinghuiCanvasMode {
  return useContext(LinghuiNodeInteractionContext).canvasMode;
}
