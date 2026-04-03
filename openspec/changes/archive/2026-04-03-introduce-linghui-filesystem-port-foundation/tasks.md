## 1. Change Artifacts

- [x] 1.1 为文件系统抽象 foundation 补齐 proposal / design / spec，明确首版迁移边界

## 2. FileSystem Port

- [x] 2.1 新增 `FileSystemPort` 接口、默认实例管理和 Electron / Memory 两种实现
- [x] 2.2 新增基于 `FileSystemPort` 的本地预览 URL helper，并让灵绘共享预览路径改走该 helper

## 3. Linghui Integration

- [x] 3.1 将宫格切分输入落盘逻辑迁移到 `FileSystemPort`，并补充运行时能力校验
- [x] 3.2 将灵绘结果导出迁移到 `FileSystemPort`，并补充目录选择能力的显式错误

## 4. Validation

- [x] 4.1 补充 `FileSystemPort` 与迁移后灵绘路径的定向测试
- [x] 4.2 运行定向 `vitest` 与类型检查，记录验证结果

## Validation Notes

- `pnpm exec vitest run src/services/fileSystemPort.test.ts src/components/linghui/linghuiResultExport.test.ts` ✅
- `pnpm exec tsc --noEmit --pretty false` ⚠️ 仍存在仓库既有类型错误，位于 `src/chat/ipc/chatIPC.profile.test.ts`、`src/components/linghui/nodes/VideoNode.test.tsx`、`src/engine/simpleEngine.transition.test.ts`、`src/services/simpleExportRenderer.test.ts`、`src/store/settings/core.ts`
