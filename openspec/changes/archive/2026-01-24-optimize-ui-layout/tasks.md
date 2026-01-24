# Tasks: optimize-ui-layout

## Phase 1: 修复代码错误

### Task 1.1: 修复 Antd v6 废弃 API
- [x] `StoryboardToolbar.tsx`: 修复 Divider `type="vertical"` 警告 -> 替换为 Tailwind div
- [x] `SettingsPage.tsx`: 检查 Divider `titlePlacement` 属性 -> 改为 `orientation`
- [x] 检查其他组件是否有 Antd 废弃 API

### Task 1.2: 修复组件导入错误
- [x] `ShotCard.tsx`: 移除 Typography.TextArea 解构 -> 改为从 Input 导入
- [x] `Storyboard.tsx`: 修复 Space `orientation` 改为 `direction`

## Phase 2: 优化分镜编辑器布局

### Task 2.1: 移除冗余表头
- [x] `ShotListEditor.tsx`: 移除 `.shotListHeader` 区域（与 ShotCard 布局不一致）
- [x] 添加简洁的全选行替代原表头
- [x] 更新 `ShotListEditor.css`：删除表头样式，添加全选行样式

### Task 2.2: 优化 ShotCard 布局
- [x] 调整 grid 列比例从 `2fr 3fr 4fr` 到 `minmax(200px, 3fr) minmax(240px, 4fr) minmax(280px, 4fr)`
- [x] 设置最小列宽防止内容挤压
- [x] 优化提示词编辑器高度（min-height: 150px, max-height: 300px）

### Task 2.3: 优化卡片样式
- [x] 统一边框和间距（已有良好样式）
- [x] 改进悬停和选中状态（已有样式）

## Phase 3: 优化设置页面

### Task 3.1: 修复设置页布局
- [x] 移除 `maxHeight: calc(100vh - 280px)` 硬编码
- [x] 使用 flex 布局让内容自适应

## Phase 4: 优化视频编辑器

### Task 4.1: 抽取内联样式
- [x] `SimpleEditor.tsx`: 使用 CSS 变量替换硬编码颜色
- [x] 素材面板宽度改为 `clamp(220px, 20vw, 320px)`
- [x] 时间线高度改为 `clamp(200px, 30vh, 400px)`

### Task 4.2: 改进布局灵活性
- [x] 素材面板宽度改为 clamp()
- [ ] 时间线高度支持拖拽调整（可选，暂不实现）

## Phase 5: 建立设计 Token

### Task 5.1: 添加 CSS 变量
- [x] 在 `index.css` 添加颜色变量
- [x] 在 `index.css` 添加间距变量
- [x] 添加兼容变量别名供内联样式使用

### Task 5.2: 统一组件样式
- [x] 更新主要组件使用 CSS 变量（SimpleEditor 已使用）
- [x] 确保 Antd 主题配置与变量一致

## 验证

### 手动测试
- [ ] 分镜编辑器：检查布局在不同窗口宽度下的表现
- [ ] 设置页面：检查所有 Tab 内容显示正常
- [ ] 视频编辑器：检查素材面板、播放器、时间线比例
- [ ] 确认无 console 警告

### 回归测试
- [ ] 项目列表功能正常
- [ ] 资产管理功能正常
- [ ] 导出功能正常
