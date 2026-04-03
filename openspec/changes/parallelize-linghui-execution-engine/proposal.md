## Why

灵绘当前按拓扑序逐个执行节点，即使多个节点彼此独立，也必须串行排队。这会让包含多分支图片、文本或导入节点的工作流整体耗时被不必要地拉长，已经成为近期架构分析里最直接的性能瓶颈。

## What Changes

- 将 `executeLinghuiWorkflow` 从“单节点串行循环”改为“按拓扑层级调度，同层节点并发执行”
- 扩展执行队列状态，让队列可以表达同一时刻存在多个运行中节点
- 保持失败隔离：同层某个分支失败时，不取消其他并行分支；只有依赖失败分支的后续节点会被标记为失败
- 补充执行层测试，覆盖并发调度、依赖阻塞、队列状态与取消语义

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 灵绘工作流执行需要支持按拓扑层级并发调度，并正确暴露并行执行状态

## Impact

- Affected specs:
  - `linghui-studio`
- Affected code:
  - `frontend/src/components/linghui/linghuiExecutionWorkflow.ts`
  - `frontend/src/components/linghui/linghuiExecutionWorkflow.test.ts`
  - `frontend/src/types/linghui.ts`
