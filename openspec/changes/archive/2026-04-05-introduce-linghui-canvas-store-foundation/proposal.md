## Why

灵绘画布当前把大量交互状态分散在 `LinghuiCanvas` 本地 hook 中，导致组件承担了过多状态编排职责，也让后续继续拆分 hook 或让多个子组件共享同一份交互状态变得困难。先引入一层轻量 canvas store，可以为后续节点、历史与文档状态继续 store 化打下基础。

## What Changes

- 为灵绘画布引入基于 Zustand 的 canvas UI store，统一承载编辑选中、节点工具态、画布模式、分组框与 grid-split 状态
- 将 `useLinghuiCanvasUiState` 改造成 store 的桥接 hook，保留现有组件调用方式
- 补充 store 层测试，覆盖工具切换、grid-split 回退与 reset 行为

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 灵绘画布交互状态需要由共享 store 提供一致来源，而不是分散在组件局部状态中

## Impact

- Affected specs:
  - `linghui-studio`
- Affected code:
  - `frontend/src/components/linghui/useLinghuiCanvasUiState.ts`
  - `frontend/src/components/linghui/LinghuiCanvas.tsx`
  - `frontend/src/components/linghui/` 下依赖画布 UI 状态的交互 hooks
  - `frontend/src/store/` 或 `frontend/src/components/linghui/` 下新增 canvas store 与测试
