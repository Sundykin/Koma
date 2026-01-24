# Proposal: optimize-ui-layout

## Summary

全面优化项目 UI 布局和样式，解决当前存在的布局不合理问题，提升用户体验和视觉一致性。使用 /frontend-design 技术创建高效、可用的样式系统。

## Motivation

通过代码分析发现以下布局和样式问题：

### 1. 代码错误和废弃 API
- **StoryboardToolbar.tsx:116** - 使用了废弃的 `Divider` 的 `type="vertical"` 属性（Antd v6 应改用 `variant="vertical"` 或直接设置样式）
- **ShotCard.tsx:28** - 从 Typography 解构 TextArea 但 Typography 没有 TextArea（应从 Input 导入）
- **Storyboard.tsx:878** - 使用 `<Space orientation="vertical">` 但 Space 组件没有 orientation 属性（应使用 `direction="vertical"`）

### 2. 分镜编辑器布局问题
- **ShotCard.tsx** - 三列布局比例 `2fr 3fr 4fr` 不太合理，导致剧本列太窄
- **ShotListEditor.tsx** - 同时存在表头区域和 ShotCard 组件，但表头与卡片布局不对应，造成视觉混乱
- 提示词编辑器高度固定 200px，在不同屏幕尺寸下可能不够灵活

### 3. 设置页面布局
- **SettingsPage.tsx** - Prompt 模板区域使用 `maxHeight: calc(100vh - 280px)` 硬编码，可能导致不同屏幕下显示问题
- Divider 使用 `titlePlacement` 属性可能不存在（应检查 Antd v6 API）

### 4. 项目列表页面
- **ProjectList.tsx** - 混合使用 Tailwind CSS 和 Antd，样式不够统一
- 搜索框和筛选器在小屏幕下可能挤压

### 5. 视频编辑器布局
- **SimpleEditor.tsx** - 使用内联样式而非 CSS 类，难以维护
- 素材面板宽度硬编码 280px，不够灵活
- 时间线高度固定 300px

### 6. 样式系统问题
- Tailwind CSS 和 Antd 混用，缺乏统一的设计 token
- 部分组件使用 CSS 文件，部分使用内联样式，不一致
- 缺少响应式设计考虑

## Scope

### In Scope
1. 修复所有 Antd v6 废弃 API 警告
2. 修复组件导入错误
3. 优化分镜编辑器布局
4. 统一样式系统（Tailwind + Antd token）
5. 改进响应式布局
6. 优化视频编辑器布局

### Out of Scope
- 功能逻辑变更
- 新增功能
- 数据结构变更

## Approach

采用 /frontend-design 设计原则：
1. **统一设计语言** - 建立 CSS 变量系统，统一颜色、间距、圆角等
2. **组件化样式** - 将样式抽取到 CSS 模块，减少内联样式
3. **响应式优先** - 使用 Tailwind 的响应式类
4. **渐进增强** - 逐步优化，不破坏现有功能

## Files Affected

- `frontend/src/components/storyboard/StoryboardToolbar.tsx`
- `frontend/src/components/storyboard/ShotCard.tsx`
- `frontend/src/components/storyboard/ShotCard.css`
- `frontend/src/components/storyboard/Storyboard.tsx`
- `frontend/src/components/storyboard/ShotListEditor.tsx`
- `frontend/src/components/storyboard/ShotListEditor.css`
- `frontend/src/components/settings/SettingsPage.tsx`
- `frontend/src/components/editor/SimpleEditor.tsx`
- `frontend/src/index.css` (新增设计 token)

## Risks

- 样式变更可能影响现有 UI 外观
- Antd 组件属性修改可能需要测试兼容性

## Related Changes

- `2026-01-23-fix-antd-deprecations` (部分重叠)
- `2026-01-21-refactor-project-ui`
