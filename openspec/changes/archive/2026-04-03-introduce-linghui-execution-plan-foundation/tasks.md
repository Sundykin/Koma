## 1. Change Artifacts

- [x] 1.1 为执行计划可视化 foundation 补齐 proposal / design / spec，明确首版迁移边界

## 2. Plan Analysis Foundation

- [x] 2.1 抽出共享图分析能力，提供执行计划构建服务与时长估算
- [x] 2.2 为执行计划定义波次、并行度、瓶颈节点与成本状态结构

## 3. Preflight UI

- [x] 3.1 在运行全部 / 运行选中前接入执行计划确认弹窗
- [x] 3.2 在弹窗中展示规模摘要、波次、预计耗时、瓶颈节点与成本可估状态

## 4. Validation

- [x] 4.1 补充执行计划分析的定向测试
- [x] 4.2 运行定向 `vitest` 与类型检查，记录验证结果

## Validation Notes

- `pnpm exec vitest run src/components/linghui/linghuiExecutionPlan.test.ts src/components/linghui/linghuiExecutionWorkflow.test.ts` ✅
- `pnpm exec tsc --noEmit --pretty false` ⚠️ 仍存在仓库既有类型错误，位于 `src/chat/ipc/chatIPC.profile.test.ts`、`src/components/linghui/nodes/VideoNode.test.tsx`、`src/engine/simpleEngine.transition.test.ts`、`src/services/simpleExportRenderer.test.ts`、`src/store/settings/core.ts`
