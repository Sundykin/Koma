## Context

灵绘执行引擎本身已经把节点、边和已知输出收敛到 `LinghuiExecutionContext` 中，但 provider 解析仍然散落在 `linghuiExecutionProviders.ts` 和 `frontend/src/providers/index.ts`，并且默认通过 `loadSettings()` 读取全局配置。

这会带来两个直接问题：

- 同一次执行的不同节点可能在执行过程中观察到不同的 settings
- 测试很难验证“本次执行使用的是哪一份配置”，因为上下文依赖被隐藏在全局 store 里

## Goals / Non-Goals

**Goals**

- 让单次灵绘执行在 provider 解析层面共享同一份冻结的 settings snapshot
- 保持非灵绘调用方兼容，未传 snapshot 时仍可沿用当前全局 settings 读取逻辑
- 用最小 API 扩展把 snapshot 从执行入口传到 provider factory

**Non-Goals**

- 不重构整个 provider 体系为完全无全局依赖
- 不在本轮修改所有其他工作流对 `getProject*Provider()` 的调用方式
- 不引入新的设置持久化机制或执行 UI

## Decisions

### Decision: 在 `LinghuiPage` 执行入口捕获 snapshot

执行启动前由 `LinghuiPage` 主动读取 settings 并做深拷贝，然后把 snapshot 放入 `LinghuiExecutionContext`。

Why:

- 页面已经负责创建 abort controller、收集执行上下文、调用 `executeLinghuiWorkflow()`，最适合承担“本次执行的运行时依赖准备”职责
- 这样可以避免把 settings 读取逻辑塞进 `executeLinghuiWorkflow()`，保持执行引擎依然由外部注入上下文

Alternatives considered:

- 在 `useLinghuiCanvasImperativeHandle` 里构建 snapshot：会让 canvas imperative API 混入与画布无关的全局配置职责
- 在 provider helper 里各自缓存 settings：无法保证“同一次执行只读一次”

### Decision: 通过 `LinghuiExecutionContext` / `ExecutionNodeView` 透传 snapshot

`settingsSnapshot` 作为可选字段加入执行上下文，并暴露在 `ExecutionNodeView` 上，供节点执行器把它传入 provider helper。

Why:

- 这是现有执行链路里最自然的数据通道
- 可选字段可以让现有测试和其他调用方渐进迁移

### Decision: provider helper 和 provider factory 统一支持可选 snapshot

`generateTextWithProvider`、`generateImageWithProvider`、`generateVideoWithProvider`、`generateAudioWithProvider` 以及 `getProject*Provider()` 都支持接收可选 `settingsSnapshot`，优先使用它，缺失时回退到 `loadSettings()`。

Why:

- 这样可以在不破坏现有调用方的情况下，把灵绘工作流切换到 snapshot 驱动
- provider factory 是最终的解析入口，把 fallback 保留在这里更容易复用和测试

## Risks / Trade-offs

- [执行期间 settings 变更不会立刻生效] → 这是刻意接受的行为，目标就是让单次执行配置保持一致
- [深拷贝 settings 有少量额外开销] → settings 数据量较小，且每次执行只做一次，开销可接受
- [可选 snapshot 参数需要维护兼容分支] → 通过测试同时覆盖 snapshot 和 fallback 路径，降低回归风险

## Migration Plan

1. 先扩展 OpenSpec、类型和执行入口，定义 `settingsSnapshot`
2. 再把 snapshot 沿节点执行器和 provider helper 链路向下透传
3. 最后更新 provider factory 与测试，验证 snapshot 路径和回退路径都可工作

## Open Questions

None.
