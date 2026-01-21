# Change: 项目列表界面优化与代码重构

## Why
当前项目列表界面占用空间过多，视觉效果不够简洁。App.tsx 组件约900行代码过于臃肿，components 目录有45+组件缺乏分类，不利于维护和理解。

## What Changes

### UI 优化
- 移除项目卡片的封面图，改为简洁的列表/卡片形式
- 新建按钮改为简洁风格，移至头部位置（无项目时不展示）
- 压缩头部标题和搜索区域的空间占用
- 项目列表为空时，显示横贯的创建项目按钮
- 优化整体列表布局

### 代码重构
- **App.tsx 拆分**: 将 900 行的 App.tsx 拆分为多个子组件，保持逻辑和样式不变
- **Components 目录重组**: 按功能模块划分组件目录
  - `common/` - 公共组件（WindowControls, TaskStatusBar 等）
  - `project/` - 项目管理相关（ProjectList, ProjectOverview, CreateProjectModal 等）
  - `editor/` - 编辑器相关（已存在，保持）
  - `asset/` - 资产管理相关（AssetManager, CharacterDetailModal 等）
  - `storyboard/` - 分镜相关（Storyboard, ShotListEditor 等）
  - `settings/` - 设置相关（SettingsPage, *ConfigManager 等）

## Impact
- Affected specs: `ui-style`
- Affected code:
  - `frontend/src/App.tsx`
  - `frontend/src/components/ProjectList.tsx`
  - `frontend/src/components/*` (目录重组)
  - 所有引用这些组件的 import 路径
