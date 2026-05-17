import { create } from 'zustand';
import type {
  LinghuiCanvasMode,
  LinghuiCanvasSelection,
  LinghuiGridType,
  LinghuiNodeToolState,
} from '../../../../types/linghui';
import type { LinghuiLibraryDrawerKey } from '../../library/components/LinghuiLibraryDrawer';
import type {
  LinghuiCanvasMenuState,
  LinghuiPendingGroupFrame,
  QuickCreateState,
} from './linghuiCanvasShared';
import { QUICK_CREATE_HEIGHT, QUICK_CREATE_WIDTH } from './linghuiCanvasShared';

const CONTEXT_MENU_WIDTH = 260;
const CANVAS_OVERLAY_GUTTER = 10;

type OverlayHostRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

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
  contextMenu: LinghuiCanvasMenuState | null;
  quickCreate: QuickCreateState | null;
  /**
   * 抑制 paneClick 关闭 quickCreate 的截止时间。
   * React Flow 在连线松开时会立即触发 onPaneClick（mouseup 也算 click），导致刚开的 quickCreate
   * 在同一帧被 handlePaneClick 关掉。这里给 250ms 的护栏：openQuickCreateAt 后写入时间戳，
   * closeQuickCreateFromPane 检查到仍在窗口内则不关。其它路径（Esc、点节点、选下游）仍正常关闭。
   */
  paneClickQuickCreateSuppressUntil: number;
  activeDrawer: LinghuiLibraryDrawerKey | null;
  /**
   * LibTV `interacting` 状态：节点/框选拖拽中。挂载到画布根节点的 .canvas-interacting class，
   * 让 SCSS 暂停 glow-spin / connection-breathe / generating-breathing-* / skeleton-shimmer 等动画，
   * 避免拖拽时 GPU 被这些动画反复重绘。
   */
  interacting: boolean;
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
  setContextMenu: (menu: LinghuiCanvasMenuState | null) => void;
  setQuickCreate: (state: QuickCreateState | null) => void;
  closeContextMenu: () => void;
  closeQuickCreate: () => void;
  /** 来自 onPaneClick 的关闭请求；如在 suppress 窗口内则忽略，避免连线松开后立刻被 pane click 关掉。 */
  closeQuickCreateFromPane: () => void;
  openContextMenuAt: (params: {
    clientX: number;
    clientY: number;
    hostRect: OverlayHostRect;
    kind: LinghuiCanvasMenuState['kind'];
    extras?: { nodeId?: string; edgeId?: string; selectionIds?: string[] };
  }) => void;
  openQuickCreateAt: (params: {
    clientX: number;
    clientY: number;
    hostRect: OverlayHostRect;
    options?: { sourceConnection?: QuickCreateState['sourceConnection'] };
  }) => void;
  setActiveDrawer: (drawer: LinghuiLibraryDrawerKey | null) => void;
  toggleActiveDrawer: (drawer: LinghuiLibraryDrawerKey) => void;
  closeActiveDrawer: () => void;
  setInteracting: (interacting: boolean) => void;
  resetCanvasUiState: () => void;
  resetCanvasSurfaceState: () => void;
  resetCanvasStore: () => void;
}

export type LinghuiCanvasStoreState = LinghuiCanvasUiState & LinghuiCanvasUiActions;

function clampOverlayPosition(rawValue: number, overlaySize: number, containerSize: number): number {
  return Math.max(
    CANVAS_OVERLAY_GUTTER,
    Math.min(rawValue, containerSize - overlaySize - CANVAS_OVERLAY_GUTTER),
  );
}

function resolveContextMenuHeight(kind: LinghuiCanvasMenuState['kind']): number {
  switch (kind) {
    case 'node':
      return 460;
    case 'edge':
      return 164;
    default:
      return 560;
  }
}

function createInitialCanvasUiState(): LinghuiCanvasUiState {
  return {
    selection: null,
    editorSelection: null,
    activeNodeTool: null,
    canvasRect: null,
    // 默认走 ComfyUI 风格：左键拖动平移、滚轮缩放，无需先按修饰键。
    // 用户仍可通过 HUD 切到 'mouse'（Figma 风格：左键框选 + 中键/右键拖动平移）。
    canvasMode: 'hand',
    pendingGroupFrame: null,
    gridSplitType: '2x2',
    gridSplitSelectedCells: [],
    gridSplitUpscaleFactor: 2,
    previousGridSplitTool: null,
    contextMenu: null,
    quickCreate: null,
    paneClickQuickCreateSuppressUntil: 0,
    activeDrawer: null,
    interacting: false,
  };
}

const QUICK_CREATE_PANE_CLICK_SUPPRESS_MS = 250;

function isGridSplitTool(tool: LinghuiNodeToolState): tool is Exclude<LinghuiNodeToolState, null> & {
  kind: 'image';
  tool: 'grid-split';
} {
  return tool?.kind === 'image' && tool.tool === 'grid-split';
}

export const useLinghuiCanvasStore = create<LinghuiCanvasStoreState>((set, get) => ({
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

  setContextMenu(contextMenu) {
    set(state => ({
      contextMenu,
      quickCreate: contextMenu ? null : state.quickCreate,
    }));
  },

  setQuickCreate(quickCreate) {
    set(state => ({
      quickCreate,
      contextMenu: quickCreate ? null : state.contextMenu,
    }));
  },

  closeContextMenu() {
    set({ contextMenu: null });
  },

  closeQuickCreate() {
    set({ quickCreate: null, paneClickQuickCreateSuppressUntil: 0 });
  },

  closeQuickCreateFromPane() {
    const suppressUntil = get().paneClickQuickCreateSuppressUntil;
    if (suppressUntil && Date.now() < suppressUntil) {
      // 抑制窗口内：来自 React Flow onPaneClick 的关闭被丢弃，避免连线松开同帧把刚弹的面板关掉。
      return;
    }
    set({ quickCreate: null, paneClickQuickCreateSuppressUntil: 0 });
  },

  openContextMenuAt({ clientX, clientY, hostRect, kind, extras }) {
    const rawX = clientX - hostRect.left;
    const rawY = clientY - hostRect.top;

    set({
      quickCreate: null,
      contextMenu: {
        kind,
        x: clampOverlayPosition(rawX, CONTEXT_MENU_WIDTH, hostRect.width),
        y: clampOverlayPosition(rawY, resolveContextMenuHeight(kind), hostRect.height),
        screenX: clientX,
        screenY: clientY,
        nodeId: extras?.nodeId,
        edgeId: extras?.edgeId,
        selectionIds: extras?.selectionIds,
      },
    });
  },

  openQuickCreateAt({ clientX, clientY, hostRect, options }) {
    const rawX = clientX - hostRect.left;
    const rawY = clientY - hostRect.top;
    const clampedX = clampOverlayPosition(rawX, QUICK_CREATE_WIDTH, hostRect.width);
    const clampedY = clampOverlayPosition(rawY, QUICK_CREATE_HEIGHT, hostRect.height);

    set({
      contextMenu: null,
      quickCreate: {
        x: clampedX,
        y: clampedY,
        screenX: clientX,
        screenY: clientY,
        sourceConnection: options?.sourceConnection,
      },
      // 写入 250ms 抑制窗口；React Flow 在连线松开时会立刻冒泡 onPaneClick，paneClick 处理器会在
      // 抑制窗口内忽略 close。其它路径（Esc、点节点、选下游、点击空白）不受影响。
      paneClickQuickCreateSuppressUntil: Date.now() + QUICK_CREATE_PANE_CLICK_SUPPRESS_MS,
    });
  },

  setActiveDrawer(activeDrawer) {
    set({ activeDrawer });
  },

  toggleActiveDrawer(drawer) {
    set(state => ({
      activeDrawer: state.activeDrawer === drawer ? null : drawer,
    }));
  },

  closeActiveDrawer() {
    set({ activeDrawer: null });
  },

  setInteracting(interacting) {
    set(state => (state.interacting === interacting ? state : { interacting }));
  },

  resetCanvasUiState() {
    set(state => ({
      selection: null,
      editorSelection: null,
      activeNodeTool: null,
      pendingGroupFrame: null,
      contextMenu: null,
      quickCreate: null,
      gridSplitSelectedCells: [],
      gridSplitUpscaleFactor: 2,
      previousGridSplitTool: null,
      canvasRect: state.canvasRect,
      canvasMode: state.canvasMode,
      gridSplitType: state.gridSplitType,
      activeDrawer: state.activeDrawer,
    }));
  },

  resetCanvasSurfaceState() {
    set(state => ({
      ...createInitialCanvasUiState(),
      activeDrawer: state.activeDrawer,
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
