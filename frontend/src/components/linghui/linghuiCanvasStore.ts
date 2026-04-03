import { create } from 'zustand';
import type {
  LinghuiCanvasMode,
  LinghuiCanvasSelection,
  LinghuiGridType,
  LinghuiNodeToolState,
} from '../../types/linghui';
import type { LinghuiPendingGroupFrame } from './linghuiCanvasShared';

interface LinghuiCanvasUiState {
  selection: LinghuiCanvasSelection;
  editorSelection: LinghuiCanvasSelection;
  activeNodeTool: LinghuiNodeToolState;
  canvasRect: DOMRect | null;
  canvasMode: LinghuiCanvasMode;
  pendingGroupFrame: LinghuiPendingGroupFrame | null;
  gridSplitType: LinghuiGridType;
  gridSplitSelectedCells: number[];
  gridSplitUpscaleFactor: 2 | 4;
  previousGridSplitTool: LinghuiNodeToolState;
}

interface LinghuiCanvasUiActions {
  setSelection: (selection: LinghuiCanvasSelection) => void;
  setEditorSelection: (selection: LinghuiCanvasSelection) => void;
  setActiveNodeTool: (tool: LinghuiNodeToolState) => void;
  setCanvasRect: (rect: DOMRect | null) => void;
  setCanvasMode: (mode: LinghuiCanvasMode) => void;
  setPendingGroupFrame: (frame: LinghuiPendingGroupFrame | null) => void;
  setGridSplitType: (type: LinghuiGridType) => void;
  setGridSplitSelectedCells: (cells: number[]) => void;
  setGridSplitUpscaleFactor: (factor: 2 | 4) => void;
  toggleGridSplitCell: (index: number) => void;
  revertGridSplitTool: () => void;
  resetCanvasUiState: () => void;
  resetCanvasStore: () => void;
}

export type LinghuiCanvasStoreState = LinghuiCanvasUiState & LinghuiCanvasUiActions;

function createInitialCanvasUiState(): LinghuiCanvasUiState {
  return {
    selection: null,
    editorSelection: null,
    activeNodeTool: null,
    canvasRect: null,
    canvasMode: 'mouse',
    pendingGroupFrame: null,
    gridSplitType: '2x2',
    gridSplitSelectedCells: [],
    gridSplitUpscaleFactor: 2,
    previousGridSplitTool: null,
  };
}

function isGridSplitTool(tool: LinghuiNodeToolState): tool is Exclude<LinghuiNodeToolState, null> & {
  kind: 'image';
  tool: 'grid-split';
} {
  return tool?.kind === 'image' && tool.tool === 'grid-split';
}

export const useLinghuiCanvasStore = create<LinghuiCanvasStoreState>((set) => ({
  ...createInitialCanvasUiState(),

  setSelection(selection) {
    set({ selection });
  },

  setEditorSelection(selection) {
    set(state => {
      const shouldClearActiveTool = state.activeNodeTool
        && (selection?.kind !== 'node' || selection.nodeId !== state.activeNodeTool.nodeId);

      return {
        editorSelection: selection,
        activeNodeTool: shouldClearActiveTool ? null : state.activeNodeTool,
        gridSplitSelectedCells: shouldClearActiveTool ? [] : state.gridSplitSelectedCells,
      };
    });
  },

  setActiveNodeTool(tool) {
    set(state => {
      const enteringGridSplit = isGridSplitTool(tool);
      const alreadyInGridSplit = isGridSplitTool(state.activeNodeTool);
      const leavingGridSplit = alreadyInGridSplit && !enteringGridSplit;

      return {
        activeNodeTool: tool,
        previousGridSplitTool: enteringGridSplit && !alreadyInGridSplit
          ? state.activeNodeTool
          : state.previousGridSplitTool,
        gridSplitSelectedCells: leavingGridSplit ? [] : state.gridSplitSelectedCells,
      };
    });
  },

  setCanvasRect(rect) {
    set({ canvasRect: rect });
  },

  setCanvasMode(mode) {
    set({ canvasMode: mode });
  },

  setPendingGroupFrame(frame) {
    set({ pendingGroupFrame: frame });
  },

  setGridSplitType(type) {
    set({ gridSplitType: type });
  },

  setGridSplitSelectedCells(cells) {
    set({ gridSplitSelectedCells: [...cells].sort((left, right) => left - right) });
  },

  setGridSplitUpscaleFactor(factor) {
    set({ gridSplitUpscaleFactor: factor });
  },

  toggleGridSplitCell(index) {
    set(state => ({
      gridSplitSelectedCells: state.gridSplitSelectedCells.includes(index)
        ? state.gridSplitSelectedCells.filter(item => item !== index)
        : [...state.gridSplitSelectedCells, index].sort((left, right) => left - right),
    }));
  },

  revertGridSplitTool() {
    set(state => ({
      activeNodeTool: state.previousGridSplitTool ?? null,
      gridSplitSelectedCells: [],
    }));
  },

  resetCanvasUiState() {
    set(state => ({
      selection: null,
      editorSelection: null,
      activeNodeTool: null,
      pendingGroupFrame: null,
      gridSplitSelectedCells: [],
      gridSplitUpscaleFactor: 2,
      previousGridSplitTool: null,
      canvasRect: state.canvasRect,
      canvasMode: state.canvasMode,
      gridSplitType: state.gridSplitType,
    }));
  },

  resetCanvasStore() {
    set(createInitialCanvasUiState());
  },
}));

export function resetLinghuiCanvasStore(): void {
  get().resetCanvasStore();
}

function get(): LinghuiCanvasStoreState {
  return useLinghuiCanvasStore.getState();
}
