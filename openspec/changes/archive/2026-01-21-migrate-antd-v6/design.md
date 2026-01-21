# Design: migrate-antd-v6

## Architecture Overview

### 当前架构

```
App.tsx
├── AntApp (antd App 组件包裹)
│   └── 页面组件
│       └── 子组件 (直接使用 message 静态方法)
```

### 目标架构

```
App.tsx
├── AntApp (antd App 组件包裹)
│   └── 页面组件
│       └── 子组件 (通过 useApp() hook 获取 message/modal)
```

## Key Design Decisions

### Decision 1: Hook vs 全局导出

**选择**: 使用 `App.useApp()` hook 方式

**理由**:
1. 官方推荐方式，长期维护性更好
2. 自动继承 ConfigProvider 的主题和国际化配置
3. 类型安全，IDE 支持更好

### Decision 2: Hooks 文件处理策略

**问题**: `useEditorShortcuts.ts` 是自定义 hook，不能直接在其中调用 `App.useApp()`

**选择**: 参数注入模式

```tsx
// Before
export function useEditorShortcuts() {
  message.success('已复制');
}

// After
import type { MessageInstance } from 'antd/es/message/interface';

export function useEditorShortcuts(messageApi: MessageInstance) {
  messageApi.success('已复制');
}

// 调用方
const { message } = App.useApp();
useEditorShortcuts(message);
```

**理由**:
1. 保持 hook 的纯净性
2. 明确依赖关系
3. 便于测试（可 mock message）

### Decision 3: Modal 静态方法迁移

Modal 静态方法 (`Modal.confirm`, `Modal.success`, `Modal.error`) 迁移到 `useApp().modal`:

```tsx
// Before
Modal.confirm({
  title: '确认删除?',
  onOk: handleDelete
});

// After
const { modal } = App.useApp();
modal.confirm({
  title: '确认删除?',
  onOk: handleDelete
});
```

## Code Patterns

### Pattern A: 组件中使用 message

```tsx
import { App } from 'antd';

const MyComponent: React.FC = () => {
  const { message } = App.useApp();

  const handleClick = () => {
    message.success('操作成功');
  };

  return <Button onClick={handleClick}>点击</Button>;
};
```

### Pattern B: 组件中同时使用 message 和 modal

```tsx
import { App } from 'antd';

const MyComponent: React.FC = () => {
  const { message, modal } = App.useApp();

  const handleDelete = () => {
    modal.confirm({
      title: '确认删除?',
      onOk: async () => {
        await deleteItem();
        message.success('删除成功');
      }
    });
  };

  return <Button onClick={handleDelete}>删除</Button>;
};
```

### Pattern C: Hook 参数注入

```tsx
// hooks/useMyHook.ts
import type { MessageInstance } from 'antd/es/message/interface';

interface UseMyHookOptions {
  message: MessageInstance;
}

export function useMyHook({ message }: UseMyHookOptions) {
  const doSomething = useCallback(() => {
    // ... logic
    message.info('完成');
  }, [message]);

  return { doSomething };
}

// 组件中使用
const { message } = App.useApp();
const { doSomething } = useMyHook({ message });
```

## Type Definitions

需要导入的类型：

```tsx
import type { MessageInstance } from 'antd/es/message/interface';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';
import type { NotificationInstance } from 'antd/es/notification/interface';
```

## Migration Checklist

对于每个需要迁移的文件：

1. [ ] 确认组件在 `<App>` 组件树内
2. [ ] 移除 `import { message } from 'antd'`
3. [ ] 确保已导入 `App` 组件
4. [ ] 在组件内添加 `const { message } = App.useApp()`
5. [ ] 验证所有 message 调用位置
6. [ ] 运行构建确认无类型错误
