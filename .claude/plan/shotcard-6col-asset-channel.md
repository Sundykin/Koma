# ShotCard 6列 Asset Channel 布局重构计划

## 需求概述
优化 AI 分镜布局，移除舞台区域，改为 6 列 Asset Channel 布局。

## 方案选择
**方案 A: Asset Channel (6列布局)** - 用户已确认

## 列布局规格

| 列号 | 内容 | 宽度 | min-width |
|------|------|------|-----------|
| 1 | 剧本 | 15% | 150px |
| 2 | 资产 (角色/场景/道具) | 15% | 150px |
| 3 | 图像设计 (提示词+参考图) | 20% | 200px |
| 4 | 图像结果 | 15% | 160px |
| 5 | 视频设计 | 20% | 200px |
| 6 | 视频结果 | 15% | 160px |

## 实施步骤

### Phase 1: 移除舞台区域
**文件**: `frontend/src/components/storyboard/StoryboardStudio.tsx`
- 删除 stageArea 整个区域（视频预览+分镜信息面板）
- 简化为仅容器角色，直接渲染 children

### Phase 2: ShotCard 6列布局
**文件**: `frontend/src/components/storyboard/ShotCard.tsx`
- 新增 `onPropsChange` prop
- 列1: 纯剧本文本 (15%)
- 列2: 资产选择器 - 角色/场景/道具垂直堆叠 (15%)
- 列3-6: 调整宽度比例
- 添加 `shrink-0` 防止列压缩
- 添加 `overflow-x-auto` 支持横向滚动

### Phase 3: Props 传递链
**文件**: `frontend/src/components/storyboard/ShotListEditor.tsx`
- 新增 `onPropsChange` prop 定义和传递

### Phase 4: 道具处理函数
**文件**: `frontend/src/components/storyboard/Storyboard.tsx`
- 新增 `handlePropsChange` 回调函数

## 关键代码变更

### ShotCard 列2 (资产列) 结构
```tsx
<div className="w-[15%] min-w-[150px] border-r border-zinc-800 flex flex-col shrink-0 bg-zinc-900/10">
  <div className="px-3 py-2 text-xs font-medium text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
    资产
  </div>
  <div className="p-2 space-y-3 overflow-y-auto flex-1">
    <div>
      <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1"><UserOutlined /> 角色</div>
      <Select mode="multiple" size="small" maxTagCount="responsive" ... />
    </div>
    <div>
      <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1"><EnvironmentOutlined /> 场景</div>
      <Select mode="multiple" size="small" maxTagCount="responsive" ... />
    </div>
    <div>
      <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1"><ToolOutlined /> 道具</div>
      <Select mode="multiple" size="small" maxTagCount="responsive" ... />
    </div>
  </div>
</div>
```

## 验收标准
- [x] StoryboardStudio 舞台区域已移除
- [x] 6 列布局正确显示
- [x] 道具选择器可用
- [x] 视频点击弹出 Modal 播放
- [x] 支持横向滚动（窄屏）
- [x] 参考图在上，提示词在下
- [x] 每列内部间距优化
- [x] 结果列无数据时居中对齐

## 实施完成 ✅

### 修改文件清单
1. `StoryboardStudio.tsx` - 移除舞台区域，简化为容器
2. `ShotCard.tsx` - 6列布局重构，参考图在上提示词在下
3. `ShotListEditor.tsx` - 添加 onPropsChange prop
4. `Storyboard.tsx` - 添加 handlePropsChange 处理函数
