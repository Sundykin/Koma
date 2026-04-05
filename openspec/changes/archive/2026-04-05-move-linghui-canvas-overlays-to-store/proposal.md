## Why

灵绘画布第一阶段已经把编辑选中、工具态和 grid-split 状态迁入共享 canvas store，但 `contextMenu`、`quickCreate` 仍留在 `LinghuiCanvas` 本地 hook 中，`activeDrawer` 仍留在 `LinghuiPage` 本地 state 中。这让 overlay 行为仍然分散在组件之间，也让“打开一个 overlay 时关闭另一个”“画布局部 reset 不误伤页面抽屉”这类规则无法在同一处维护。

## What Changes

- 扩展灵绘 canvas store，统一承载 `contextMenu`、`quickCreate` 和 `activeDrawer`
- 将 `useLinghuiCanvasOverlayState` 重构为 store 桥接层，保留现有调用方的主要接口形状
- 将 `LinghuiPage` 的 drawer 状态切换到 store-backed `activeDrawer`，让 toolbar、canvas 回调和抽屉本体订阅同一状态源
- 增加分层 reset 语义，确保画布局部 UI reset 会清理上下文菜单与快速创建，但不会误清页面级 drawer 状态
- 补充 store 测试，覆盖 overlay 互斥、drawer toggle 和 scoped reset 行为

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 灵绘画布 overlay 与 drawer 入口需要共享同一份 canvas store 状态，并支持区分画布局部 reset 与页面级 reset

## Impact

- Affected specs:
  - `linghui-studio`
- Affected code:
  - `frontend/src/components/linghui/linghuiCanvasStore.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayState.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasUiState.ts`
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `frontend/src/components/linghui/LinghuiToolbar.tsx`
  - `frontend/src/components/linghui/LinghuiLibraryDrawer.tsx`
  - `frontend/src/components/linghui/useLinghuiCanvasCallbackRefs.ts`
  - `frontend/src/components/linghui/useLinghuiCanvasOverlayProps.ts`
  - `frontend/src/components/linghui/linghuiCanvasStore.test.ts`
