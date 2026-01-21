# Proposal: migrate-antd-v6

## Summary

将项目从 Ant Design v5 升级到 v6，处理所有破坏性变更，确保应用功能和样式的兼容性。

## Context

项目当前已升级 antd 到 v6.2.1，但代码中存在多处与 v6 不兼容的用法，需要进行迁移修复：

1. **`message` 静态方法直接导入** - 7 个文件仍然直接从 `antd` 导入 `message`，应改为 `App.useApp().message`
2. **`Modal` 静态方法** - 2 个文件使用 `Modal.confirm()`、`Modal.success()`、`Modal.error()` 静态方法
3. **主题配置检查** - 验证 v6 中 theme token 和 components 配置是否有变更

## Breaking Changes Analysis

### 已识别的破坏性更新

| 类别 | 影响 | 文件数 |
|------|------|--------|
| message 静态方法 | 需迁移到 useApp() hook | 7 |
| Modal 静态方法 | 需迁移到 useApp() hook | 2 |
| API 属性废弃 | dropdown* → popup* 命名 | 0 (未使用) |
| bordered → variant | 表单组件样式属性 | 0 (未使用) |

### 详细文件清单

#### 直接导入 `message` 的文件：
1. `src/components/storyboard/Storyboard.tsx`
2. `src/components/editor/SimpleExportDialog.tsx`
3. `src/components/editor/SimpleEditor.tsx`
4. `src/components/editor/SimpleAssetPanel.tsx`
5. `src/components/asset/ReferenceImagePicker.tsx`
6. `src/components/asset/ImageCardGrid.tsx`
7. `src/hooks/useEditorShortcuts.ts`

#### 使用 `Modal` 静态方法的文件：
1. `src/components/settings/SettingsPage.tsx` - `Modal.confirm()`
2. `src/components/editor/SimpleExportDialog.tsx` - `Modal.success()`, `Modal.error()`
3. `src/components/editor/ExportDialog.tsx` - `Modal.success()`, `Modal.error()`

## Proposed Solution

### 方案���：逐文件迁移 (推荐)

将每个文件的静态方法调用迁移到 `App.useApp()` hook 方式：

```tsx
// Before
import { message } from 'antd';
message.success('成功');

// After
import { App } from 'antd';
const { message } = App.useApp();
message.success('成功');
```

**优点**：
- 符合 antd v5+ 官方推荐实践
- 自动继承 ConfigProvider 上下文
- 支持主题定制

**缺点**：
- 每个文件都需要修改
- hooks 文件需要特殊处理（无法直接使用 hook）

### 方案二：全局静态实例导出

创建全局入口导出 message/modal 实例：

```tsx
// src/utils/antdStatic.ts
import { App } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';

let message: MessageInstance;

export const StaticProvider = () => {
  const staticFn = App.useApp();
  message = staticFn.message;
  return null;
};

export { message };
```

**优点**：
- 现有调用代码改动最小
- 集中管理

**缺点**：
- 需要确保 StaticProvider 在所有使用前渲染
- hooks 文件调用时机问题

### 推荐方案

采用 **方案一（逐文件迁移）**，对于 hooks 文件，将 message 作为参数传入或返回需要显示消息的回调。

## Scope

### In Scope
- 迁移所有 `message` 直接导入到 `App.useApp()`
- 迁移所有 `Modal` 静态方法到 `App.useApp()`
- 验证主题配置兼容性
- 验证构建和运行时无错误

### Out of Scope
- 样式视觉回归测试
- 新功能开发
- 性能优化

## Dependencies

- antd@6.2.1 (已安装)
- @ant-design/icons@6.1.0 (已安装)
- React@19.2.3 (符合 v6 要求的 React >= 18)

## Risks

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| hooks 文件无法使用 useApp | 高 | 中 | 重构为回调传参模式 |
| 主题 token 变更导致样式问题 | 低 | 低 | 验证后手动调整 |
| 未发现的废弃 API | 低 | 低 | 构建时会有警告提示 |

## Success Criteria

1. 所有文件的 message/Modal 调用迁移到 useApp 方式
2. `npm run build` 无错误
3. 应用运行时功能正常
4. 控制台无 antd 废弃警告
