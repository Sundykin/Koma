## 1. Change Artifacts

- [x] 1.1 为 Provider fallback foundation 补齐 proposal / design / spec，明确首版边界

## 2. Fallback Planning

- [x] 2.1 在渠道解析层生成同媒体类别、同 capability 的 Provider fallback 候选计划
- [x] 2.2 为 fallback 尝试定义有界顺序与尝试摘要结构

## 3. Execution Integration

- [x] 3.1 在图片执行链路接入自动 Provider fallback，并保留最终尝试摘要
- [x] 3.2 在视频执行链路接入自动 Provider fallback，并保留最终尝试摘要与聚合失败错误

## 4. Validation

- [x] 4.1 为 fallback 候选计划和图片 / 视频 fallback 行为补充定向测试
- [x] 4.2 运行定向 `vitest` 与类型检查，记录验证结果

## Validation Notes

- `pnpm exec vitest run src/providers/channel/resolver.test.ts src/components/linghui/linghuiExecutionProviders.test.ts` ✅
- `pnpm exec tsc --noEmit --pretty false` ⚠️ 仍存在仓库既有类型错误，位于 `src/chat/ipc/chatIPC.profile.test.ts`、`src/components/linghui/nodes/VideoNode.test.tsx`、`src/engine/simpleEngine.transition.test.ts`、`src/services/simpleExportRenderer.test.ts`、`src/store/settings/core.ts`
