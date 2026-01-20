# Design: UI Style Optimization

## 1. Design Philosophy

### 1.1 Aesthetic Direction: **Cinematic Studio**
这不是一个普通的暗色主题。我们要创造一个**电影级后期制作工作室**的沉浸感：

- **氛围**：像 DaVinci Resolve、Final Cut Pro 的专业感，但更有温度
- **Tone**：**Refined Industrial** - 工业的冷峻 + 精致的细节
- **记忆点**：深邃的墨绿色光晕，像电影片场的监视器发出的微光

### 1.2 Core Principles
1. **Content First** - UI 退居幕后，剧本和画面是主角
2. **Depth Through Subtlety** - 用微妙的层次感创造空间深度，而非生硬的边框
3. **Cinematic Accents** - 翠绿色不是装饰，而是"录制中"的信号灯
4. **Professional Warmth** - 虽然专业，但不冰冷；Zinc 灰带着一丝温暖

### 1.3 Typography Direction
- **Display Font**: 考虑引入 **Geist** 或 **Plus Jakarta Sans** 替代默认
- **Mono Font**: **JetBrains Mono** 用于代码/技术元素
- **中文**: 保持系统默认，确保渲染清晰

We will adopt a **Zinc-based** neutral palette for the structure, with **Emerald Green** as the primary accent color to maintain brand identity.

## 2. Layout & Spacing System

### 2.1 间距尺度 (8px Grid System)
采用 8px 基准网格，确保所有间距都是 8 的倍数：

| Token | 值 | Tailwind | 用途 |
|-------|-----|----------|------|
| `--space-1` | 4px | `p-1` | 紧凑元素内间距 |
| `--space-2` | 8px | `p-2` | 图标与文字间距 |
| `--space-3` | 12px | `p-3` | 按钮内边距 |
| `--space-4` | 16px | `p-4` | 卡片内边距 |
| `--space-5` | 20px | `p-5` | 区块内边距 |
| `--space-6` | 24px | `p-6` | 页面边距 |
| `--space-8` | 32px | `p-8` | 大区块间距 |

### 2.2 布局问题诊断

#### 当前问题：
1. **间距不一致**：
   - `SettingsPage`: 使用 `padding: 24` (正确)
   - `ProjectList`: `p-8` = 32px (偏大)
   - `App.tsx` 主内容区：部分 `p-4`，部分 `p-5` (不统一)

2. **内联样式泛滥**：
   - `SettingsPage` 大量 `style={{ padding: 16 }}`
   - `ProjectOverview` Card 使用内联 style
   - 应改为 Tailwind 类名

3. **最大宽度不统一**：
   - `SettingsPage`: `maxWidth: 900`
   - `ProjectList`: `max-w-7xl` (1280px)
   - 需要统一容器宽度策略

4. **网格列数问题**：
   - `ProjectList`: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
   - 卡片在大屏上可能过小

### 2.3 统一布局规范

```
┌─────────────────────────────────────────────────────────────┐
│ Window Controls (h-8, bg-zinc-950)                          │
├──────────┬──────────────────────────────────────────────────┤
│          │ Header (h-16, bg-zinc-900/80)                    │
│ Sidebar  ├──────────────────────────────────────────────────┤
│ w-64     │ [Step Navigator if editor] (h-14)                │
│ or w-16  ├──────────────────────────────────────────────────┤
│          │                                                  │
│          │   Main Content                                   │
│          │   max-w-7xl mx-auto                              │
│          │   px-6 py-6                                      │
│          │                                                  │
│          │   ┌─────────────────────────────────────────┐    │
│          │   │ Content Card                            │    │
│          │   │ p-6, rounded-xl                         │    │
│          │   └─────────────────────────────────────────┘    │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### 2.4 Container Width 策略

| 视图 | 容器宽度 | 原因 |
|-----|---------|------|
| 项目列表 | `max-w-7xl` (1280px) | 网格需要宽度 |
| 设置页面 | `max-w-4xl` (896px) | 表单阅读舒适 |
| 编辑器 | 无限制 (全宽) | 最大化内容空间 |
| 项目概览 | `max-w-7xl` | 两栏布局 |

### 2.5 响应式断点

```css
/* Tailwind 默认断点 */
sm: 640px   /* 手机横屏 */
md: 768px   /* 平板 */
lg: 1024px  /* 小桌面 */
xl: 1280px  /* 桌面 */
2xl: 1536px /* 大屏 */
```

### 2.6 网格系统

**项目卡片网格**:
```jsx
// 当前
grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
// 优化后 - 更合理的断点
grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5
gap-6  // 统一使用 24px 间距
```

**两栏布局** (ProjectOverview):
```jsx
// 当前
grid grid-cols-2 gap-4
// 优化后 - 响应式
grid grid-cols-1 lg:grid-cols-2 gap-6
```

### 2.7 对齐原则

1. **垂直节奏**：相同层级的元素使用相同间距
2. **视觉层级**：通过间距大小体现内容层级
3. **边缘对齐**：所有内容左对齐，避免居中泛滥
4. **呼吸空间**：重要操作区域周围留足空白

## 3. Color System

### 3.1 Base Palette (Tailwind CSS "Zinc")
We will strictly utilize the Tailwind `zinc` scale for all grays to ensure neutrality without feeling dead (blue-gray tints).

| 语义角色 | Tailwind Class | Hex值 | 替换目标 |
|---------|---------------|-------|---------|
| App Base | `bg-zinc-950` | `#09090b` | `#0f0f0f` |
| Surface | `bg-zinc-900` | `#18181b` | `#141414`, `#121212` |
| Card/Elevated | `bg-zinc-900` | `#18181b` | `#1a1a1a` |
| Border | `border-zinc-800` | `#27272a` | `border-gray-800` |
| Hover | `hover:bg-zinc-800` | `#27272a` | - |

### 2.2 Typography
- **Primary Text**: `text-zinc-100` (`#f4f4f5`)
- **Secondary Text**: `text-zinc-400` (`#a1a1aa`)
- **Muted/Disabled**: `text-zinc-600` (`#52525b`)
- **Accent Text**: `text-emerald-400` or `text-emerald-500`

### 2.3 Primary Accent
- **Primary Color**: `emerald-600` (`#059669`)
- **Primary Hover**: `emerald-500` (`#10b981`)
- **Focus Rings**: `ring-emerald-500/50`

## 3. Layout & Structure

### 3.1 Sidebar
- **Width**: `w-64` (expanded) / `w-16` (collapsed).
- **Behavior**: Smooth CSS width transition (`transition-all duration-300 ease-in-out`).
- **Styling**: `bg-zinc-900 border-r border-zinc-800`.
- **Navigation Items**:
    - Default: `text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50`.
    - Active: `text-emerald-400 bg-emerald-500/10 border-r-2 border-emerald-500`.

### 3.2 Header
- **Height**: `h-16`.
- **Styling**: `bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800`.
- **Breadcrumbs**: Subtle, interactive path elements using `zinc-500` > `zinc-200`.

### 3.3 Main Content Area
- **Background**: `bg-zinc-950`.
- **Padding**: Variable based on view (Project List: `p-8`, Editor: `p-0`).

## 4. Component Styles

### 4.1 Cards (Project List)
- **Container**: `bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden group relative`.
- **Hover Effect**: `hover:border-zinc-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300`.
- **Image**: Aspect ratio `16:9`, fitting `cover`.

### 4.2 Buttons
- **Primary**: `bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20`.
- **Secondary/Ghost**: `bg-transparent hover:bg-zinc-800 text-zinc-300`.
- **Destructive**: `text-red-400 hover:bg-red-500/10`.

### 4.3 Inputs & Forms
- **Background**: `bg-zinc-950`.
- **Border**: `border-zinc-800`.
- **Focus**: `border-emerald-500 ring-1 ring-emerald-500`.

## 5. Technical Implementation

### 5.1 CSS Variables (index.css)
定义语义化 CSS 变量，统一颜色管理：

```css
@theme {
  --color-bg-app: #09090b;       /* zinc-950 */
  --color-bg-surface: #18181b;   /* zinc-900 */
  --color-bg-elevated: #27272a;  /* zinc-800 */
  --color-border: #3f3f46;       /* zinc-700 */
  --color-border-subtle: #27272a; /* zinc-800 */
  --color-accent: #10b981;       /* emerald-500 */
}
```

### 5.2 Ant Design Config
Update the `ConfigProvider` token in `index.tsx` to match the Zinc palette:

```javascript
const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#10b981',      // emerald-500
    colorBgContainer: '#18181b',  // zinc-900
    colorBgElevated: '#27272a',   // zinc-800
    colorBorder: '#3f3f46',       // zinc-700
    colorText: '#f4f4f5',         // zinc-100
    colorTextSecondary: '#a1a1aa', // zinc-400
    borderRadius: 8,
  },
};
```

## 6. 硬编码颜色分布 (现状分析)

当前代码中存在大量硬编码十六进制颜色值，需要统一替换：

| 文件 | 硬编码值 | 替换为 |
|-----|---------|--------|
| `App.tsx` | `bg-[#141414]` | `bg-zinc-900` |
| `App.tsx` | `bg-[#0f0f0f]` | `bg-zinc-950` |
| `App.tsx` | `bg-[#121212]` | `bg-zinc-900` |
| `App.tsx` | `bg-[#1a1a1a]` | `bg-zinc-900` |
| `ProjectList.tsx` | `bg-[#0f0f0f]` | `bg-zinc-950` |
| `ProjectList.tsx` | `bg-[#1a1a1a]` | `bg-zinc-900` |
| `ProjectList.tsx` | `bg-[#141414]` | `bg-zinc-900` |
| `StepNavigator.tsx` | `bg-[#141414]` | `bg-zinc-900` |
| `StepNavigator.tsx` | `bg-[#1a1a1a]` | `bg-zinc-900` |
| `StepNavigator.tsx` | `bg-[#0f0f0f]` | `bg-zinc-950` |
| `ProjectOverview.tsx` | `bg-[#0f0f0f]` | `bg-zinc-950` |
| `ProjectOverview.tsx` | `#141414` (inline) | 移至 Tailwind |
| `WindowControls.tsx` | `bg-[#0f0f0f]` | `bg-zinc-950` |
| `TaskStatusBar.tsx` | `bg-[#1a1a1a]` | `bg-zinc-900` |
| `CreateProjectModal.tsx` | `bg-[#1a1a1a]` | `bg-zinc-900` |
| `ThemeSelector.tsx` | `bg-[#0f0f0f]`, `bg-[#1a1a1a]` | `bg-zinc-950`, `bg-zinc-900` |
| `ScriptEditor.tsx` | `#1a1a1a`, `#141414` | 使用 CSS 变量 |
| `*.css` files | 多处 `#0f0f0f`, `#141414`, `#1a1a1a` | CSS 变量 |

## 7. 边框颜色统一

当前使用 `border-gray-800`，建议统一替换为 `border-zinc-800`：
- `gray-800` = `#1f2937` (蓝灰色调)
- `zinc-800` = `#27272a` (纯中性灰)

这将消除微妙的蓝色调，使界面更加中性专业。

## 8. Visual Enhancement Ideas

### 8.1 Micro-interactions (高优先级)
```css
/* 卡片悬浮效果 - 精致的抬起感 */
.project-card {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.3s ease;
}
.project-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5),
              0 0 0 1px rgba(16, 185, 129, 0.1); /* 微妙的绿色边缘光 */
}

/* 侧边栏折叠 - 电影感过渡 */
.sidebar {
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.sidebar-content {
  transition: opacity 0.2s ease 0.1s; /* 延迟淡出，先收缩再隐藏 */
}
```

### 8.2 Atmospheric Effects
```css
/* 主内容区微妙渐变 - 像监视器的发光边缘 */
.main-content::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at top left,
    rgba(16, 185, 129, 0.03) 0%,
    transparent 50%
  );
  pointer-events: none;
}

/* 滚动阴影 - 增加深度感 */
.scroll-shadow-top {
  box-shadow: inset 0 12px 16px -12px rgba(0, 0, 0, 0.5);
}
```

### 8.3 Button States
```css
/* Primary 按钮 - 发光效果 */
.btn-primary {
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  box-shadow: 0 4px 14px -4px rgba(16, 185, 129, 0.4);
  transition: all 0.2s ease;
}
.btn-primary:hover {
  box-shadow: 0 6px 20px -4px rgba(16, 185, 129, 0.5);
  transform: translateY(-1px);
}
.btn-primary:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px -2px rgba(16, 185, 129, 0.4);
}
```

### 8.4 Focus States (Accessibility)
```css
/* 键盘焦点 - 可见但不突兀 */
:focus-visible {
  outline: 2px solid rgba(16, 185, 129, 0.5);
  outline-offset: 2px;
}
```

## 9. Component-Specific Enhancements

### 9.1 Project Cards
- **封面图**: 添加 `saturate(1.1) contrast(1.05)` 让缩略图更鲜艳
- **状态徽章**: 使用 `backdrop-blur-md` 创造毛玻璃效果
- **悬浮**: 边框渐变为 `border-emerald-500/30`

### 9.2 Step Navigator
- **进度线**: 从单色改为渐变 `from-emerald-600 to-emerald-400`
- **当前步骤**: 添加 `ring-4 ring-emerald-500/20` 呼吸光效
- **连接线**: 完成时动画填充，而非瞬间切换

### 9.3 Sidebar
- **导航项**: 选中态添加左侧 2px 绿色指示条
- **折叠按钮**: 隐藏在边缘，hover 时滑出
- **Logo**: 微妙的 `drop-shadow` 增加层次

### 9.4 Analysis Panel
- **角色卡**: 头像添加 `ring-2 ring-zinc-700` 边框
- **场景卡**: 时间指示器用 emoji 替代文字更直观
- **空状态**: 添加呼吸动画的图标
