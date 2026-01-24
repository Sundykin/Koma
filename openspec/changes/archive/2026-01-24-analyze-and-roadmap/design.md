# Design: Koma Studio 架构改进设计

## 1. Store 拆分方案

### 当前问题
```
store/
├── globalStore.ts    (30KB, 800+ 行)
└── projectStore.ts   (46KB, 1200+ 行)
```

### 目标结构
```
store/
├── ui/
│   ├── uiStore.ts        # 界面状态：view、sidebar、modal
│   └── editorStore.ts    # 编辑器状态：step、selection
├── settings/
│   └── settingsStore.ts  # 配置：LLM、TTI、ITV、TTS
├── project/
│   ├── projectStore.ts   # 项目元数据
│   ├── episodeStore.ts   # 分集管理
│   └── assetStore.ts     # 资产：角色、场景、道具
└── index.ts              # 统一导出
```

### 迁移策略
1. 新建拆分后的 store 文件
2. 从原 store 逐步迁移逻辑
3. 保留原 store 作为兼容层，内部调用新 store
4. 逐步替换组件中的引用
5. 最终删除兼容层

---

## 2. 撤销/重做系统设计

### Command 模式

```typescript
interface Command {
  execute(): void;
  undo(): void;
  description: string;
}

class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  execute(cmd: Command) { /* ... */ }
  undo() { /* ... */ }
  redo() { /* ... */ }
}
```

### 支持的操作
- 角色/场景/道具的增删改
- 分镜编辑
- 时间线片段操作

---

## 3. 错误边界设计

```tsx
// components/common/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```
