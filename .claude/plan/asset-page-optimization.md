# 资产页面优化 - 创作者工作台方案

## 概述
采用 **方案 A: 创作者工作台** 布局，将角色/场景/道具详情面板重构为左侧输入控制区 + 右侧画布预览区。

## 布局设计

```
+---------------------------------------------------------------+
|  Asset Manager                                                |
+----------------+---------------------+-------------------------+
|                |  [Sidebar 380px]    |  [Canvas Flex Auto]     |
|  [Left List]   |                     |                         |
|  (320px)       |  1. Header          |  [Toolbar: Tabs|绑定|上传] |
|                |     名称/类型       |                         |
|                |                     |  +-------------------+  |
|                |  2. Prompt 编辑器   |  |                   |  |
|                |     (autoSize)      |  |   大图/视频预览    |  |
|                |                     |  |   (自适应)        |  |
|                |  3. 进度条          |  |                   |  |
|                |                     |  +-------------------+  |
|                |  4. 生成按钮组      |                         |
+----------------+---------------------+-------------------------+
```

## 技术架构

### 组件结构
```
AssetManagerPanel.tsx (父组件 - 持久化逻辑提升)
├── AssetListPanel.tsx (左侧列表, 保持不变)
└── CharacterDetailPanel.tsx (Creator Layout)
    ├── creator-sidebar (左侧控制区 380px)
    │   ├── creator-sidebar-header (名称/保存/删除)
    │   └── creator-sidebar-content
    │       ├── Form (名称/类型/Prompt)
    │       ├── Progress Bar (生成进度)
    │       └── Action Buttons (生成定妆照/视频)
    └── creator-canvas (右侧预览区 Flex)
        ├── creator-canvas-toolbar (Tabs切换/绑定状态/上传)
        └── creator-canvas-body (媒体预览器)
```

### 共享组件（后续迭代）
- `AssetDetailShell`: 布局框架 (slots: leftPane, rightPane)
- `MediaPreviewTabs`: Tabs + 懒加载 + 海报图
- `BindingStatusCard`: 绑定状态 + 提取按钮
- `AssetMetadataPanel`: 统一表单卡片

### 接口设计
```typescript
interface BaseAssetDetailProps<TAsset> {
  asset: TAsset;
  projectId: string;
  theme?: string;
  stylePrompt?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  onAssetChange: (asset: TAsset) => void;
  onAssetDelete: (assetId: string) => void;
}

type ViewMode = 'costume' | 'video' | 'image';
```

## CSS 规范

### 类名约定
| 类名 | 用途 |
|------|------|
| `.creator-sidebar` | 左侧控制区容器 |
| `.creator-sidebar-header` | 头部（名称+操作） |
| `.creator-sidebar-content` | 内容区（可滚动） |
| `.creator-canvas` | 右侧预览区容器 |
| `.creator-canvas-toolbar` | 工具栏（毛玻璃效果） |
| `.creator-canvas-body` | 媒体展示区 |
| `.creator-media-viewer` | 图片/视频包装器 |

### 尺寸规范
- Sidebar 宽度: `380px` (fixed)
- Toolbar 高度: `56px`
- 内边距: `20px` / `24px`
- 圆角: `4px` / `6px`

### 颜色规范
- Sidebar 背景: `#1f1f1f`
- Canvas 背景: `#000000`
- 边框: `#303030`
- 主色: `#1677ff`
- 成功色: `#52c41a`

## 实施步骤

### Phase 1: 角色面板重构 (本次)
1. 更新 `AssetManager.css` 添加 `.creator-*` 样式
2. 重构 `CharacterDetailPanel.tsx` 为 Creator Layout
3. 添加 `viewMode` 状态 + Segmented 切换
4. 优化生成按钮布局和状态反馈

### Phase 2: 场景/道具面板 (后续)
1. 复用 Creator Layout 到 `SceneDetailPanel.tsx`
2. 复用 Creator Layout 到 `PropDetailPanel.tsx`
3. 统一三者的交互模式

### Phase 3: 共享组件抽象 (后续)
1. 提取 `AssetDetailShell` 布局组件
2. 提取 `MediaPreviewTabs` 预览组件
3. 提取 `BindingStatusCard` 绑定状态组件

### Phase 4: 性能优化 (后续)
1. 实现 `useInViewMedia` 懒加载 Hook
2. 视频 `preload="metadata"` + poster
3. 左侧列表虚拟化（如资产数量过多）

## 文件改动清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `AssetManager.css` | 修改 | 添加 `.creator-*` 样式系统 |
| `CharacterDetailPanel.tsx` | 重构 | 采用 Creator Layout |
| `SceneDetailPanel.tsx` | 后续 | 复用 Creator Layout |
| `PropDetailPanel.tsx` | 后续 | 复用 Creator Layout |

## 验收标准
1. 预览区域不再有 180px 高度限制
2. 定妆照/视频 Tabs 切换流畅
3. 绑定状态显示清晰，提取按钮位置醒目
4. 表单输入区域不占用过多空间
5. 生成进度反馈明确
