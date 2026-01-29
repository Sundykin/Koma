# UI 重构实施计划

基于 pencil 设计稿的语义化 Token 渐进式重构方案。

## 设计规范

### Design Tokens
| Token | 值 | 用途 |
|-------|-----|------|
| --bg-app | #09090b | 最深背景 (zinc-950) |
| --bg-surface | #18181b | 侧边栏/表面 (zinc-900) |
| --bg-elevated | #27272a | 悬浮/弹窗 (zinc-800) |
| --bg-card | #18181b | 卡片背景 (zinc-900) |
| --border | #3f3f46 | 主边框 (zinc-700) |
| --border-subtle | #27272a | 次级边框 (zinc-800) |
| --text-primary | #f4f4f5 | 主文字 (zinc-100) |
| --text-secondary | #a1a1aa | 次文字 (zinc-400) |
| --text-muted | #52525b | 弱文字 (zinc-600) |
| --accent | #10b981 | 主题色 (emerald-500) |

### 布局规范
- Sidebar: **72px** (当前 80px)
- ProjectList Toolbar: **56px**
- ProjectOverview HeaderBar: **64px**
- EpisodePanel: **360px**, AssetPanel: **340px**
- EditorView AnalysisSidebar: **320px** (当前 w-80=320px ✓)
- SettingsPage SettingsSidebar: **240px**, ContentHeader: **56px**

---

## 实施步骤

### Step 1: Token 配置
- **文件**: `src/index.css`
- **修改**: 确认 CSS 变量与设计稿一致（当前基本一致）
- **新增**: 添加布局相关变量
  ```css
  --sidebar-width: 72px;
  --header-height: 56px;
  --header-height-lg: 64px;
  ```

### Step 2: Sidebar 组件
- **文件**: `src/components/common/Sidebar.tsx`
- **修改**:
  - 宽度: `w-20` (80px) → `w-[72px]`
  - 背景: 保持 `bg-zinc-950`
  - Logo: 保持 40x40
  - Nav Item: 保持 48x48

### Step 3: ProjectList 页面
- **文件**: `src/components/project/ProjectList.tsx`
- **修改**:
  - Toolbar 高度: 确认 `h-14` (56px) ✓
  - 搜索栏样式统一

### Step 4: ProjectOverview 页面
- **文件**:
  - `src/components/project/ProjectOverview.tsx`
  - `src/components/project/EpisodeManager.tsx`
  - `src/components/project/ProjectAssetOverview.tsx`
- **修改**:
  - HeaderBar: 确认 `h-16` (64px) ✓
  - EpisodePanel: 确认 `w-[360px]` ✓
  - AssetPanel: 确认 `w-[340px]` ✓

### Step 5: EditorView 页面
- **文件**: `src/components/editor/EditorView.tsx`
- **修改**:
  - AnalysisSidebar: 确认 `w-80` (320px) ✓
  - StepNavigator 样式统一

### Step 6: SettingsPage 页面
- **文件**: `src/components/settings/SettingsPage.tsx`
- **修改**:
  - SettingsSidebar: 确认 `width={240}` ✓
  - ContentHeader: 确认 `h-14` (56px) ✓

---

## 验收标准
1. Sidebar 宽度为 72px
2. 所有页面边框颜色使用 border-zinc-800 (--border-subtle)
3. 背景层级: zinc-950 > zinc-900 > zinc-800
4. 头部高度: 列表页 56px, 编辑器 64px
5. 面板宽度符合设计稿规范
