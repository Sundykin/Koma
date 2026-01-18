# Design: enhance-storyboard-ui

## 1. 布局设计

### 1.1 整体行布局
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [☐] │ 操作 │ # │     剧本文案       │    提示词(5行)    │  参考图(多张)  │  视频(多版本)  │
│     │  ⋮   │   │   (可编辑)         │   (宽度减少)      │   (卡片网格)   │   (卡片网格)   │
│     │      │   │                    │                    │                │                │
│ 30px│ 48px │48px│      240px        │      280px         │     200px      │     180px      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
每行高度：约 180px

操作列包含：
- 更多菜单（⋮）：向上合并、向下合并、上移、下移、删除
- 确认/取消确认按钮
```

### 1.2 参考图卡片网格
```
┌───────────────────────────────┐
│  ┌─────┐  ┌─────┐  ┌─────┐  │
│  │ ✓   │  │     │  │  +  │  │
│  │ img1│  │ img2│  │ add │  │
│  └─────┘  └─────┘  └─────┘  │
│  ┌─────┐  ┌─────┐           │
│  │     │  │     │           │
│  │ img3│  │ img4│           │
│  └─────┘  └─────┘           │
│      [AI生成] 按钮           │
└───────────────────────────────┘
- 每张卡片 60x34px
- 选中的卡片有绿色边框和勾选标记
- 最后一个卡片是添加按钮
```

### 1.3 视频卡片网格
```
┌───────────────────────────────┐
│  ┌─────┐  ┌─────┐            │
│  │ v1✓ │  │ v2  │            │
│  │ ▶   │  │ ▶   │            │
│  └─────┘  └─────┘            │
│                               │
│  [⚡ AI生成视频] 按钮         │
└───────────────────────────────┘
- 点击卡片可选中
- 点击播放按钮弹窗播放
- AI生成按钮：生成新版本视频
```

## 2. 数据结构设计

### 2.1 Shot 类型扩展
```typescript
interface Shot {
  id: string;
  scriptContent: string;
  shotType: 'close-up' | 'medium' | 'wide' | 'extreme-wide';
  cameraMovement: 'static' | 'pan' | 'zoom-in' | 'tracking' | 'handheld';
  duration: number;
  description?: string;
  characters: string[];
  dialogue?: string;
  emotion?: string;
  props?: string[];
  confirmed?: boolean;
  seed?: number;

  // 单图兼容（保持向后兼容）
  imagePath?: string;
  imageUrl?: string;

  // 多图支持
  imagePaths?: string[];           // 所有候选图片
  currentImageIndex?: number;      // 当前选中索引，默认 0

  // 多视频支持（替代 currentVersion）
  videos?: ShotVideo[];
  currentVideoIndex?: number;      // 当前选中索引，默认 0
}

interface ShotVideo {
  path: string;
  thumbnailPath?: string;
  prompt?: string;
  seed?: number;
  model?: string;
  createdAt: number;
}
```

### 2.2 数据迁移策略
由于无需考虑数据兼容性，直接使用新结构：
- `imagePath` → `imagePaths[currentImageIndex]`
- `currentVersion` → `videos[currentVideoIndex]`

## 3. 组件设计

### 3.1 ImageCardGrid
```typescript
interface ImageCardGridProps {
  images: string[];              // 图片路径列表
  selectedIndex?: number;        // 当前选中索引
  onSelect: (index: number) => void;
  onAdd: () => void;             // 添加图片
  onDelete: (index: number) => void;
  onGenerate?: () => void;       // AI 生成
  isGenerating?: boolean;
  maxImages?: number;            // 最多显示数量，默认 6
  size?: 'small' | 'default';
  characters?: Character[];
  scenes?: Scene[];
  props?: Prop[];
}
```

### 3.2 VideoCardGrid
```typescript
interface VideoCardGridProps {
  videos: ShotVideo[];
  selectedIndex?: number;
  onSelect: (index: number) => void;
  onPlay: (video: ShotVideo) => void;  // 弹窗播放
  onDelete: (index: number) => void;
  onGenerate?: () => void;
  isGenerating?: boolean;
  maxVideos?: number;            // 最多显示数量，默认 4
}
```

### 3.3 ShotRow 增强
```typescript
interface ShotRowProps {
  shot: Shot;
  index: number;
  selected: boolean;             // 复选框状态
  onSelectChange: (selected: boolean) => void;
  onScriptChange: (script: string) => void;  // 剧本编辑
  onPromptChange: (prompt: string) => void;
  onImageSelect: (index: number) => void;
  onImageAdd: () => void;
  onImageDelete: (index: number) => void;
  onVideoSelect: (index: number) => void;
  onVideoPlay: (video: ShotVideo) => void;
  onMergeUp: () => void;
  onMergeDown: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  // ...其他 props
}
```

## 4. 交互设计

### 4.1 批量操作
- 点击复选框选中单行
- 表头复选框全选/取消全选
- 选中后工具栏显示批量操作按钮：
  - 批量删除
  - 批量确认
  - 批量取消确认

### 4.2 行操作菜单
点击操作列的更多按钮（⋯）显示：
- 向上合并（禁用于第一行）
- 向下合并（禁用于最后一行）
- 上移（禁用于第一行）
- 下移（禁用于最后一行）
- 删除

### 4.3 合并逻辑
向上合并：当前行与上一行合并，保留上一行的位置
向下合并：当前行与下一行合并，保留当前行的位置

合并计算规则：
- `scriptContent`: 拼接，用换行分隔
- `description`: 拼接，用两个换行分隔
- `duration`: 相加
- `characters`: 去重合并
- `dialogue`: 拼接，用换行分隔
- `imagePaths`: 合并数组
- `currentImageIndex`: 保持目标行的值
- `videos`: 合并数组
- `currentVideoIndex`: 保持目标行的值
- 其他字段（shotType, cameraMovement 等）: 保持目标行的值

## 5. 样式设计

### 5.1 颜色规范
- 选中边框：`#10b981`（绿色）
- 选中背景：`rgba(16, 185, 129, 0.1)`
- 悬浮背景：`#1a1a1a`
- 分隔线：`#27272a`

### 5.2 间距规范
- 行内边距：`16px`
- 列间距：`12px`
- 卡片间距：`6px`
- 卡片圆角：`4px`
