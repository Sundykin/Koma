import { createContext, useContext } from 'react';
import type { PointerEventHandler } from 'react';
import type {
  LinghuiCanvasMode,
  LinghuiImageToolKey,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiVideoToolKey,
} from '../../../types/linghui';

export const LinghuiNodeRunsContext = createContext<Record<string, LinghuiNodeRunState>>({});

export function useNodeRunState(nodeId: string): LinghuiNodeRunState | undefined {
  const runs = useContext(LinghuiNodeRunsContext);
  return runs[nodeId];
}

export interface LinghuiGroupRunSummary {
  status: 'idle' | 'running' | 'failed' | 'stale' | 'succeeded' | 'partial';
  total: number;
  running: number;
  failed: number;
  stale: number;
  succeeded: number;
  idle: number;
  updatedAt?: number;
}

export const LinghuiGroupRunsContext = createContext<Record<string, LinghuiGroupRunSummary>>({});

export function useGroupRunSummary(groupId: string): LinghuiGroupRunSummary | undefined {
  return useContext(LinghuiGroupRunsContext)[groupId];
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
  clearNodeRunState: (nodeId: string) => void;
}

const noopMutationApi: LinghuiNodeMutationApi = {
  updateNodeData: () => undefined,
  clearNodeRunState: () => undefined,
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
  openNodeContextMenu: (nodeId: string, clientX: number, clientY: number) => void;
  openImageToolPanel: (nodeId: string, tool: LinghuiImageToolKey) => void;
  openVideoToolPanel: (nodeId: string, tool: LinghuiVideoToolKey) => void;
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
  openNodeContextMenu: () => undefined,
  openImageToolPanel: () => undefined,
  openVideoToolPanel: () => undefined,
};

export const LinghuiNodeInteractionContext = createContext<LinghuiNodeInteractionApi>(noopInteractionApi);

export function useLinghuiNodeInteraction(nodeId: string): LinghuiNodeInteractionHandlers {
  const api = useContext(LinghuiNodeInteractionContext);
  return api.bindNodeSurface(nodeId);
}

export function useLinghuiCanvasMode(): LinghuiCanvasMode {
  return useContext(LinghuiNodeInteractionContext).canvasMode;
}

export function useLinghuiNodeInteractionApi(): LinghuiNodeInteractionApi {
  return useContext(LinghuiNodeInteractionContext);
}
