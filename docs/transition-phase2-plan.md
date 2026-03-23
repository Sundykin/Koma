# 转场 Phase 2：效率闭环实施计划

> 状态：草案
> 日期：2026-03-23
> 前置：Phase 1 已完成（`transition-code-entry.md` §6）

## 1. 目标

把"能用"变成"值得高频使用"。成功标准：高频操作路径点击数明显下降，用户在真实流程里会重复使用转场。

## 2. 功能优先级

| 优先级 | 功能 | 用户故事 | 理由 |
|--------|------|----------|------|
| P0 | 解除拖动限制 | 含转场轨道也能拖动/resize/插入片段，失效转场自动清理 | Phase 1 遗留，当前体验严重受限 |
| P0 | Quick add | 一键为轨道所有 cut point 添加默认转场 | 短剧场景片段多，逐个添加效率极低 |
| P1 | Default transition 设置 | 用户可设置默认转场时长，新建转场自动使用 | Quick add 的前置，提升批量操作体验 |
| P1 | 批量删除 | 一键清除轨道所有转场 | Quick add 的逆操作，试错成本低 |
| P1 | Inspector 面板 | 选中转场后在侧边栏显示属性面板，可拖拽滑块调时长 | 替代当前 +/- 按钮，精确控制 |
| P2 | 批量替换时长 | 选中多个转场统一修改时长 | 效率优化，非核心路径 |
| P2 | 音频 crossfade 独立曲线 | 转场期间音频有独立淡入淡出，不再直接用视觉 opacity | Phase 1 遗留，体验优化 |

## 3. 数据模型变更

Phase 2 不需要修改 `Transition` 接口。变更集中在用户偏好层：

```typescript
// 新增：constants.ts 或用户设置
interface TransitionDefaults {
  type: TransitionType;       // 默认 'fade'
  duration: number;           // 默认 0.3，用户可调
}
```

`SUPPORTED_TRANSITION_TYPES` 和 `TransitionType` 保持不变（Phase 2 仍然 fade-only）。

## 4. 技术方案

### 4.1 P0: 解除拖动限制

**方案：允许拖动，操作完成后自动清理失效转场**

- 移除 `SimpleTimeline.tsx` 572/597/639 行的 block 逻辑
- 在 `handleDragMove`/`handleResizeMove` 结束时，调用 `normalizeTrackTransitions` 过滤失效转场
- 实际上 `normalizeTrackTransitions` 已经能处理：移动后相邻性破坏 → 转场被过滤
- 关键改动：drag/resize/drop 完成后对目标轨道执行一次 normalize 写回

**改动文件：**
- `SimpleTimeline.tsx` — 移除 3 处 block，drag/resize/drop 结束后 normalize
- `SimpleEditor.tsx` — `handleMoveClip`/`handleUpdateClip` 后 normalize transitions

### 4.2 P0: Quick Add

**方案：`handleAddAllTransitions(trackId)` 遍历所有相邻 cut point 添加默认转场**

- 新增 `useTransitionHandlers.ts` → `handleAddAllTransitions`
- 遍历 `getSortedTrackClips`，对每对相邻 clip 检查 `getMaxTransitionDuration > 0` 且无已有转场
- 使用 `DEFAULT_TRANSITION_DURATION`（或用户设置的默认值）
- 链式约束由 `normalizeTrackTransitions` 自动处理

**改动文件：**
- `useTransitionHandlers.ts` — 新增 `handleAddAllTransitions`、`handleDeleteAllTransitions`
- `TransitionOverlay.tsx` 或 `SimpleTimeline.tsx` — 添加轨道级"全部添加转场"按钮

### 4.3 P1: Default Transition 设置

**方案：用户偏好存储在 SimpleEditor 的 state 中**

- 新增 `transitionDefaults` state：`{ duration: number }`
- `handleAddTransition` 和 `handleAddAllTransitions` 读取此值替代 `DEFAULT_TRANSITION_DURATION`
- UI：Inspector 面板或 timeline toolbar 中提供时长设置入口

**改动文件：**
- `SimpleEditor.tsx` — 新增 `transitionDefaults` state
- `useTransitionHandlers.ts` — 参数增加 `defaultDuration`

### 4.4 P1: Inspector 面板

**方案：新建 `TransitionInspector.tsx` 组件**

布局：
```
┌─────────────────────┐
│ 转场属性              │
├─────────────────────┤
│ 类型：淡变            │
│ 时长：[===●===] 0.5s │
│ 最大时长：2.0s        │
│ 来源片段：clip-a      │
│ 目标片段：clip-b      │
├─────────────────────┤
│ [删除转场]            │
└─────────────────────┘
```

- 时长用 Ant Design `Slider` + `InputNumber` 联动
- 最大值动态取 `getChainAwareMaxDuration`
- 选中转场时显示，取消选中时隐藏

**改动文件：**
- 新建 `components/editor/TransitionInspector.tsx`
- `SimpleEditor.tsx` — 在属性面板区域条件渲染

### 4.5 P2: 音频 crossfade

**方案：独立音频淡入淡出函数**

- 新增 `getClipAudioFade(transitionPlans, clipId, currentTime): number`
- 使用 equal-power crossfade 曲线（`Math.cos` / `Math.sin`）替代线性
- `simpleEngine.ts` `getClipVolume` 改用新函数

**改动文件：**
- `transitionResolver.ts` — 新增 `getClipAudioFade`
- `simpleEngine.ts` — `getClipVolume` 使用新函数

## 5. 交互入口

| 操作 | 入口 | 快捷键 |
|------|------|--------|
| Quick add（全部添加） | 轨道头右键菜单 / timeline toolbar | — |
| 批量删除 | 轨道头右键菜单 / timeline toolbar | — |
| 调整时长 | Inspector Slider / TransitionOverlay +/- | — |
| 删除单个 | Inspector 删除按钮 / TransitionOverlay × | Delete |
| 设置默认时长 | Inspector 面板底部 | — |

## 6. 新增组件

| 组件 | 位置 | 职责 |
|------|------|------|
| `TransitionInspector.tsx` | `components/editor/` | 转场属性面板 |

## 7. 现有组件改动范围

| 文件 | 改动 |
|------|------|
| `SimpleTimeline.tsx` | 移除 3 处 block，添加轨道级操作按钮 |
| `SimpleEditor.tsx` | 新增 transitionDefaults state，接入 Inspector |
| `useTransitionHandlers.ts` | 新增 handleAddAllTransitions、handleDeleteAllTransitions，支持 defaultDuration 参数 |
| `TransitionOverlay.tsx` | 无大改，可能微调样式 |
| `transitionResolver.ts` | 新增 getClipAudioFade（P2） |
| `simpleEngine.ts` | getClipVolume 改用 audio fade 函数（P2） |

## 8. 建议实施顺序

```
Segment 1: 解除拖动限制（P0）
  ↓
Segment 2: Quick add + 批量删除（P0）
  ↓
Segment 3: Default transition 设置（P1）
  ↓
Segment 4: Inspector 面板（P1）
  ↓
Segment 5: 音频 crossfade（P2）
  ↓
Segment 6: 回归测试增强
```

每个 Segment 独立可交付，可验证。

## 9. 风险点

1. **拖动后 normalize 性能** — 每次 mouseup 调用 `normalizeTrackTransitions`，片段多时可能卡顿。缓解：normalize 本身是 O(n) 线性，100 个片段内无压力。
2. **Quick add 链式约束** — 批量添加时后续转场可能因链式约束被拒绝。缓解：按顺序添加，`validateTransitions` 已处理。
3. **Inspector 与 TransitionOverlay 状态同步** — 两处都能修改时长，需确保单一数据源。缓解：都通过 `handleUpdateTransitionDuration` 走同一路径。

## 10. 成功指标

1. 添加 10 个转场的操作从 ~30 次点击降到 1 次（Quick add）
2. 调整转场时长从 +/- 按钮多次点击变为滑块一次拖拽
3. 含转场轨道可正常拖动/resize 片段，无需先删除转场
