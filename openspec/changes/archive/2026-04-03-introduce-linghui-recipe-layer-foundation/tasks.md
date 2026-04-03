## 1. Change Artifacts

- [x] 1.1 为 Recipe Layer foundation 补齐 proposal / design / spec，明确首版迁移边界

## 2. Template Data Foundation

- [x] 2.1 为工作流模板记录补充来源元数据，并兼容旧模板记录的默认归一化
- [x] 2.2 新增系统内置 Recipe 模板定义，并合并到工作流模板列表返回结果

## 3. Library Presentation

- [x] 3.1 调整工作流模板抽屉，区分系统 Recipe 与工作区模板并展示模板标签/描述
- [x] 3.2 继续复用现有“发送到画布”协议，让系统 Recipe 可以直接插入画布

## 4. Validation

- [x] 4.1 补充工作流模板列表与 Recipe 元数据的定向测试
- [x] 4.2 运行定向 `vitest` 与类型检查，记录验证结果

## Validation Notes

- `pnpm exec vitest run src/store/linghuiStorage.test.ts` ✅
- `pnpm exec tsc --noEmit --pretty false` ⚠️ 仍存在仓库既有类型错误，位于 `src/chat/ipc/chatIPC.profile.test.ts`、`src/components/linghui/nodes/VideoNode.test.tsx`、`src/engine/simpleEngine.transition.test.ts`、`src/services/simpleExportRenderer.test.ts`、`src/store/settings/core.ts`
