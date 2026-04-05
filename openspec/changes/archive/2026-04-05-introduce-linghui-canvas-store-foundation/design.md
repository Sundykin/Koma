## Context

`LinghuiCanvas` 当前通过 `useLinghuiCanvasUiState` 管理一组本地 UI 状态：`editorSelection`、`activeNodeTool`、`canvasMode`、`pendingGroupFrame`、`gridSplitType`、`gridSplitSelectedCells` 等。这些状态同时被 overlay、节点交互、选择交互和 HUD 消费，已经具备“共享 store”特征，但仍然绑定在单个组件实例内部。

## Goals / Non-Goals

**Goals:**

- 为灵绘画布建立第一版 Zustand store，集中承载最核心的交互 UI 状态
- 让现有调用方尽量不改接口，通过桥接 hook 平滑迁移
- 把与 grid-split 相关的状态联动规则收敛到 store action 中
- 用单测锁定 store 的关键行为

**Non-Goals:**

- 不在本轮把 `nodes` / `edges` / `history` / `workspace document` 全部迁入 store
- 不改造 `useNodesState` / `useEdgesState` 或 React Flow 本身的数据桥接
- 不改变现有画布交互行为或 UI 呈现

## Decisions

### Decision: 先只 store 化“本地共享 UI 状态”

第一步只迁移 `useLinghuiCanvasUiState` 管理的状态，而不直接改动图数据和持久化流程。

Why:

- 这是当前共享程度最高、耦合最清晰的一组状态
- 可以最小成本验证 “store + bridge hook” 模式是否适合灵绘画布

### Decision: 保留 `useLinghuiCanvasUiState` 作为桥接层

外层组件继续使用现有 hook 返回值，hook 内部改为组装 store selector、host ref 和 ResizeObserver。

Why:

- 可以把改动范围控制在当前文件附近
- 下游交互 hooks 无需感知 store 实现细节

### Decision: 将 grid-split 的回退与 reset 逻辑放进 store action

像“进入 grid-split 时记录前一个 tool”、“退出时恢复之前 tool”、“reset 时清理临时态”这类规则，由 store action 统一维护。

Why:

- 这些逻辑属于状态机本身，放在组件 effect 里容易分散
- 后续改造成多组件订阅时也能保持一致性

## Risks / Trade-offs

- [局部状态迁入 store 后 selector 使用不当可能增加重渲染] → 采用细粒度 selector，并保持 `hostRef` 等非序列化对象不进入 store
- [桥接期 store 与 hook 责任边界模糊] → 明确 hook 只做 DOM ref / observer 绑定，状态规则全部下沉到 store
- [未来继续迁移节点与历史状态时需要二次整理] → 当前先建立命名与 action 风格，后续沿同一模式扩展

## Migration Plan

1. 新增 `useLinghuiCanvasStore`
2. 将 `useLinghuiCanvasUiState` 改为桥接该 store
3. 跑定向测试与类型检查

## Open Questions

None.
