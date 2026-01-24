# Design: optimize-ui-layout

## Architecture Overview

本次优化采用分层设计，从底层 token 到上层组件逐步统一样式系统。

```
┌─────────────────────────────────────────────────────────┐
│                    Components Layer                      │
│  (StoryboardToolbar, ShotCard, SettingsPage, etc.)      │
├─────────────────────────────────────────────────────────┤
│                    CSS Modules Layer                     │
│  (*.css files with scoped styles)                       │
├─────────────────────────────────────────────────────────┤
│                    Design Tokens Layer                   │
│  (CSS Variables + Tailwind Theme + Antd Theme)          │
└─────────────────────────────────────────────────────────┘
```

## Design Tokens

### 颜色系统 (基于 Zinc 色板)
```css
:root {
  /* 背景色 */
  --bg-base: #09090b;      /* 最深背景 */
  --bg-raised: #18181b;    /* 卡片背景 */
  --bg-surface: #27272a;   /* 表面背景 */
  --bg-hover: #3f3f46;     /* 悬停背景 */

  /* 边框色 */
  --border-default: #27272a;
  --border-hover: #3f3f46;
  --border-focus: #10b981;

  /* 文字色 */
  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;

  /* 主题色 */
  --accent: #10b981;
  --accent-hover: #059669;
}
```

### 间距系统
```css
:root {
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
}
```

## 分镜编辑器布局优化

### 当前问题
```
┌──────────────────────────────────────────────────────────┐
│ 表头 (shotListHeader) - 与 ShotCard 布局不对应            │
├──────────────────────────────────────────────────────────┤
│ ShotCard (grid: 2fr 3fr 4fr)                             │
│ ┌─────────┬───────────────┬────────────────────────────┐ │
│ │ 剧本    │ 提示词        │ 媒体 (图片 + 视频)         │ │
│ │ (2fr)   │ (3fr)         │ (4fr)                      │ │
│ │ 太窄！  │               │                            │ │
│ └─────────┴───────────────┴────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 优化方案
1. **移除冗余表头** - ShotListEditor 的表头与 ShotCard 布局不一致，移除表头
2. **调整列比例** - 改为 `3fr 4fr 4fr` 或使用固定宽度组合
3. **添加响应式断点** - 在小屏幕下改为两列或单列

```
┌──────────────────────────────────────────────────────────┐
│ ShotCard (优化后)                                         │
│ ┌───────────────┬─────────────────┬────────────────────┐ │
│ │ 剧本 (3fr)    │ 提示词 (4fr)    │ 媒体 (4fr)         │ │
│ │ min-w: 200px  │ min-w: 240px    │ min-w: 280px       │ │
│ └───────────────┴─────────────────┴────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## 视频编辑器布局优化

### 当前问题
- 使用内联样式，硬编码尺寸
- 不支持响应式

### 优化方案
```css
.editorContainer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editorUpper {
  flex: 1;
  display: flex;
  min-height: 300px;
}

.assetPanel {
  width: clamp(220px, 20vw, 320px);
  flex-shrink: 0;
}

.timelineArea {
  height: clamp(200px, 30vh, 400px);
  flex-shrink: 0;
}
```

## Antd v6 API 修复

### Divider
```tsx
// Before (deprecated)
<Divider type="vertical" />

// After
<Divider style={{ borderInlineStart: '1px solid #27272a' }} />
// 或使用 Tailwind
<div className="w-px h-4 bg-zinc-700" />
```

### Space
```tsx
// Before (wrong)
<Space orientation="vertical">

// After
<Space direction="vertical">
```

### Modal
```tsx
// Before (deprecated in v6)
destroyOnClose={true}

// After
destroyOnHidden={true}
```

## Trade-offs

### 选项 A: 全面 CSS Modules 化
- 优点：样式完全隔离，易于维护
- 缺点：需要大量重构，工作量大

### 选项 B: 保持现有结构，仅修复问题（推荐）
- 优点：风险低，改动小
- 缺点：不彻底，未来可能需要再次重构

### 选项 C: 迁移到 CSS-in-JS
- 优点：类型安全，动态样式
- 缺点：需要引入新依赖，学习成本

**选择方案 B**：最小化修改，优先修复错误和明显的布局问题。

## Implementation Notes

1. 先修复代码错误（废弃 API、错误导入）
2. 再优化布局比例
3. 最后添加设计 token
4. 每步变更后手动测试 UI
