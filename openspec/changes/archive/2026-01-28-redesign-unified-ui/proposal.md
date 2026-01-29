# Change: 统一 UI 设计重构 - Header 融合与组件现代化

## Why
当前应用存在以下设计问题：
1. **Header 与页面内容割裂**：Header 固定占用大量垂直空间（约 120px），与各页面功能脱节
2. **风格不统一**：各页面（ProjectList、Editor、Settings）样式差异明显，缺乏设计系统约束
3. **空间利用率低**：导航区域冗余，面包屑+步骤导航+任务状态栏分三层堆叠
4. **组件复用不足**：按钮、卡片、输入框等基础组件未统一，每个页面自行实现

## What Changes

### 1. Header 重构 - 与页面功能融合
- **BREAKING**: 移除独立的 Header 组件，将导航嵌入各页面上下文
- 面包屑导航集成到 Sidebar 顶部或页面标题区
- StepNavigator 仅在编辑器视图显示，紧贴内容区顶部
- TaskStatusBar 改为悬浮提示或底部状态栏

### 2. 组件系统标准化
- 基于 pencil-new.pen 设计稿统一按钮系列（Primary/Secondary/Ghost/Icon）
- 统一 Input、Card、Modal 组件样式
- 引入设计 Token（变量）保证颜色、间距、圆角一致

### 3. 页面布局重构
- **ProjectList**: 简化顶部筛选，卡片紧凑化
- **ProjectOverview**: 三栏布局微调，标题栏精简
- **EditorView**: 步骤导航与工作区无缝衔接
- **SettingsPage**: 保持侧边导航模式，内容区精简

### 4. 设计稿同步
- 使用 MCP Pencil 工具更新 pencil-new.pen
- 为每个核心页面创建设计组件

## Impact

### Affected Specs
- `ui-layout` - 布局结构变更
- `ui-components` - 组件样式标准化
- `ui-style` - 设计 Token 更新

### Affected Code
- `frontend/src/components/common/Header.tsx` - 重构或移除
- `frontend/src/components/common/Sidebar.tsx` - 增强导航能力
- `frontend/src/components/common/StepNavigator.tsx` - 嵌入式改造
- `frontend/src/components/project/ProjectList.tsx` - 页面重构
- `frontend/src/components/project/ProjectOverview.tsx` - 标题栏融合
- `frontend/src/components/editor/EditorView.tsx` - 布局调整
- `frontend/src/components/settings/SettingsPage.tsx` - 样式统一
- `frontend/src/App.tsx` - 移除顶层 Header 引用

### Design Files
- `pencil-new.pen` - 新增页面设计稿

## Migration Notes
- 渐进式重构：先更新组件库，再逐页面替换
- 保留原有功能，仅调整布局与样式
