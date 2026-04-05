## Context

当前灵绘画布已经有一个共享 `linghuiCanvasStore`，负责编辑选中、工具态、分组框和 grid-split 状态；但 `useLinghuiCanvasOverlayState` 仍用本地 `useState` 维护 `contextMenu` 与 `quickCreate`，`LinghuiPage` 仍用本地 `useState` 维护 `activeDrawer`。这意味着 overlay 的互斥、关闭和 reset 规则横跨多个组件，既不利于复用，也让后续继续扩展 store 时容易出现边界混乱。

另一个关键约束是：`useLinghuiCanvasUiState` 当前会在画布挂载和卸载时调用 `resetCanvasStore()`。如果直接把 `activeDrawer` 迁进同一个 store 而不调整 reset 语义，那么任何画布级 reset 都会把页面抽屉一并清掉。

## Goals / Non-Goals

**Goals:**

- 将 `contextMenu`、`quickCreate` 和 `activeDrawer` 迁入现有 canvas store
- 保持 `useLinghuiCanvasOverlayState` 继续作为桥接层，尽量减少下游调用方改动
- 把 overlay 互斥与 drawer toggle 等状态机规则收敛进 store action
- 引入 scoped reset，避免画布局部 reset 误伤页面级 drawer
- 用单测锁定新的 overlay / drawer 行为

**Non-Goals:**

- 不在本轮迁移 `nodes` / `edges` / 历史快照 / 工作区文档状态
- 不改变已有 overlay 的视觉布局与交互入口
- 不重构资产、工作流、历史面板的数据加载策略

## Decisions

### Decision: 继续沿用同一个 canvas store，而不是新建单独 overlay store

`contextMenu`、`quickCreate`、`activeDrawer` 都属于灵绘画布上下文里的共享 UI 状态，和第一阶段迁入的选择态、工具态属于同一类状态切片。

Why:

- 保持 5.2.1 “画布状态 Store 化” 的演化方向连续
- overlay 与工具态、选择态之间存在天然联动，放在同一 store 更容易统一规则
- 避免为了少量状态再创建第二个 store，增加订阅与 reset 边界复杂度

### Decision: `useLinghuiCanvasOverlayState` 保留为桥接 hook

overlay hook 继续负责把 `hostRef`、`reactFlow`、`nodes` 等运行时依赖组装成调用方需要的 derived data 和 action，而状态本身与互斥规则下沉到 store。

Why:

- 可以保留现有 `LinghuiCanvas` 与文档操作 hooks 的大部分接口
- DOM 尺寸与 React Flow 实例不进入 store，避免 store 持有非序列化运行时对象

### Decision: 为 reset 引入两层语义

store 需要同时提供：

- `resetCanvasUiState()`：画布局部 UI reset，清理编辑器临时态、分组框、grid-split 选择和 overlay
- `resetCanvasSurfaceState()`：画布挂载/卸载时的 surface reset，恢复画布级默认值，但保留页面级 `activeDrawer`
- `resetCanvasStore()`：页面级完整 reset，包含 `activeDrawer`

Why:

- `contextMenu` / `quickCreate` 跟随画布实例生命周期，应该在画布重置时清空
- `activeDrawer` 属于页面级导航入口，不能因为画布本地 reset 被误清
- 完整 reset 仍然需要存在，用于离开灵绘页面时清空整份 store

### Decision: 统一 drawer 类型来源

原来 `LinghuiCanvas` 相关文件各自声明 `'add' | 'workflow' | 'asset' | 'history' | 'tutorial'` 联合类型。本轮统一改为共享 `LinghuiLibraryDrawerKey` 类型，避免 store、page 和 canvas 回调出现并行定义。

Why:

- 降低类型漂移风险
- 为后续继续把 toolbar / drawer 交互收口到 store 做准备

## Risks / Trade-offs

- [overlay 状态进入 store 后 selector 不当会扩大重渲染面] → 保持细粒度 selector，derived data 继续在 hook 内计算
- [reset 语义增加后容易混淆调用场景] → 明确 page 使用完整 reset，canvas 挂载使用 surface reset，局部 UI reset 只清理临时态
- [page 与 canvas 同时读写同一 store 可能引入竞态] → 让 toggle / close 规则收敛到 store action，避免多个组件自行实现互斥逻辑

## Migration Plan

1. 扩展 `linghuiCanvasStore` 的 overlay / drawer 状态与 scoped reset action
2. 将 `useLinghuiCanvasOverlayState` 改为 store-backed bridge hook
3. 将 `LinghuiPage` 切换到 store-backed `activeDrawer`
4. 补充测试并验证 overlay 互斥、drawer toggle 与 reset 行为

## Open Questions

None.
