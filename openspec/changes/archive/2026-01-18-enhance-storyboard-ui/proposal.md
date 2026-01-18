# Proposal: enhance-storyboard-ui

## Summary
优化分镜界面的用户体验，增强编辑能力和批量操作功能。

## Motivation
当前分镜界面存在以下问题：
1. 剧本文案不可编辑，用户无法直接修改
2. 每行高度较低，内容显示不够充分
3. 提示词输入框宽度过大、高度不足，不利于编辑
4. 参考图只支持单张，无法管理多个候选图
5. 视频也只支持单版本显示，需要支持多版本卡片选择
6. 缺少批量选择和批量操作功能
7. 缺少分镜合并、排序等高级操作

## Goals
- 剧本文案可直接编辑
- 增加每行高度，改善内容展示
- 提示词输入框：宽度减少、高度增加（默认5行）
- 参考图支持多张卡片展示，可选中使用哪一张
- 视频支持多版本卡片展示，可选中使用哪一个，支持弹窗播放
- 添加复选框支持批量操作
- 行操作增加：向上合并、向下合并、改变顺序
- 合并时自动计算：时长累加、文案拼接、提示词合并、预览图保留第一张

## Non-Goals
- 不涉及数据兼容性（直接改造现有结构）
- 不改变后端存储逻辑

## Approach

### 1. 数据结构改造
修改 `Shot` 类型，支持多图片和多视频版本：
```typescript
interface Shot {
  // 原有字段保持不变
  imagePath?: string;           // 当前选中的图片路径
  imagePaths?: string[];        // 所有候选图片列表
  currentImageIndex?: number;   // 当前选中的图片索引

  videoVersions?: VideoVersion[]; // 视频版本列表
  currentVideoIndex?: number;     // 当前选中的视频索引
}

interface VideoVersion {
  path: string;
  thumbnailPath?: string;
  createdAt: number;
}
```

### 2. UI 布局改造
- 每行高度增加到约 180px
- **行操作列移至行前方**（复选框之后、序号之前）
- 提示词区域：宽度从 flex:1 减少到固定宽度 280px，高度增加到 5 行
- 参考图区域：宽度增加到 200px，支持多图卡片网格
- 视频区域：宽度增加到 180px，支持多版本卡片网格

### 3. 新增组件
- `ImageCardGrid`: 多图片卡片网格组件
- `VideoCardGrid`: 多视频卡片网格组件

### 4. 批量操作
- 每行左侧添加复选框
- 工具栏显示批量操作按钮（当有选中项时）

### 5. 行操作增强
- 向上合并：与上一行合并
- 向下合并：与下一行合并
- 上移/下移：改变顺序

### 6. 合并逻辑
```typescript
function mergeShots(shot1: Shot, shot2: Shot): Shot {
  return {
    ...shot1,
    scriptContent: `${shot1.scriptContent}\n${shot2.scriptContent}`,
    description: `${shot1.description}\n\n${shot2.description}`,
    duration: shot1.duration + shot2.duration,
    characters: [...new Set([...shot1.characters, ...shot2.characters])],
    dialogue: [shot1.dialogue, shot2.dialogue].filter(Boolean).join('\n'),
    // 保留 shot1 的图片和视频
    imagePath: shot1.imagePath,
    imagePaths: [...(shot1.imagePaths || []), ...(shot2.imagePaths || [])],
  };
}
```

## Impact
- 涉及文件：
  - `frontend/src/types.ts` - Shot 类型扩展
  - `frontend/src/components/ShotListEditor.tsx` - 主要改造
  - `frontend/src/components/ShotListEditor.css` - 样式调整
  - 新增 `frontend/src/components/ImageCardGrid.tsx`
  - 新增 `frontend/src/components/VideoCardGrid.tsx`
  - `frontend/src/components/Storyboard.tsx` - 添加新的回调函数

## Risks
- 布局变化较大，需要充分测试各种屏幕尺寸
- 合并操作需要谨慎处理，避免数据丢失
