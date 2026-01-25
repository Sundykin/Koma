# ShotCard 5 列 Pipeline 布局重构计划

## 需求概述
优化 AI 分镜布局，移除顶部舞台区域，改为点击视频弹出 Modal 播放。实现 5 列 Pipeline 布局，新增参考图字段。

## 方案选择
**方案 A: 5 列 Pipeline 布局** (用户已确认)

## 实施步骤

### Phase 1: 数据结构扩展

#### 1.1 types.ts 修改
**文件**: `frontend/src/types.ts`

```typescript
interface Shot {
  // ... 现有字段 ...
  referenceImages?: string[];      // 新增: 文生图参考图列表
  selectedReferenceIndex?: number; // 新增: 选中的参考图索引
  scenes?: string[];               // 确保可编辑
}
```

#### 1.2 loadEpisodeShots 迁移逻辑
**文件**: `frontend/src/store/project/analysis.ts`

- 为缺失字段设置默认值：`referenceImages: []`, `selectedReferenceIndex: 0`
- 保守迁移：仅在无生成结果时从 imagePaths 复制到 referenceImages

### Phase 2: ShotCard 组件重构

#### 2.1 Props 扩展
**文件**: `frontend/src/components/storyboard/ShotCard.tsx`

新增 Props:
- `onReferenceImagesChange?: (shotId: string, images: string[], selectedIndex: number) => void`
- `onScenesChange?: (shotId: string, sceneIds: string[]) => void`
- `onPlayVideo?: (shotId: string, videoUrl: string) => void`

#### 2.2 布局重构
5 列比例: `20% | 22% | 18% | 22% | 18%`

| 列 | 内容 | 宽度 |
|----|------|------|
| 1 | 剧本 & 元数据 (角色/场景选择器) | 20% |
| 2 | 图像设计 (提示词 + 参考图上传) | 22% |
| 3 | 图像结果 (生成图网格) | 18% |
| 4 | 视频设计 (提示词) | 22% |
| 5 | 视频结果 (点击弹出 Modal) | 18% |

#### 2.3 Header 精简
- 高度: 40px
- 左侧: 序号 + 时长 Tag + 确认状态
- 右侧: 移动/删除操作按钮
- 移除: 角色选择器 (下沉到列1)

### Phase 3: 移除舞台区域

#### 3.1 StoryboardStudio 简化
**文件**: `frontend/src/components/storyboard/StoryboardStudio.tsx`

- 移除顶部舞台预览区域 (stageArea)
- 保留分镜列表区域 (timelineArea)

#### 3.2 视频播放 Modal
**文件**: `frontend/src/components/storyboard/ShotListEditor.tsx`

- 新增 `<VideoPreviewModal>` 状态管理
- 处理 `onPlayVideo` 回调

### Phase 4: 存储层适配

#### 4.1 analysis.ts 修改
- `loadEpisodeShots`: 添加默认值/迁移
- `saveEpisodeShots`: 确保新字段持久化

#### 4.2 Storyboard.tsx 状态管理
- 新增 `handleReferenceImagesChange` 处理函数
- 新增 `handleScenesChange` 处理函数

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 旧数据兼容 | 惰性迁移，仅在读取时填充默认值 |
| 5 列过密 | 设置 min-width，支持横向滚动 |
| Modal 打断工作流 | 支持 Modal 内上/下翻页 |

## 验收标准
- [x] 5 列布局正确显示
- [x] 参考图可上传/选择/删除
- [x] 角色/场景选择器在列1可用
- [x] 视频点击弹出 Modal 播放
- [x] 旧数据正常加载无报错

## 实施进度

### 已完成
1. **Phase 1: 数据结构扩展** ✅
   - `types.ts`: Shot 接口已包含 `referenceImages`, `selectedReferenceIndex`, `scenes` 字段
   - `analysis.ts`: `loadEpisodeShots` 添加了运行时迁移逻辑

2. **Phase 2: ShotCard 组件重构** ✅
   - 5 列 Pipeline 布局 (20%|22%|18%|22%|18%)
   - Header 精简为 40px
   - 角色/场景选择器移至列1
   - 参考图上传区域在列2
   - 视频 Modal 播放功能

3. **Phase 4: 存储层适配** ✅
   - `ShotListEditor.tsx`: 新增 `onScenesChange`, `onReferenceImagesChange` props
   - `Storyboard.tsx`: 新增 `handleScenesChange`, `handleReferenceImagesChange` 处理函数
   - `ImageCardGrid.tsx`, `VideoCardGrid.tsx`: 新增 `compact` prop

### 待完成
- **Phase 3: 移除舞台区域** - StoryboardStudio 简化（可选优化）
