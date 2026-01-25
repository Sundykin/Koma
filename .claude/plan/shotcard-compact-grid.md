# ShotCard Compact Grid 布局重构计划

## 需求概述
优化 AI 分镜表格布局:
1. 图像设计的参考图+提示词整体高度太高 → 参考图改为徽章+Popover
2. 资产选择从下拉改为卡片选择 → 头像网格+弹出选择器
3. 每行都有独立列头 → 提取为公共表格头部

## 方案选择
**方案 A: Compact Grid** - 用户已确认

## 文件结构变更

```
frontend/src/
├── constants/
│   └── storyboardConstants.ts       (新建: 布局常量)
├── components/
│   └── storyboard/
│       ├── ShotListHeader.tsx       (新建: 公共表头)
│       ├── components/
│       │   ├── AssetSelector.tsx    (新建: 资产卡片选择器)
│       │   └── ReferenceBadge.tsx   (新建: 参考图徽章)
│       ├── ShotCard.tsx             (修改: 移除列头,集成新组件)
│       └── ShotListEditor.tsx       (修改: 添加公共表头)
```

## 实施步骤

### Phase 1: 创建布局常量
**文件**: `frontend/src/constants/storyboardConstants.ts`
```typescript
export const SHOT_LAYOUT = {
  colScript: 'w-[15%] min-w-[150px]',
  colAssets: 'w-[15%] min-w-[150px]',
  colImageDesign: 'w-[20%] min-w-[200px]',
  colImageResult: 'w-[15%] min-w-[160px]',
  colVideoDesign: 'w-[20%] min-w-[200px]',
  colVideoResult: 'w-[15%] min-w-[160px]',
};
```

### Phase 2: 创建 ShotListHeader
**文件**: `frontend/src/components/storyboard/ShotListHeader.tsx`
- sticky 定位, z-20
- 使用 SHOT_LAYOUT 常量保证列宽同步
- 样式: bg-zinc-900/95 backdrop-blur border-b

### Phase 3: 创建 AssetSelector
**文件**: `frontend/src/components/storyboard/components/AssetSelector.tsx`
- 显示已选资产的头像 (Avatar 24px)
- "+" 按钮点击弹出 Popover
- Popover 内显示 3 列资产卡片网格
- 点击卡片切换选中状态

### Phase 4: 创建 ReferenceBadge
**文件**: `frontend/src/components/storyboard/components/ReferenceBadge.tsx`
- 绝对定位在图像设计列右上角
- 显示参考图数量徽章
- 点击弹出 Popover 管理参考图

### Phase 5: 重构 ShotCard
**文件**: `frontend/src/components/storyboard/ShotCard.tsx`
- 移除所有列内头部
- 使用 SHOT_LAYOUT 常量替换硬编码宽度
- 列2: 替换 Select 为 AssetSelector
- 列3: 移除参考图区域, 添加 ReferenceBadge
- 减少 min-height 从 280px 到 160px

### Phase 6: 更新 ShotListEditor
**文件**: `frontend/src/components/storyboard/ShotListEditor.tsx`
- 在分镜列表容器前添加 ShotListHeader

## 验收标准
- [x] 公共表头 sticky 固定在顶部
- [x] 表头列宽与内容列宽完美对齐
- [x] 资产选择器显示头像 + Popover 卡片选择
- [x] 参考图徽章显示数量，点击弹出管理界面
- [x] 分镜行高度明显降低 (280px → 140px)
- [x] 滚动时 Popover 不被裁剪
- [x] 操作按钮改为悬浮显示

## 实施完成 ✅

### 修改文件清单
1. `constants/storyboardConstants.ts` - 布局常量，改用 flex 比例避免横向滚动
2. `storyboard/ShotListHeader.tsx` - 公共表头，集成全选+批量操作按钮
3. `storyboard/components/AssetSelector.tsx` - 资产卡片选择器
4. `storyboard/components/ReferenceBadge.tsx` - 参考图徽章组件
5. `storyboard/ShotCard.tsx` - Compact Grid 布局，操作在左侧列
6. `storyboard/ShotListEditor.tsx` - 移除独立全选行和工具栏
7. `storyboard/ShotCard.css` - position: relative
8. `storyboard/StoryboardLayout.css` - 移除 content padding

## 第二次优化 (2026-01-25)

### 需求
1. 全选移到公共头部，去除独立全选行
2. 操作按钮移到左侧列竖向排列
3. 消除横向滚动条 (百分比宽度 → flex 比例)
4. 移除 storyboard-content padding
5. 公共头部集成批量生成按钮
6. 删除结果列的"生成"文字

### 变更
- `storyboardConstants.ts`: `w-[15%]` → `flex-[15]` 避免横向滚动
- `ShotListHeader.tsx`: 添加全选、批量生成下拉菜单
- `ShotCard.tsx`: 操作按钮移到左侧列，删除底部悬浮栏
- `ShotListEditor.tsx`: 移除 toolbar prop，简化结构
- `StoryboardLayout.css`: padding: 24px → 0

## 第三次优化 (2026-01-25)

### 需求
1. 视频设计列增加批量 AI 生成（与图像设计一致）
2. 资产列内部布局优化加宽
3. 左侧操作按钮直接全部显示（不要悬浮显示）
4. 增加批量删除按钮
5. 图像/视频结果列单独的生成按钮
6. 四列（图像设计、图像结果、视频设计、视频结果）AI 生成按钮统一设计
7. 参考图改为引用样式显示在输入框下方
8. 行与行之间增加间距

### 变更
- `storyboardConstants.ts`: 操作列加宽 w-12 → w-14，资产列加宽 flex-15 → flex-18
- `ShotListHeader.tsx`: 添加视频提示词批量生成、批量删除按钮
- `ShotCard.tsx`: 操作按钮直接显示、参考图引用样式、统一顶部工具栏
- `ShotListEditor.tsx`: 添加批量视频提示词和批量删除回调
- `ShotCard.css`: 行间距 margin-bottom: 4px

## 第四次优化 (2026-01-25)

### 需求
1. 资产列变窄，图像生成列变宽
2. 图像设计/视频设计的 AI 生成按钮移到右下角参考图旁边，蓝色文字无边框
3. 添加参考图按钮右侧和下方距离增大
4. 图像/视频结果列移除顶部工具栏，生成按钮居中显示（无数据时），有数据时隐藏
5. 资产单元格内的每种资产高度和间距增大，上下居中
6. 头像增大 (24px → 28px)，添加按钮增大 (24px → 28px)
7. 悬浮头像时显示详情提示

### 变更
- `storyboardConstants.ts`: colAssets flex-18 → flex-12，colImageResult flex-12 → flex-18
- `AssetSelector.tsx`: 头像 size 24→28，gap 1.5→2，py-1，hover 详情 tooltip
- `ShotCard.tsx`:
  - 图像设计/视频设计：移除顶部工具栏，AI 按钮移到右下角 (蓝色文字 button)
  - 图像/视频结果：移除顶部工具栏，无数据时居中显示生成按钮，有数据时隐藏按钮
  - 资产列：justify-center 垂直居中
