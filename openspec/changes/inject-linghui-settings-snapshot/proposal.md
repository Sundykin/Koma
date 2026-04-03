## Why

架构分析文档指出，灵绘执行链路当前会在各个 provider helper 内部重复读取全局 settings，这让一次工作流执行可能在中途观察到不同配置，也让测试和注入自定义上下文变得困难。

“在执行开始时冻结一份 settings 快照并沿执行上下文传递”是一个范围可控、收益明确的改动，适合先作为独立 change 落地。

## What Changes

- 在灵绘页面发起执行时读取并冻结一份 `settingsSnapshot`，并把它注入 `LinghuiExecutionContext`
- 让 `ExecutionNodeView` 和节点执行器把同一份 `settingsSnapshot` 传递给文本、图片、视频、音频 provider helper
- 让灵绘 provider helper 和项目级 provider factory 优先使用注入的 `settingsSnapshot` 解析渠道/模型，未提供时保留现有回退行为
- 补充测试，覆盖 snapshot 透传、避免重复读取全局 settings，以及无 snapshot 时的兼容路径

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `linghui-studio`: 单次工作流执行需要共享同一份冻结的 settings 快照
- `model-providers`: 项目级 provider 解析需要支持显式注入 settings snapshot

## Impact

- Affected specs:
  - `linghui-studio`
  - `model-providers`
- Affected code:
  - `frontend/src/types/linghui.ts`
  - `frontend/src/components/linghui/LinghuiPage.tsx`
  - `frontend/src/components/linghui/linghuiExecutionShared.ts`
  - `frontend/src/components/linghui/linghuiExecutionNodeExecutors.ts`
  - `frontend/src/components/linghui/linghuiExecutionProviders.ts`
  - `frontend/src/providers/index.ts`
  - related `vitest` files in `frontend/src/components/linghui/`
