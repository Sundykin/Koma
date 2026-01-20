# UI Style Optimization Tasks

## Phase 1: 基础设施 - 主题配置

### 1.1 更新全局样式 (index.css)
- [ ] 添加 CSS 变量定义到 `@theme` 块
- [ ] 更新 body 样式使用 `bg-zinc-950 text-zinc-100`
- [ ] 更新滚动条样式 (Thumb: `zinc-700`, Track: `zinc-900`)

### 1.2 更新 Ant Design 主题 (index.tsx)
- [ ] 更新 `darkTheme.token` 配置匹配 Zinc/Emerald 色板
- [ ] 添加 `colorText` 和 `colorTextSecondary` token

---

## Phase 1.5: 布局规范统一

### 1.5.1 间距标准化
- [ ] 统一页面边距为 `p-6` (24px)
- [ ] 卡片内边距统一为 `p-6`
- [ ] 网格间距统一为 `gap-6`

### 1.5.2 容器宽度统一
- [ ] `ProjectList`: 保持 `max-w-7xl mx-auto`
- [ ] `SettingsPage`: `maxWidth: 900` → `max-w-4xl mx-auto` (className)
- [ ] `ProjectOverview`: 添加 `max-w-7xl mx-auto`

### 1.5.3 响应式网格优化
- [ ] `ProjectList` 网格: 添加 `md:grid-cols-3` 和 `2xl:grid-cols-5`
- [ ] `ProjectOverview` 两栏: `grid-cols-2` → `grid-cols-1 lg:grid-cols-2`

### 1.5.4 内联样式清理
- [ ] `SettingsPage`: 所有 `style={{ padding: 16 }}` → `className="p-4"`
- [ ] `ProjectOverview`: Card `style={{ background }}` → `className`
- [ ] `CharacterDetailModal`: 内联背景色 → className

---

## Phase 2: 核心布局 (App.tsx)

### 2.1 Sidebar 重构
- [ ] `bg-[#141414]` → `bg-zinc-900`
- [ ] `border-gray-800` → `border-zinc-800`
- [ ] 优化折叠动画透明度过渡
- [ ] Logo 容器和用户区域样式统一

### 2.2 Header 重构
- [ ] `bg-[#141414]` → `bg-zinc-900/80 backdrop-blur-md`
- [ ] 面包屑文字色彩调整 (inactive: `text-zinc-500`, active: `text-zinc-100`)

### 2.3 主内容区
- [ ] `bg-[#0f0f0f]` → `bg-zinc-950`
- [ ] 分析侧边栏 `bg-[#121212]` → `bg-zinc-900`
- [ ] 分析侧边栏内卡片 `bg-[#1a1a1a]` → `bg-zinc-900` 或使用更浅层级

---

## Phase 3: 关键组件优化

### 3.1 ProjectList.tsx
- [ ] 容器背景 `bg-[#0f0f0f]` → `bg-zinc-950`
- [ ] 粘性头部 `bg-[#0f0f0f]/95` → `bg-zinc-950/95`
- [ ] 搜索栏 `bg-[#1a1a1a]` → `bg-zinc-900`
- [ ] 新建卡片 `bg-[#141414]` → `bg-zinc-900`
- [ ] 项目卡片 `bg-[#1a1a1a]` → `bg-zinc-900`
- [ ] 渐变遮罩更新
- [ ] 边框 `border-gray-800` → `border-zinc-800`

### 3.2 StepNavigator.tsx
- [ ] 容器 `bg-[#141414]` → `bg-zinc-900`
- [ ] 步骤圆点 `bg-[#1a1a1a]` → `bg-zinc-900`
- [ ] 未激活状态 `bg-[#0f0f0f]` → `bg-zinc-950`

### 3.3 ProjectOverview.tsx
- [ ] 容器 `bg-[#0f0f0f]` → `bg-zinc-950`
- [ ] Card inline style `background: '#141414'` → 使用 className

### 3.4 WindowControls.tsx
- [ ] `bg-[#0f0f0f]` → `bg-zinc-950`

### 3.5 TaskStatusBar.tsx
- [ ] `bg-[#1a1a1a]` → `bg-zinc-900`

### 3.6 CreateProjectModal.tsx
- [ ] 模式选择按钮 `bg-[#1a1a1a]` → `bg-zinc-900`

### 3.7 ThemeSelector.tsx
- [ ] 所有 `bg-[#0f0f0f]` → `bg-zinc-950`
- [ ] 所有 `bg-[#1a1a1a]` → `bg-zinc-900`

---

## Phase 4: 编辑器组件

### 4.1 ScriptEditor.tsx
- [ ] inline style `backgroundColor: '#1a1a1a'` → CSS 变量或 prop
- [ ] inline style `backgroundColor: '#141414'` → CSS 变量或 prop

### 4.2 ProjectAssetOverview.tsx
- [ ] Card inline style `background: '#141414'` → className

### 4.3 CharacterDetailModal.tsx
- [ ] 多处 `background: '#1a1a1a'` inline style → 统一处理

---

## Phase 5: CSS 文件清理

### 5.1 AssetManager.css
- [ ] `background: #121212` → `var(--color-bg-surface)` 或 Tailwind class
- [ ] `background: #1a1a1a` → 统一替换

### 5.2 Storyboard.css
- [ ] `#0f0f0f`, `#141414`, `#1a1a1a` → CSS 变量

### 5.3 ShotListEditor.css
- [ ] 所有硬编码颜色 → CSS 变量

### 5.4 其他 CSS 文件
- [ ] `ImageCardGrid.css`
- [ ] `VideoCardGrid.css`
- [ ] `ReferenceImagePicker.css`
- [ ] `VideoVersionList.css`

---

## Phase 6: 边框颜色统一

### 6.1 全局替换
- [ ] 使用 find & replace: `border-gray-800` → `border-zinc-800`
- [ ] 验证替换后视觉一致性

---

## Phase 7: 验证与收尾

### 7.1 构建验证
- [ ] 运行 `npm run build` 确保无错误
- [ ] 检查 Tailwind 配置正确识别所有类名

### 7.2 视觉走查
- [ ] 项目列表页面：卡片、hover 效果、新建按钮
- [ ] 项目概览页面：分集管理、资产概览卡片
- [ ] 编辑器：剧本编辑、分析侧边栏
- [ ] 步骤导航：各状态样式
- [ ] 设置页面：表单、按钮

### 7.3 响应式检查
- [ ] 侧边栏折叠/展开过渡平滑
- [ ] 项目网格在不同尺寸下正确响应

---

## Phase 8: 视觉增强 (Optional - Polish)

### 8.1 Micro-interactions
- [ ] 项目卡片悬浮：精致抬起效果 (`translateY(-4px)` + 深邃阴影)
- [ ] 项目卡片边缘：hover 时微妙的绿色光晕
- [ ] 侧边栏折叠：优化 cubic-bezier 曲线，内容延迟淡出

### 8.2 Atmospheric Effects
- [ ] 主内容区：左上角微妙的绿色 radial-gradient 氛围光
- [ ] 滚动阴影：内容区顶部 inset shadow 增加深度

### 8.3 Button Enhancements
- [ ] Primary 按钮：渐变背景 + 发光阴影
- [ ] Hover 状态：微妙上移 + 阴影增强
- [ ] Active 状态：下压反馈

### 8.4 Component Polish
- [ ] 封面图：`saturate(1.1) contrast(1.05)` 滤镜增强
- [ ] 状态徽章：`backdrop-blur-md` 毛玻璃效果
- [ ] Step Navigator：进度线渐变 + 动画填充
- [ ] 当前步骤：呼吸光效 `ring-4 ring-emerald-500/20`
- [ ] 空状态图标：pulse 动画

---

## 文件修改清单 (按优先级)

| 优先级 | 文件 | 修改类型 |
|-------|------|---------|
| P0 | `index.css` | 添加 CSS 变量 |
| P0 | `index.tsx` | Ant Design 主题 |
| P1 | `App.tsx` | 布局核心 |
| P1 | `ProjectList.tsx` | 首屏组件 |
| P1 | `StepNavigator.tsx` | 编辑器核心 |
| P2 | `ProjectOverview.tsx` | 二级页面 |
| P2 | `WindowControls.tsx` | 标题栏 |
| P2 | `TaskStatusBar.tsx` | 状态栏 |
| P2 | `CreateProjectModal.tsx` | 弹窗 |
| P2 | `ThemeSelector.tsx` | 设置组件 |
| P3 | `ScriptEditor.tsx` | 编辑器 |
| P3 | `*.css` files | 样式清理 |

---

## 依赖关系

```
Phase 1 (基础设施)
    ↓
Phase 2 (核心布局) ← 可与 Phase 3 并行
    ↓
Phase 3 (关键组件)
    ↓
Phase 4 (编辑器组件) ← 可与 Phase 5 并行
    ↓
Phase 5 (CSS 清理)
    ↓
Phase 6 (边框统一)
    ↓
Phase 7 (验证)
    ↓
Phase 8 (视觉增强 - Optional)
```
