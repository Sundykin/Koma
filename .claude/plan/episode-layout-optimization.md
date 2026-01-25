# 分集页面布局优化计划

## 需求概述
优化分集页面布局，解决空间利用率低、AI分镜布局杂乱、操作不够专业的问题。

## 方案选择
**方案 A: 工作流分组布局** (用户已确认)

## 实施步骤

### Step 1: 左侧边栏加宽
**文件**: `frontend/src/components/project/ProjectOverview.tsx`

- 宽度: `w-[260px]` → `w-80` (320px)
- 目的: 适应中文标题和操作按钮

### Step 2: ShotCard 布局重构
**文件**: `frontend/src/components/storyboard/ShotCard.tsx`

#### 布局变更
| 原布局 (5列) | 新布局 (3列) |
|-------------|-------------|
| 剧本 flex-[1.5] | 剧本 flex-[3] (~27%) |
| 文生图提示词 flex-[2] | 图片生成区 flex-[4] (~36.5%) |
| 参考图 flex-[1.5] | - 提示词 h-[35%] min-h-[140px] |
| 图生视频提示词 flex-[2] | - 结果 flex-1 |
| 视频 flex-[2] | 视频生成区 flex-[4] (~36.5%) |
| | - 提示词 h-[35%] min-h-[140px] |
| | - 结果 flex-1 |

#### 组件结构
```
ShotCard
├── Header (不变)
└── Body (重构)
    ├── 剧本区 (flex-[3])
    │   └── ScriptEditor (absolute inset-0)
    ├── 图片生成区 (flex-[4] flex-col)
    │   ├── 提示词 (h-[35%] min-h-[140px])
    │   │   └── ScriptEditor
    │   └── 结果 (flex-1)
    │       └── ImageCardGrid
    └── 视频生成区 (flex-[4] flex-col)
        ├── 提示词 (h-[35%] min-h-[140px])
        │   └── ScriptEditor
        └── 结果 (flex-1)
            └── VideoCardGrid
```

### Step 3: ScriptEditor 高度修复
**文件**: `frontend/src/components/storyboard/ShotCard.tsx`

- 使用 `relative flex-1` + `absolute inset-0` 模式
- 确保编辑器严格遵循父容器边界

## 验收标准
1. 左侧边栏 320px，分集标题完整显示
2. ShotCard 3列布局，提示词与结果垂直关联
3. ScriptEditor 高度撑满容器，无溢出
