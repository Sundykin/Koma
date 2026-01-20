# UI Style Optimization Proposal

## 1. Background
The current UI implementation in `App.tsx` and related components utilizes a mix of hardcoded hex values (`#141414`, `#0f0f0f`, `#121212`, `#1a1a1a`) and ad-hoc styling. This results in visual inconsistencies and makes theme maintenance difficult. The application lacks a cohesive "Cinematic Dark Mode" feel that befits a video production tool.

### 1.1 现状问题
经过代码分析，发现以下问题：

1. **颜色碎片化**：4种不同的深色背景值混用
   - `#0f0f0f` - 最深背景（接近 zinc-950）
   - `#141414` - 侧边栏/表面（应为 zinc-900 #18181b）
   - `#121212` - 分析侧边栏（与 #141414 功能重复）
   - `#1a1a1a` - 卡片背景（应统一为 zinc-900）

2. **边框色调不统一**：使用 `border-gray-800` (#1f2937) 带有蓝灰色调，与 Zinc 中性灰不协调

3. **Inline Style 泛滥**：多个组件使用 `style={{ background: '#xxx' }}`，难以维护

4. **影响范围广**：涉及 20+ 文件，包括：
   - 核心布局：App.tsx, ProjectList.tsx, StepNavigator.tsx
   - 二级页面：ProjectOverview.tsx, SettingsPage
   - 弹窗组件：CreateProjectModal.tsx, CharacterDetailModal.tsx
   - 编辑器：ScriptEditor.tsx 及相关组件
   - 样式文件：8个 CSS 文件

## 2. Goals
- **Standardize Color Palette**: Migrate all hardcoded colors to a strict **Zinc + Emerald** Tailwind system defined in `design.md`.
- **Refine Layout Structure**: Improve the implementation of the main application shell (Sidebar, Header) for better responsiveness and animation quality.
- **Modernize Key Views**: specifically the Project List and Editor interfaces, adding professional polish through better spacing, typography, and micro-interactions.
- **Unify Component Library**: Align Ant Design tokens with our Tailwind palette for a seamless look.

## 3. Proposed Changes

### 3.1 Design System Implementation
-   **CSS Variables**: Define base theme variables in `index.css` (Tailwind v4) to map to semantic roles (e.g., `--bg-app` -> `zinc-950`).
-   **Ant Design Theme**: Update `frontend/src/index.tsx` to sync Ant Design's `ConfigProvider` with the new palette.

### 3.2 Global Layout (`App.tsx`)
-   Replace manual inline styles for sidebar width/color with Tailwind classes.
-   Implement a backdrop-blur effect for the header (`bg-zinc-900/80`).
-   Refine the sidebar collapse animation to handle content opacity smoothly.

### 3.3 Project List (`components/ProjectList.tsx`)
-   Redesign project cards to use `zinc-900` backgrounds with `border-zinc-800`.
-   Add hover lift and shadow effects (`hover:-translate-y-1`).
-   Improve the "Create New" card visualization.

### 3.4 Editor Experience (`editor/ScriptEditor.tsx`, `App.tsx`)
-   Remove hardcoded background colors in the script editor wrapper.
-   Style the "Smart Analysis" sidebar to match the main sidebar's aesthetic but with a distinct border separation.
-   Update status bars and tooltips to match the `zinc-800` elevated surface color.

## 4. Deliverables
-   Updated `index.css` with CSS variables and Tailwind theme config.
-   Updated `index.tsx` with Ant Design theme tokens.
-   Refactored `App.tsx` (Layout core).
-   Polished `ProjectList.tsx`, `StepNavigator.tsx`, `ProjectOverview.tsx`.
-   Cleaned CSS files with consistent color references.
-   Design verification in a "Cinematic" context.

## 5. Implementation Strategy

### 5.1 分阶段实施
1. **Phase 1 (P0)**: 基础设施 - 更新 index.css 和 index.tsx
2. **Phase 2 (P1)**: 核心布局 - App.tsx, ProjectList.tsx, StepNavigator.tsx
3. **Phase 3 (P2)**: 二级组件 - ProjectOverview, WindowControls, modals
4. **Phase 4 (P3)**: 编辑器和 CSS 文件清理
5. **Phase 5**: 边框统一和验证

### 5.2 风险控制
- 每个 Phase 完成后进行视觉验证
- 保持向后兼容，不改变功能逻辑
- CSS 变量作为后备，确保颜色一致性

## 6. Specs & Validation
-   **Spec**: `specs/ui-components/spec.md` (Update existing or create new delta).
-   **Validation**: Visual inspection of:
    1.  Dark theme consistency (no random gray mismatches).
    2.  Smooth sidebar transitions.
    3.  Responsive project grid.