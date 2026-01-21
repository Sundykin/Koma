# Tasks: migrate-antd-v6

## Phase 1: Message 静态方法迁移

### 1.1 迁移组件文件的 message 调用

- [x] **Task 1.1.1**: 迁移 `Storyboard.tsx`
  - 移除 `import { message } from 'antd'`
  - 添加 `const { message } = App.useApp()`
  - 验证所有 message 调用正常

- [x] **Task 1.1.2**: 迁移 `SimpleExportDialog.tsx`
  - 移除 `import { message } from 'antd'`
  - 添加 `const { message, modal } = App.useApp()`

- [x] **Task 1.1.3**: 迁移 `SimpleEditor.tsx`
  - 移除 `import { message } from 'antd'`
  - 添加 `const { message } = App.useApp()`

- [x] **Task 1.1.4**: 迁移 `SimpleAssetPanel.tsx`
  - 移除 `import { message } from 'antd'`
  - 添加 `const { message } = App.useApp()`

- [x] **Task 1.1.5**: 迁移 `ReferenceImagePicker.tsx`
  - 移除 `import { message } from 'antd'`
  - 添加 `const { message } = App.useApp()`

- [x] **Task 1.1.6**: 迁移 `ImageCardGrid.tsx`
  - 移除 `import { message } from 'antd'`
  - 添加 `const { message } = App.useApp()`

### 1.2 处理 Hooks 文件

- [x] **Task 1.2.1**: 重构 `useEditorShortcuts.ts`
  - 采用方案: 直接在 hook 内部调用 `App.useApp()`
  - Hook 可以调用其他 Hook，所以直接使用 useApp() 即可

## Phase 2: Modal 静态方法迁移

- [x] **Task 2.1**: 迁移 `SettingsPage.tsx` 的 Modal.confirm
  - 使用 `const { message, modal } = App.useApp()`
  - 将 `Modal.confirm()` 改为 `modal.confirm()`

- [x] **Task 2.2**: 迁移 `SimpleExportDialog.tsx` 的 Modal 静态方法
  - 使用 `const { message, modal } = App.useApp()`
  - 将 `Modal.success()`/`Modal.error()` 改为 `modal.success()`/`modal.error()`

- [x] **Task 2.3**: 迁移 `ExportDialog.tsx` 的 Modal 静态方法
  - 使用 `const { modal } = App.useApp()`
  - 将 `Modal.success()`/`Modal.error()` 改为 `modal.success()`/`modal.error()`

## Phase 3: 验证和清理

- [x] **Task 3.1**: 检查主题配置
  - 验证 `index.tsx` 中的 theme token 在 v6 中兼容
  - components 配置兼容，无需修改

- [x] **Task 3.2**: 构建验证
  - 运行 `npm run build` ✓
  - 确认无错误和废弃警告

- [ ] **Task 3.3**: 运行时验证
  - 启动开发服务器
  - 测试所有 message 和 modal 调用场景

## Dependencies

```
Task 1.1.* 可并行执行 ✓
Task 1.2.1 可与 1.1.* 并行 ✓
Task 2.* 可与 Phase 1 并行 ✓
Task 3.1 可与 Phase 1/2 并行 ✓
Task 3.2 需要 Phase 1/2 完成 ✓
Task 3.3 需要 Task 3.2 完成 (待手动测试)
```

## Completion Summary

| Phase | 状态 | 备注 |
|-------|------|------|
| Phase 1.1 | ✓ 完成 | 6 个组件文件已迁移 |
| Phase 1.2 | ✓ 完成 | Hook 直接使用 useApp() |
| Phase 2 | ✓ 完成 | 3 个文件的 Modal 静态方法已迁移 |
| Phase 3.1 | ✓ 完成 | 主题配置无需修改 |
| Phase 3.2 | ✓ 完成 | 构建成功 |
| Phase 3.3 | 待测试 | 需要手动运行时验证 |

### 迁移的文件清单

1. `src/components/storyboard/Storyboard.tsx` - message
2. `src/components/editor/SimpleExportDialog.tsx` - message + modal
3. `src/components/editor/SimpleEditor.tsx` - message
4. `src/components/editor/SimpleAssetPanel.tsx` - message
5. `src/components/editor/ExportDialog.tsx` - modal
6. `src/components/asset/ReferenceImagePicker.tsx` - message
7. `src/components/asset/ImageCardGrid.tsx` - message
8. `src/components/settings/SettingsPage.tsx` - modal
9. `src/hooks/useEditorShortcuts.ts` - message
