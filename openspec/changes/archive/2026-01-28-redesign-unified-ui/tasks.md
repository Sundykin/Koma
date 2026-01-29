# Tasks: 统一 UI 设计重构

## 1. 设计稿准备 (Pencil MCP)
- [x] 1.1 在 pencil-new.pen 创建 Page/ProjectList 设计稿 (nTxgi)
- [x] 1.2 在 pencil-new.pen 创建 Page/ProjectOverview 设计稿 (DDUVa)
- [x] 1.3 在 pencil-new.pen 创建 Page/EditorView 设计稿（含嵌入式 StepNavigator）(fTK17)
- [x] 1.4 在 pencil-new.pen 创建 Page/SettingsPage 设计稿 (GIi7a)
- [x] 1.5 更新 Component/StepNavigator 组件（紧凑模式）- 已有 wdgGa
- [x] 1.6 新增 Component/PageHeader 组件 - 各页面已内置上下文标题栏

## 2. 组件库标准化 (已有组件)
- [x] 2.1 创建 Button 组件变体 - xhFwl(Primary), UBB0z(Secondary), PURyl(Ghost), JxN1m(Icon)
- [x] 2.2 创建 Input 组件 - Y6UMe (带图标/标签变体)
- [x] 2.3 创建 Card 组件 - 34jZa(ProjectCard), h3QVr(ShotCard), gmRUe(CharacterCard), aF9st(SceneCard)
- [x] 2.4 创建 Modal 组件 - zNMoh
- [x] 2.5 定义 CSS 变量映射 - 已定义 19 个设计 Token

## 3. Header 重构
- [x] 3.1 移除 App.tsx 中独立 Header 渲染
- [x] 3.2 将面包屑导航嵌入 Sidebar 或各页面标题区
- [x] 3.3 重构 StepNavigator 为页面内嵌组件
- [x] 3.4 将 TaskStatusBar 改为底部悬浮或右下角通知

## 4. 页面重构 - ProjectList
- [x] 4.1 移除页面内重复 Header
- [x] 4.2 简化搜索筛选栏（合并为单行工具栏）
- [x] 4.3 更新 ProjectCard 样式匹配设计稿
- [x] 4.4 优化空状态展示

## 5. 页面重构 - ProjectOverview
- [x] 5.1 精简顶部标题栏（移除冗余标签）
- [x] 5.2 统一三栏面板头部样式
- [x] 5.3 优化剧集列表项样式

## 6. 页面重构 - EditorView
- [x] 6.1 嵌入紧凑版 StepNavigator
- [x] 6.2 统一 Script/Assets/Storyboard/Video 各 Tab 样式
- [x] 6.3 优化侧边栏分析概览面板

## 7. 页面重构 - SettingsPage
- [x] 7.1 统一侧边菜单与内容区样式
- [x] 7.2 精简页面顶部标题栏
- [x] 7.3 卡片组件样式统一

## 8. 验收测试
- [x] 8.1 截图对比设计稿与实现效果
- [ ] 8.2 验证各页面响应式表现
- [ ] 8.3 验证暗色主题一致性
