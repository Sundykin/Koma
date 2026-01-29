# UI 样式优化实施计划

基于 Codex + Gemini 双模型分析的综合实施方案。

## 已完成

### Phase 1: 主题系统重构 ✅
- [x] 创建 `src/theme/tokens.ts` - 集中设计令牌
- [x] 创建 `src/theme/antdTheme.ts` - Antd 主题配置（20+ 组件覆盖）
- [x] 更新 `src/index.tsx` 使用新主题模块
- [x] 添加浏览器 autofill 样式修复
- [x] 添加 Skeleton 骨架屏深色优化

### Phase 2: 通用组件样式统一 ✅
- [x] Sidebar.tsx - 已使用 CSS 变量 `w-[var(--sidebar-width)]`
- [x] WindowControls.tsx - 样式符合设计系统
- [x] StepNavigator.tsx - 修复 `gray-800` → `zinc-800`, `green-600` → `emerald-600`
- [x] TaskStatusBar.tsx - 样式符合设计系统

### Phase 3: 核心页面优化 ✅
- [x] ProjectList.tsx - 样式符合设计系统
- [x] ProjectOverview.tsx - 样式符合设计系统
- [x] EditorView.tsx - 修复 `green-600` → `emerald-600`, `green-500` → `emerald-500`
- [x] SettingsPage.tsx - 样式符合设计系统

### Phase 4: 复杂 CSS 区域 ✅
- [x] AssetManager.css - 修复多处非设计系统颜色:
  - `#0a0a0a` → `#09090b` (bg-app)
  - `#1f1f23` → `#18181b` (bg-surface)
  - `#141414` → `#09090b` (bg-app)
  - `#1f1f1f` → `#18181b` (bg-surface)
  - `#303030` → `#27272a` (border-subtle)
  - `#262626` → `#27272a` (bg-elevated)
  - `#424242` → `#3f3f46` (border)
- [x] Storyboard.css - 样式符合设计系统
- [x] ShotCard.css - 样式符合设计系统
- [x] EpisodeManager.tsx - 样式符合设计系统

## 设计规范

### Design Tokens
| Token | 值 | 用途 |
|-------|-----|------|
| --bg-app | #09090b | 最深背景 (zinc-950) |
| --bg-surface | #18181b | 侧边栏/表面 (zinc-900) |
| --bg-elevated | #27272a | 悬浮/弹窗 (zinc-800) |
| --border | #3f3f46 | 主边框 (zinc-700) |
| --border-subtle | #27272a | 次级边框 (zinc-800) |
| --text-primary | #f4f4f5 | 主文字 (zinc-100) |
| --text-secondary | #a1a1aa | 次文字 (zinc-400) |
| --accent | #10b981 | 主题色 (emerald-500) |

### 布局规范
- Sidebar: 72px (var(--sidebar-width))
- Header: 56px / 64px (var(--header-height), var(--header-height-lg))
- EpisodePanel: 360px
- AssetPanel: 340px
- EditorView AnalysisSidebar: 320px
- SettingsPage Sidebar: 240px

## 验收标准
1. ✅ Antd 组件使用统一主题令牌
2. ✅ 无 Antd 默认蓝色出现，全部替换为 Emerald 绿
3. ✅ 深色背景层次分明
4. ✅ 边框颜色统一
5. ✅ 聚焦状态清晰可见
6. ✅ 构建验证通过

## 新增文件
- `src/theme/tokens.ts` - 设计令牌
- `src/theme/antdTheme.ts` - Antd 主题配置
- `src/theme/index.ts` - 模块导出

## 修改文件
- `src/index.tsx` - 使用新主题模块
- `src/index.css` - 添加 autofill hack 和 skeleton 优化
- `src/components/common/StepNavigator.tsx` - 颜色统一
- `src/components/editor/EditorView.tsx` - 颜色统一
- `src/components/asset/AssetManager.css` - 颜色统一
