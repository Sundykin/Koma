# 布局优化计划：沉浸式工作台布局

## 概述
将 Koma 从传统管理后台模式重构为专业的 IDE 工作台模式，提升空间利用率和专业感。

## 组件结构

```
App Container
└── StudioLayout
    ├── Sidebar (80px Fixed) - 自定义导航
    └── Main Area
        ├── Compact Header (48px)
        └── Workspace Container
            ├── View: Projects → Project List (Fluid Grid)
            └── View: Editor → Studio Workspace (3-Column)
                ├── Left Panel (260px): 分集列表 + 设置入口
                ├── Center Stage (flex-1): 剧本/分镜编辑器
                └── Right Panel (380px): 资产面板
```

## 尺寸规格

### Sidebar
- **宽度**: 80px (从 64px 增加)
- **Item Size**: 48x48px 触发区
- **Icon**: 24px
- **Active Indicator**: 左侧 3px 宽竖条，高度 24px

### 工作台三栏布局
| 区域 | 宽度 | 内容 | 响应式 |
|------|------|------|--------|
| 左栏 | 260px | 分集列表、设置入口 | 可折叠 |
| 中栏 | flex-1 | 剧本/分镜编辑器 | 自适应 |
| 右栏 | 380px | 资产面板 | 可折叠 |

### AI 分镜卡片布局
- 剧本: flex-[1.5] (15%)
- 文生图提示词: flex-[2] (20%)
- 参考图: flex-[1.5] (15%)
- 图生视频提示词: flex-[2] (20%)
- 视频结果: flex-[2] (20%)

### 资产列表
- 左侧宽度: 360-400px (从 320px 增加)
- 缩略图: 80px 或 16:9 比例 (从 48px 增加)

---

## 实施阶段

### Phase 1: Sidebar 重构 ⭐ 优先
**目标**: 移除 Antd Menu，使用自定义 Flex 布局

**文件**:
- `frontend/src/components/common/Sidebar.tsx`

**变更**:
1. 移除 antd Menu 组件依赖
2. 实现 Flex 布局自定义导航
3. 宽度从 w-16 (64px) 改为 w-20 (80px)
4. Active 状态: 左侧竖条 + 图标高亮 + 发光效果
5. Logo 区域紧凑化

---

### Phase 2: 项目列表页释放
**目标**: 解决大屏空间浪费

**文件**:
- `frontend/src/components/project/ProjectList.tsx`

**变更**:
1. 移除 `max-w-6xl` 限制
2. 使用 `w-full px-6`
3. Grid 大屏支持更多列 `2xl:grid-cols-5`

---

### Phase 3: 核心工作台重构 ⭐ 重点
**目标**: 实现三栏式沉浸布局

**文件**:
- `frontend/src/components/project/ProjectOverview.tsx`
- 新建 `frontend/src/components/project/StudioWorkspace.tsx`

**变更**:
1. 移除顶层 Tabs
2. 构建 Flex 三栏结构 (Left/Center/Right)
3. 添加面板折叠状态管理
4. 项目设置改为 Drawer/Modal 触发

---

### Phase 4: 资产面板网格化
**目标**: 提升素材浏览体验

**文件**:
- `frontend/src/components/project/ProjectAssetOverview.tsx`
- `frontend/src/components/asset/AssetListPanel.tsx`
- `frontend/src/components/asset/AssetManager.css`

**变更**:
1. 列表项改为卡片式布局
2. 图片尺寸 48px → 80px
3. 布局改为 `grid grid-cols-2 gap-2`
4. 左侧宽度 320px → 380px

---

### Phase 5: 分镜卡片自适应
**目标**: 解决高度对齐和比例问题

**文件**:
- `frontend/src/components/storyboard/ShotCard.tsx`
- `frontend/src/components/storyboard/ShotCard.css`

**变更**:
1. `.shot-card-body`: Grid → Flex (align-items: stretch)
2. `.shot-column`: 移除固定宽度，使用 flex 比例
3. `.prompt-editor-container`: 移除 min/max height，使用 flex: 1
4. 内部编辑器高度 100%

---

## 预期效果
- 大屏空间利用率提升 30%+
- 导航层级清晰，无双层 Tab 冲突
- 专业工具感，对标 Premiere/DaVinci
- 资产浏览效率提升
