# 转场 Phase 2：效率闭环实施计划

> 状态：团队五轮评审完成（全部待决议项已关闭，实现前验证完成）
> 日期：2026-03-23
> 前置：Phase 1 已完成（`transition-code-entry.md` §6）

## 1. 目标

把"能用"变成"值得高频使用"。成功标准：高频操作路径点击数明显下降，用户在真实流程里会重复使用转场。

## 2. 功能优先级

| 优先级 | 功能 | 用户故事 | 理由 |
|--------|------|----------|------|
| P0 | 解除拖动限制 | 含转场轨道也能拖动/resize/插入片段，失效转场自动清理 | Phase 1 遗留，当前体验严重受限 |
| P0 | Quick add | 一键为轨道所有 cut point 添加默认转场 | 短剧场景片段多，逐个添加效率极低 |
| P0 | 批量删除 | 一键清除轨道所有转场 | Quick add 的逆操作，必须同时交付，否则试错成本过高 |
| P1 | 转场跨度可视化 | 时间线上用半透明色块标示转场覆盖范围 | 帮助用户理解转场占用时长，低成本高认知收益 |
| P1 | Inline slider | TransitionOverlay 选中态用滑块替代 +/- 按钮 | 连续调节 vs 离散调节，体验提升明显 |
| P2 | Default transition 设置 | 用户可设置默认转场时长，新建转场自动使用 | Quick add 用硬编码 0.5s 即可，用户自定义是锦上添花 |
| P2 | Inspector 面板 | 选中转场后在侧边栏显示属性面板 | 留给多转场类型时再做，当前 inline slider 足够 |
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

**方案：skipNormalize + clamp-before-validate + 清理通知**（二轮评审确认）

**4.1.1 三处 block 移除策略**

| 位置 | 操作 | 处理方式 |
|------|------|----------|
| 第 572 行（drag） | 拖动 clip | 移除 block，拖动中 `skipNormalize`，松手时 normalize |
| 第 597 行（resize） | 调整 clip 边界 | 移除 block，resize 中 `skipNormalize`，松手时 normalize |
| 第 639 行（drop） | 外部素材拖入 | 移除 block，**不需要 skipNormalize**，normalize 直接兜底 |

drop 不需要 skipNormalize 的原因：有转场的 clip 对必须紧密相邻（`sameCutPoint` 检查），`findNextAvailablePosition` 不会插入到紧密相邻 clip 之间，会自动跳到轨道末尾或有间隙的位置。

**4.1.2 skipNormalize 核心实现（四轮更新：onDragStateChange prop 方案）**

```typescript
// SimpleEditor.tsx
const isDraggingRef = useRef(false);

const updateTracks = useCallback((updater: (prev: Track[]) => Track[]) => {
  setTracks((prev) => {
    const updated = updater(prev);
    if (updated === prev) return prev; // 五轮修正 F5：快速路径，跳过 normalize 避免新对象
    return isDraggingRef.current ? updated : normalizeTimelineTracks(updated);
  });
}, []);

// 新增：显式 normalize 当前 tracks
const normalizeNow = useCallback(() => {
  setTracks((prev) => normalizeTimelineTracks(prev));
}, []);

// 传给 SimpleTimeline：
const handleDragStateChange = useCallback((isDragging: boolean) => {
  isDraggingRef.current = isDragging;
  if (!isDragging) {
    normalizeNow(); // 松手时触发最终 normalize
  }
}, [normalizeNow]);
```

```typescript
// SimpleTimeline props 新增：
onDragStateChange?: (isDragging: boolean) => void;

// handleMouseDown 中（shouldDrag 首次为 true 时）：
if (shouldDrag && !dragState.isDragging) {
  onDragStateChange?.(true);
}

// handleMouseUp 中：
onDragStateChange?.(false);

// handleResizeUp 中：
onDragStateChange?.(false);
```

四轮决策理由（选择 onDragStateChange prop 而非 options.skipNormalize）：
- 职责分离：Timeline 只报告拖拽状态，Editor 决定如何响应
- `updateTracks` 签名不变，`useTransitionHandlers` 等调用方零改动
- undo/redo 扩展友好：Editor 层有完整的拖拽生命周期信息
- 与 Kdenlive Controller/Model 分层一致

**4.1.3 clamp 集成到 validateTransitions（四轮最终方案）**

在 `validateTransitions` 内部，遇到超标转场时 clamp 而非 continue 丢弃。类似 Premiere/Kdenlive 的"自动缩短转场"行为。

四轮决策：**集成到 validateTransitions 内部**（而非独立 clampTransitionDurations 函数）。理由：
- Kdenlive `requestMixResize` 和 Olive `TransitionBlock` 都采用集成模式
- 链式预算账本（`incomingDuration`/`outgoingDuration`）在 validate 循环内是精确的累加状态，clamp 后立即更新账本
- 消除浮点二次计算分歧（独立 clamp 和 validate 对 effectiveMax 的计算路径不同，可能产生 ±1e-15 差异）
- 外部调用方（`useTransitionHandlers`、`handleMoveClip` 等）零改动

最小可见时长：`MIN_VISIBLE_DURATION = 0.1s`（与现有 `Math.max(0.1, duration)` 下限一致，行业标准 1 帧 ≈ 0.04s）。clamp 上限为 `effectiveMax - MIN_VISIBLE_DURATION`，确保 clip 至少保留 0.1s 不被转场覆盖。

```typescript
// transitionResolver.ts — 修改 validateTransitions
export const MIN_VISIBLE_DURATION = 0.1;

function validateTransitions(track: Track, transitions: Transition[]): {
  valid: Transition[];
  clampedIds: Set<string>;
  invalid: Transition[];
} {
  // ...（前置：clipIndexMap, usedAsFrom, usedAsTo 等不变）
  const valid: Transition[] = [];
  const clampedIds = new Set<string>();
  const invalid: Transition[] = [];

  // 五轮修正 V1：按 clip 顺序排序 transitions，保证链式预算分配确定性
  const sortedTransitions = [...transitions].sort((a, b) => {
    const aIdx = clipIndexMap.get(a.fromClipId) ?? Infinity;
    const bIdx = clipIndexMap.get(b.fromClipId) ?? Infinity;
    return aIdx - bIdx;
  });

  for (const transition of sortedTransitions) {
    // 类型、相邻性、唯一性校验 — 不通过直接 invalid
    if (!isValidType || !isAdjacent || !isUnique) {
      invalid.push(transition);
      continue;
    }

    // 计算当前可用预算（链式感知）
    const fromClip = sortedClips[fromIdx];
    const toClip = sortedClips[toIdx];
    const existingIncoming = incomingDuration.get(transition.fromClipId) ?? 0;
    const existingOutgoing = outgoingDuration.get(transition.toClipId) ?? 0;

    const fromBudget = fromClip.duration - existingIncoming;
    const toBudget = toClip.duration - existingOutgoing;
    const effectiveMax = Math.min(maxDuration, fromBudget, toBudget);
    const clampMax = Math.max(0, effectiveMax - MIN_VISIBLE_DURATION);

    if (clampMax <= 0) {
      invalid.push(transition);
      continue;
    }

    let finalDuration = transition.duration;
    if (!Number.isFinite(finalDuration) || finalDuration <= 0) {
      invalid.push(transition);
      continue;
    }

    if (finalDuration > clampMax + 1e-9) {
      finalDuration = clampMax;
      clampedIds.add(transition.id);
    }

    // 更新账本用 finalDuration
    outgoingDuration.set(transition.fromClipId, finalDuration);
    incomingDuration.set(transition.toClipId, finalDuration);
    valid.push(finalDuration !== transition.duration
      ? { ...transition, duration: finalDuration }
      : transition);
  }

  return { valid, clampedIds, invalid };
}
```

`normalizeTrackTransitionsWithInvalid` 适配返回值变更：
```typescript
function normalizeTrackTransitionsWithInvalid(track: Track) {
  const explicitTransitions = track.transitions ?? deriveLegacyTransitions(track);
  const { valid, clampedIds, invalid } = validateTransitions(track, explicitTransitions);
  // valid 已包含 clamp 后的转场，invalid 包含完全无法挽救的转场
  // clampedIds 可用于 UI 提示（可选）
  return { transitions: valid, invalidTransitions: invalid };
}
```

注意事项：
- `MIN_VISIBLE_DURATION` 放入 `constants.ts`
- transitions 数组顺序影响 `incomingDuration`/`outgoingDuration` 累积，已在伪代码中加入排序（五轮 V1）
- `normalizeTrackTransitions` 的公开签名不变（只返回 `Track`），所有外部调用方零改动
- `clampedIds` 保留在 `validateTransitions` 返回值中供未来 UI 提示扩展，`normalizeTrackTransitionsWithInvalid` 当前不传递（五轮 V2）
- `getChainAwareMaxDuration` 也需要减去 `MIN_VISIBLE_DURATION`，保持 slider max 与 clamp 上限一致，避免 slider 拖到 max 后被弹回（五轮 V4）

**4.1.4 清理通知实现（五轮修正：移到 SimpleEditor，区分主动删除和自动清理）**

不在 `updateTracks` 的 updater 中写副作用（避免 React concurrent mode 问题）。通知逻辑放在 SimpleEditor（而非 SimpleTimeline），因为 Editor 层有完整的操作上下文，能区分"用户主动删除"和"normalize 自动清理"。

```typescript
// SimpleEditor.tsx
const prevTransitionCountRef = useRef<number>(0);
const isUserDeletingRef = useRef(false);

useEffect(() => {
  const currentCount = tracks.reduce(
    (sum, t) => sum + (t.transitions?.length ?? 0), 0
  );
  const prevCount = prevTransitionCountRef.current;
  prevTransitionCountRef.current = currentCount;

  if (prevCount > 0 && currentCount < prevCount && !isUserDeletingRef.current) {
    const removed = prevCount - currentCount;
    message.warning(`已自动清理 ${removed} 条失效转场`);
  }
  isUserDeletingRef.current = false;
}, [tracks, message]);
```

`handleDeleteTransition` 和 `handleDeleteAllTransitions` 执行前设置 `isUserDeletingRef.current = true`，避免误报。`isUserDeletingRef` 通过 `useTransitionHandlers` 参数传入。

五轮验证的误报场景：
- 用户点"清除转场" → `isUserDeletingRef = true` → useEffect 跳过 warning → 只弹 success toast ✓
- 用户删除单个转场 → 同上 ✓
- 拖动松手后 normalize 清理 → `isUserDeletingRef = false` → useEffect 弹 warning toast ✓
- Quick Add 后 normalize 过滤候选 → 数量增加不减少 → 不触发 ✓

**4.1.5 拖动性能优化（二轮确认）**

- `resolveTimelineTracks` 每帧 < 0.1ms（20 clips + 5 transitions），不需要 throttle/rAF
- skipNormalize 后每帧 normalize 从 2 次降到 1 次（`resolveTimelineTracks` 内部的那次）
- `handleMoveClip` 加 early return：位置未变时返回原引用，React 跳过 re-render

```typescript
// handleMoveClip early return
updateTracks(prev => {
  const currentTrack = prev.find(t => t.clips.some(c => c.id === clipId));
  const currentClip = currentTrack?.clips.find(c => c.id === clipId);
  if (currentClip?.start === newStart && currentClip?.trackId === newTrackId) {
    return prev; // 相同引用 → 跳过 re-render
  }
  // ... 原有逻辑
}, { skipNormalize: isDraggingRef.current });
```

**4.1.6 失效转场视觉反馈（四轮更新：pointer-events-none）**

TransitionOverlay 利用 `resolveTimelineTracks` 返回的 `invalidTransitions` 实时渲染：
- 正常转场：`bg-cyan-500/20 border-cyan-500/50 text-cyan-300`
- 失效转场（拖动中）：`bg-orange-500/20 border-orange-500/50 text-orange-300`，opacity 60%，文案叠加 `⚠ 无效`（五轮修正 P4：从"将被移除"改为"无效"，不暗示不可逆）
- 失效转场（静止）：`bg-zinc-700/40 border-zinc-600/30 text-zinc-500`，strikethrough 文字
- 拖回原位：自动恢复有效状态（数据未被删除），CSS `transition-colors duration-200` 平滑过渡
- 五轮新增 P4：normal → invalid 方向加 `transition-delay: 200ms`（避免快速拖动时橙色闪烁），invalid → normal 方向不延迟（立即恢复）

不用红色的原因：红色在时间轴上已被碰撞检测占用（`border-red-500`），橙色语义更接近"警告/即将发生"。

失效转场交互：**`pointer-events-none`，完全不可交互**（四轮决策）。理由：
- 失效转场是瞬态，松手后 normalize 自动清理，用户无需手动干预
- 可选中会导致 `selectedTransitionId` 指向幽灵 id，状态不一致
- 拖动中禁用转场交互符合直觉——用户在操作 clip，不应同时操作转场

松手后清理 toast：`message.warning('已移除 N 个失效转场')`，用 warning 而非 success（被动清理，非用户主动操作）。

**4.1.7 handleMouseUp / handleResizeUp normalize 时序（四轮更新：onDragStateChange 方案）**

松手时通过 `onDragStateChange(false)` 通知 SimpleEditor，Editor 内部 `isDraggingRef.current = false` 后调用 `normalizeNow()`。

```typescript
// SimpleTimeline handleMouseUp
const handleMouseUp = () => {
  if (dragState.hasCollision && dragState.isDragging) {
    onMoveClip(dragState.clipId, dragState.originalStart, dragState.originalTrackId);
  }
  setDragState(null);
  onDragStateChange?.(false);  // 通知 Editor 拖动结束 → normalize
};

// SimpleTimeline handleResizeUp
const handleResizeUp = () => {
  setResizeState(null);
  onDragStateChange?.(false);  // 通知 Editor resize 结束 → normalize
};
```

时序安全性：`onDragStateChange` 回调中 `isDraggingRef.current = false` 是同步赋值，`normalizeNow()` 内部的 `setTracks` 在同一事件处理器中被 React 18 batch，不存在竞态。

**4.1.8 跨轨道拖动清理（三轮验证）**

`handleMoveClip`（SimpleEditor.tsx:298-327）跨轨道清理逻辑已验证正确：
- `isLeavingTrack === true` 时，源轨道过滤所有引用该 clip 的转场（fromClipId 和 toClipId）
- 目标轨道只添加 clip，不自动添加转场
- 同轨道移动不清理转场，依赖 normalize 兜底（skipNormalize 期间转场短暂 invalid，`resolveTimelineTracks` 的 `invalidTransitions` 正确反映）

**改动文件：**
- `SimpleTimeline.tsx` — 移除 3 处 block，增加 prevTransitionCountRef 清理通知
- `SimpleEditor.tsx` — `updateTracks` 增加 `skipNormalize`，`isDraggingRef`，`handleMoveClip` early return
- `TransitionOverlay.tsx` — 增加失效转场视觉反馈（基于 invalidTransitions）
- `transitionResolver.ts` — 新增 `clampTransitionDurations`，在 validate 前调用

### 4.2 P0: Quick Add + 批量删除

**Quick Add 方案：一次性生成所有候选转场，由 normalize 统一验证**

- 新增 `useTransitionHandlers.ts` → `handleAddAllTransitions(trackId)`
- 遍历 `getSortedTrackClips`，对每对相邻 clip 生成候选转场（跳过已有转场的切点）
- 候选转场合并到 `track.transitions`，由 `normalizeTimelineTracks` 统一验证链式约束
- 单次 `updateTracks` 调用 = 单次渲染，无 N 次渲染风暴
- 使用 `DEFAULT_TRANSITION_DURATION`（0.5s）

**Quick Add 边界场景（三轮细化，6 种）：**

| 场景 | 按钮状态 | 点击后行为 | 提示文案 |
|------|----------|-----------|---------|
| 空轨道（0 clips） | disabled | — | tooltip: "轨道无片段" |
| 单 clip（无切点） | disabled | — | tooltip: "需要至少 2 个相邻片段" |
| 所有切点已有转场 | enabled | 执行后无变化 | info toast: "所有切点已有转场"（五轮修正：与 D8 对齐） |
| 部分切点已有转场 | enabled | 仅对无转场的紧密切点添加，跳过已有 | toast: "已为 N 个切点添加淡变转场" |
| clips 间有间隙 | enabled（若有紧密切点） | 跳过有间隙的切点 | toast: "已为 N 个切点添加淡变转场（跳过 M 个间隙切点）" |
| 无选中 clip | enabled | 作用于主轨道 | 同上（五轮修正：始终作用于主轨道，不作用于所有视频轨道） |

间隙判断复用 `getMaxTransitionDuration` 返回 0 的逻辑（`sameCutPoint` 检查，容差 1e-6），不需要额外判断。

Quick Add 后不自动选中任何转场（剪映/CapCut 同行为），保持无选中态，用户可点击任意转场精细调整。

**共享计算函数（三轮新增）：**

在 `transitionResolver.ts` 中新增 `getAddableTransitionCount(track)` 和 `getExistingTransitionCount(track)`，供 toolbar 按钮状态、右键菜单 disabled 条件复用。

**批量删除方案：**

- 新增 `handleDeleteAllTransitions(trackId)`
- 清空 `track.transitions` 为 `[]`，统一 `setSelectedTransitionId(null)`
- 使用 Ant Design `Popconfirm` 气泡确认（非模态对话框）
- Popconfirm 文案：`"删除所有转场"` + description `"将删除该轨道上的 N 个转场，无法撤销"`
- `okButtonProps={{ danger: true }}`，`placement="topRight"`
- `disabled` 时 Popconfirm 不触发（Ant Design 内置行为）
- 删除后 toast：`message.success('已清除全部 N 个转场')`

**Toolbar 按钮状态（三轮细化）：**

| 按钮 | disabled 条件 | 文案 | 图标（lucide-react） | 视觉权重 |
|------|--------------|------|---------------------|---------|
| 一键转场 | `clipCount <= 1`（五轮修正：空轨道/单clip 才 disabled，全部已有转场时 enabled+toast） | `一键转场` | `Wand2` | 主操作，`bg-zinc-700 hover:bg-zinc-600` |
| 清除转场 | `existingCount === 0` | `清除转场` | `Eraser` | 次操作，ghost `text-zinc-500 hover:text-red-400` |

固定文案，不带计数（四轮决策 D7）。一键转场按钮在所有切点已有转场时 enabled，点击后 info toast（四轮决策 D8）。

**交互入口：**
- 主入口：Timeline toolbar "一键转场" 按钮（紧挨导出按钮左侧）
- 辅助入口：轨道头右键菜单
- 目标轨道：始终作用于主轨道（`isMainTrack === true`），不受 selectedClipId 影响（五轮修正：避免叠加轨道误操作）

**轨道右键菜单（三轮新增）：**

clip 右键菜单（`contextMenu.type === 'clip'`）新增转场操作组：
```
添加关键帧
复制片段
─────────────
为此切点添加转场    ← 仅当该 clip 有相邻下一个 clip 且无转场时 enabled
删除此转场          ← 仅当该 clip 与下一个 clip 之间已有转场时 enabled
─────────────
删除片段
```

轨道头右键菜单（新增 `contextMenu.type === 'track'`）：
```
重命名轨道
─────────────
一键转场 (N)        ← addableCount > 0 时 enabled
清除转场 (N)        ← existingCount > 0 时 enabled
─────────────
静音 / 取消静音
隐藏 / 显示
删除轨道
```

菜单项 disabled 条件与 toolbar 按钮一致，复用 `getAddableTransitionCount` / `getExistingTransitionCount`。

**改动文件：**
- `useTransitionHandlers.ts` — 新增 `handleAddAllTransitions`、`handleDeleteAllTransitions`
- `transitionResolver.ts` — 新增 `getAddableTransitionCount`、`getExistingTransitionCount`
- `constants.ts` — `DEFAULT_TRANSITION_DURATION` 0.3→0.5，新增 `MAX_TRANSITION_DURATION = 2.0`
- `SimpleTimeline.tsx` — toolbar 添加按钮，右键菜单扩展

### 4.3 P1: 转场跨度可视化 + Inline Slider

**转场跨度可视化（三轮细化）：**
- 在 TransitionOverlay 中，对每个有效转场渲染一个半透明色块标示时间跨度
- 色块从 `activeStartTime` 到 `activeEndTime`，数据已在 `transitionPlans` 中
- 定位：`left = activeStartTime * pixelsPerSecond`，`width = (activeEndTime - activeStartTime) * pixelsPerSecond`
- z-index 层级：`z-5`（clip 之下），不遮挡 clip 缩略图
- 颜色：`rgba(34,211,238,0.12)`（cyan-400/12），左右边框 `rgba(34,211,238,0.4)`
- 当 `pixelsPerSecond` 很小时，`minWidth: 2` 保证可见
- 失效转场不渲染跨度色块（没有对应的 `NormalizedTransitionPlan`）

**Inline Slider（三轮细化）：**
- TransitionOverlay 选中态从 `[- ] [+] [x]` 改为 `[slider====o====] [x]`
- 使用原生 `input[type=range]`（Ant Design Slider 在 10px 高度标签里难控制），`accent-color: cyan-500`
- Slider 宽度：`Math.max(60, Math.min(120, plan.maxDuration * pixelsPerSecond * 0.8))`，60-120px 自适应
- 范围 0.1 到 `plan.maxDuration`（从 `plansByTransitionId` 读取，不再调用 `getChainAwareMaxDuration`），步长 0.1s
- `onChange` 实时更新转场时长（resolver 是纯函数，无副作用）
- 小屏降级：当计算宽度 < 60px 时回退到 +/- 按钮

**改动文件：**
- `TransitionOverlay.tsx` — 转场跨度色块 + inline slider 替代 +/-

### 4.4 P2: Default Transition 设置

**方案：localStorage + 自定义 hook**

- 新建 `useDefaultTransition.ts`，使用 localStorage 持久化用户偏好
- 转场默认时长是用户偏好（非项目数据），应跨项目持久化
- `handleAddTransition` 和 `handleAddAllTransitions` 读取此值替代硬编码默认值
- UI：Inspector 面板或 timeline toolbar 中提供时长设置入口

**改动文件：**
- 新建 `services/transition/useDefaultTransition.ts`
- `useTransitionHandlers.ts` — 参数增加 `defaultDuration`

### 4.5 P2: Inspector 面板

**方案：新建 `TransitionInspector.tsx` 组件，复用 SimplePropertiesPanel 布局**

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
| 一键转场（Quick add） | Timeline toolbar 按钮（主入口） | — |
| 批量删除 | Timeline toolbar 按钮 + Popconfirm 确认 | — |
| 一键转场/批量删除 | 轨道头右键菜单（辅助入口） | — |
| 调整时长 | TransitionOverlay inline slider（P1） | — |
| 删除单个 | TransitionOverlay × 按钮 | Delete |
| 设置默认时长 | Inspector 面板（P2） | — |

## 6. 新增组件

| 组件 | 位置 | 职责 | Segment |
|------|------|------|---------|
| `useDefaultTransition.ts` | `services/transition/` | localStorage 持久化转场默认偏好 | 4 |
| `TransitionInspector.tsx` | `components/editor/` | 转场属性面板（P2） | 4 |

## 7. 现有组件改动范围

| 文件 | 改动 | Segment |
|------|------|---------|
| `SimpleTimeline.tsx` | 移除 3 处 block，新增 `onDragStateChange` prop，toolbar 添加按钮（一键转场+清除转场，固定文案，disabled 条件 `clipCount <= 1`），右键菜单扩展（clip 级后切点+轨道级，非主轨道隐藏一键转场） | 1, 2 |
| `SimpleEditor.tsx` | `isDraggingRef` + `normalizeNow` + `handleDragStateChange` 回调，`updateTracks` 加 `updated === prev` 快速路径，`handleMoveClip` early return，`prevTransitionCountRef` + `isUserDeletingRef` 清理通知（五轮从 Timeline 移入） | 1 |
| `useTransitionHandlers.ts` | 新增 handleAddAllTransitions、handleDeleteAllTransitions（签名不变），接收 `isUserDeletingRef` 参数 | 2 |
| `constants.ts` | `DEFAULT_TRANSITION_DURATION` 0.3→0.5，新增 `MAX_TRANSITION_DURATION = 2.0`，新增 `MIN_VISIBLE_DURATION = 0.1` | 1, 2 |
| `TransitionOverlay.tsx` | props 重构为 `resolvedTimeline`，失效转场 `pointer-events-none` 橙色警告态，转场跨度色块（z-5），inline slider（原生 range + 小屏降级，onChange 直接提交） | 1, 3 |
| `transitionResolver.ts` | `validateTransitions` 集成 clamp（返回 `{valid, clampedIds, invalid}`，入口按 clip 顺序排序 transitions），`getChainAwareMaxDuration` 减去 MIN_VISIBLE_DURATION，新增 `getAddableTransitionCount`/`getExistingTransitionCount`，新增 `getClipAudioFade`（Segment 5） | 1, 2, 5 |
| `simpleEngine.ts` | getClipVolume 改用 audio fade 函数（P2） | 5 |

## 8. 建议实施顺序

```
Segment 1: 解除拖动限制（P0）
  - isDraggingRef + normalizeNow + onDragStateChange prop（SimpleEditor ↔ SimpleTimeline）
  - validateTransitions 集成 clamp（链式感知 + MIN_VISIBLE_DURATION）
  - handleMoveClip early return（位置未变返回原引用）
  - TransitionOverlay 失效转场视觉反馈（pointer-events-none 橙色警告态）
  - prevTransitionCountRef 清理通知
  - 移除 3 处 block（drag/resize/drop）
  - 单元测试：clamp 集成（含链式场景）、跨轨道清理
  ↓
Segment 2: Quick add + 批量删除 + DEFAULT_TRANSITION_DURATION→0.5（P0）
  - handleAddAllTransitions / handleDeleteAllTransitions
  - getAddableTransitionCount / getExistingTransitionCount
  - Toolbar 按钮（动态文案 + disabled 状态）
  - Popconfirm 批量删除确认
  - 右键菜单扩展（clip 级 + 轨道级）
  ↓
Segment 3: 转场跨度可视化 + inline slider 替代 +/-（P1）
  - 跨度色块（z-5，cyan-400/12）
  - 原生 input[type=range]，60-120px 自适应，小屏降级
  ↓
Segment 4: Default transition 用户设置 + Inspector 面板（P2）
  ↓
Segment 5: 音频 crossfade（P2）
  ↓
Segment 6: 回归测试增强
```

Segment 1-2 是 Phase 2 MVP，Segment 3 是体验打磨，Segment 4-5 是长尾优化。
每个 Segment 独立可交付，可验证。

## 9. 风险点

1. **拖动中 skipNormalize 的数据一致性** — 拖动过程中 tracks 处于未规范化状态。缓解：`resolveTimelineTracks` 内部自带 normalize，渲染仍然正确；松手时 `onDragStateChange(false)` → `normalizeNow()` 执行最终 normalize。四轮确认：onDragStateChange prop 方案，ref 同步赋值无竞态。
2. **Quick add 链式约束** — 批量添加时后续转场可能因链式约束被拒绝。缓解：一次性生成候选，`validateTransitions` 按顺序统一验证（含集成 clamp）。
3. **addedCount 精确性** — `normalizeTimelineTracks` 可能过滤部分候选转场，导致实际添加数 < 提示数。缓解：使用 prevTransitionCountRef 方案，在 normalize 后通过转场数量差值精确计算。
4. **拖动清理无 undo** — SimpleEditor 没有 undo 系统（trackStore 有但不共用）。缓解：Quick Add 可一键恢复；clamp 集成到 validate 减少不必要的转场删除；`updateTracks` 已是原子操作，未来加 undo 栈不需改语义。四轮确认：onDragStateChange 方案对 undo/redo 扩展友好。
5. **Batch apply 渲染风暴** — 长轨道（50+ clips）一次性插入大量转场。缓解：单次 `updateTracks` 调用 = 单次渲染，已验证无 N 次渲染问题。
6. ~~**normalizeTrackTransitions 性能**~~ — 二轮确认：每帧 < 0.1ms（20 clips），不需要 throttle/rAF。**已降级为非风险。**
7. ~~**clamp-before-validate 的 0.9 系数**~~ — 四轮最终方案：clamp 集成到 validateTransitions 内部，使用 `effectiveMax - MIN_VISIBLE_DURATION(0.1s)` 替代 0.9 系数。**已解决。**
8. ~~**clamp 转场顺序依赖**~~ — 链式感知 clamp 中 `incomingDuration`/`outgoingDuration` 累积依赖 transitions 数组顺序。五轮修正：validateTransitions 入口按 clip 顺序排序 transitions，§4.1.3 伪代码已更新。**已解决。**
9. ~~**TransitionOverlay props 重构兼容性**~~ — 纯 prop 重组，不涉及逻辑变化。四轮确认：不加 `chainAwareMaxDuration` 字段，TransitionOverlay 继续调用 `getChainAwareMaxDuration`。**已降级为非风险。**
10. **validateTransitions 返回值变更（四轮新增）** — 从 `Transition[]` 改为 `{valid, clampedIds, invalid}`。缓解：`normalizeTrackTransitions` 的公开签名不变（只返回 `Track`），所有外部调用方零改动。内部适配约 25 行改动。
11. ~~**prevTransitionCountRef 误报（五轮新增）**~~ — 用户主动删除转场时误弹"已自动清理"warning toast。五轮修正：通知逻辑移到 SimpleEditor，增加 `isUserDeletingRef` 标志。§4.1.4 已重写。**已解决。**
12. ~~**slider max 与 clamp 上限不一致（五轮新增）**~~ — `getChainAwareMaxDuration` 不减 MIN_VISIBLE_DURATION，slider 拖到 max 后被弹回。五轮修正：§4.1.3 注意事项已补充。**已解决。**
13. ~~**Quick Add 叠加轨道误操作（五轮新增）**~~ — selectedClipId 指向叠加轨道时 Quick Add 作用于叠加轨道（fade 无意义）。五轮修正：Quick Add toolbar 始终作用于主轨道。§4.2 已更新。**已解决。**

## 10. 成功指标

1. 添加 10 个转场的操作从 ~30 次点击降到 1 次（Quick add）
2. 调整转场时长从 +/- 按钮多次点击变为滑块一次拖拽
3. 含转场轨道可正常拖动/resize 片段，无需先删除转场
4. Phase 2 上线后 > 40% 的项目包含转场（转场功能周活跃使用率）

## 11. 团队深度评审（2026-03-23 多轮讨论）

### 第一轮：产品深度分析

**Quick Add 交互设计：**
- 主入口放 timeline toolbar（紧挨导出按钮左侧），按钮文案"一键转场"
- 目标轨道逻辑：当前选中 clip 所在轨道，无选中则作用于主轨道（短剧场景 90%+ 操作在主轨道）
- 点击后直接执行（添加是安全操作），不弹确认框
- 跳过已有转场的切点（只填空不覆盖），用户可先手动调个别转场再 Quick Add 填充剩余

**默认时长调整：**
- `DEFAULT_TRANSITION_DURATION` 从 0.3s 调整为 0.5s（竞品参考：剪映 0.5-1.0s，Premiere/DaVinci 1.0s）
- 新增 `MAX_TRANSITION_DURATION = 2.0s` 硬上限
- 0.3s 太短视觉几乎感知不到，0.5s 是短片段（2-5s）场景的甜点

**"应用到全部" vs Quick Add：**
- Phase 2 只做 Quick Add，不做"应用到全部"
- 理由：fade-only 下"应用到全部"的核心价值（统一类型）不存在，Phase 3+ 多转场类型时再加

**批量删除确认：**
- 使用 Ant Design `Popconfirm` 气泡确认，显示"确认清除轨道上的 N 个转场？"
- 不用模态对话框（太重），不完全无确认（无 undo 风险高）

**Inspector 降级理由：**
- 当前 +/- 按钮对 fade-only 场景够用，inline slider 替代方案成本更低
- Inspector 的核心价值在多转场类型选择，Phase 2 fade-only 不需要

### 第一轮：架构深度分析

**拖动 normalize 策略（关键发现）：**
- 当前 `handleMouseMove` 每帧调用 `onMoveClip` → `updateTracks` → `normalizeTimelineTracks`
- 问题：拖动过程中转场被实时清理，用户还没松手转场就消失了
- 方案：`updateTracks` 增加 `skipNormalize` 选项，拖动中跳过，松手时执行
- `resolveTimelineTracks` 内部自带 normalize，skipNormalize 期间渲染仍正确

**跨轨道拖动：**
- `handleMoveClip` 已处理：clip 离开源轨道时清理引用该 clip 的转场
- `normalizeTimelineTracks` 对所有轨道执行 normalize
- 不需要额外处理

**Quick Add 实现要点：**
- 一次性生成候选 → 合并到 `track.transitions` → `normalizeTimelineTracks` 统一验证
- 不要循环调用 `handleAddTransition`（N 次 updateTracks = N 次渲染）
- `validateTransitions` 按顺序遍历，自动处理链式约束

**Default transition 存储：**
- 推荐 `localStorage` + 自定义 hook，不走 Zustand store
- 理由：用户偏好应跨项目持久化，当前 settings store 不是 Zustand

**Undo 现状确认：**
- SimpleEditor 没有 undo 系统（独立 `useState<Track[]>`，不走 trackStore）
- Phase 2 不做 undo，记录为 tech debt
- `updateTracks` 已是原子操作，未来加 undo 栈不需改语义

**normalize 性能分析：**
- 当前 O(m * n log n)，50 clips 微秒级，无需优化
- 100+ clips 时可提取 sortedClips 避免 `getMaxTransitionDuration` 内部重复排序

### 第一轮：前端视角（部分）

- Quick Add 入口放 timeline toolbar（一级入口），批量操作放轨道右键菜单
- Inspector 复用 SimplePropertiesPanel 布局（w-72, bg-[#18181b], border-l）
- 拖动时转场标签视觉反馈：正常=cyan，即将删除=红色半透明+删除线
- 项目使用 lucide-react 图标库 + Ant Design 6 组件库

### 第一轮跨视角共识

1. **批量删除必须与 Quick Add 同时交付**（产品+架构一致）
2. **Default transition 设置降为 P2**（产品+架构一致：硬编码 0.5s 足够）
3. **Inspector 降为 P2**（产品+架构一致：inline slider 替代方案更务实）
4. **skipNormalize 是拖动解锁的关键**（架构提出，产品认可）
5. **无 undo 不阻塞 Phase 2**（架构确认，产品认可：Quick Add 降低恢复成本）

---

### 第二轮：架构深度分析（参考开源编辑器）

#### Q1: skipNormalize 方案对比（4 方案 + 开源参考）

对比了四种拖动中转场处理方案：

| 方案 | 描述 | 开源参考 | 评价 |
|------|------|----------|------|
| a) 实时 normalize | 拖动中每帧 normalize，转场立即删除 | OpenShot（已知 bug：转场不跟随 clip） | 最差，一拖就没 |
| b) skipNormalize | 拖动中跳过 normalize，松手时执行 | 接近 Kdenlive Mix（转场随重叠量变化） | **推荐** |
| c) 实时调整时长 | 拖动中动态修改 transition.duration | Shotcut（基于物理重叠区域） | 需重构模型为物理重叠，Phase 2 不可承受 |
| d) 冻结渲染 | 拖动中完全不重算，松手时重算 | 无 | 性能最好但视觉反馈最差 |

**结论：方案 b（skipNormalize）确认为最佳选择。**

关键优势：
- `resolveTimelineTracks` 内部的 `normalizeTrackTransitionsWithInvalid` 天然提供 `invalidTransitions`，TransitionOverlay 可实时显示红色失效状态
- 转场数据在拖动中不被删除，拖回原位自动恢复有效
- 实现成本最低——只需 `updateTracks` 加一个条件分支

具体实现：
```typescript
// SimpleEditor.tsx
const isDraggingRef = useRef(false);

const updateTracks = useCallback((
  updater: (prev: Track[]) => Track[],
  options?: { skipNormalize?: boolean }
) => {
  setTracks((prev) => {
    const next = updater(prev);
    return options?.skipNormalize ? next : normalizeTimelineTracks(next);
  });
}, []);
```

#### Q2: 拖动性能分析

**调用链（skipNormalize 后）：**
```
handleMouseMove (每帧 ~60fps)
  → onMoveClip { skipNormalize: true }
    → setTracks(updater)  // 无 normalize
      → React re-render
        → useMemo resolveTimelineTracks  // 内部 normalize 1 次（原来每帧 2 次）
```

**性能评估：**
- `resolveTimelineTracks` 对 20 clips + 5 transitions：每帧 < 0.1ms，完全不是瓶颈
- 不需要 throttle 或 rAF 优化
- 真正的渲染瓶颈在 Filmstrip 组件（大量 img 元素），但这不是 Phase 2 的问题

**推荐的小优化——early return：**
```typescript
// handleMoveClip 中，位置未变时返回原引用，跳过 re-render
const handleMoveClip = useCallback((clipId, newStart, newTrackId) => {
  updateTracks(prev => {
    const currentTrack = prev.find(t => t.clips.some(c => c.id === clipId));
    const currentClip = currentTrack?.clips.find(c => c.id === clipId);
    if (currentClip && currentClip.start === newStart && currentClip.trackId === newTrackId) {
      return prev; // React setState 返回相同引用时跳过 re-render
    }
    // ... 原有逻辑
  }, { skipNormalize: isDraggingRef.current });
}, [updateTracks]);
```

#### Q3: 转场清理通知实现

**推荐方案：SimpleTimeline 中基于 tracks 转场数量变化检测**

不在 `updateTracks` 的 updater 中写副作用（避免 concurrent mode 问题），而是在 SimpleTimeline 中用 ref 跟踪转场数量变化：

```typescript
// SimpleTimeline.tsx
const prevTransitionCountRef = useRef<number>(0);

useEffect(() => {
  const currentCount = tracks.reduce(
    (sum, t) => sum + (t.transitions?.length ?? 0), 0
  );
  const prevCount = prevTransitionCountRef.current;
  prevTransitionCountRef.current = currentCount;

  if (prevCount > 0 && currentCount < prevCount) {
    const removed = prevCount - currentCount;
    onTransitionError?.(`已自动清理 ${removed} 条失效转场`);
  }
}, [tracks, onTransitionError]);
```

优势：不依赖 updater 副作用，逻辑清晰，与 React concurrent mode 兼容。

#### Q4: resize 操作的转场处理

**结论：resize 也使用 skipNormalize，且 normalize 时先 clamp 再 validate。**

三种 resize 场景分析：
- 缩短 clip（end 左拖）：转场 duration 可能超过新 clip.duration → 需要处理
- 拉长 clip（end 右拖）：约束只会更宽松 → 不需要处理
- 缩短 clip 左侧（start 右拖）：可能产生间隙 → 前一个转场失效

**关键改进：在 `normalizeTrackTransitionsWithInvalid` 中增加 clamp 步骤**

在 `validateTransitions` 之前先尝试修复转场时长，而不是直接删除：

```typescript
// transitionResolver.ts — 新增
function clampTransitionDurations(track: Track): Track {
  const sortedClips = getSortedTrackClips(track);
  const clipMap = new Map(sortedClips.map(c => [c.id, c]));

  return {
    ...track,
    transitions: (track.transitions ?? []).map(t => {
      const from = clipMap.get(t.fromClipId);
      const to = clipMap.get(t.toClipId);
      if (!from || !to) return t;
      const max = Math.min(from.duration, to.duration);
      return t.duration > max ? { ...t, duration: Math.max(0.1, max * 0.9) } : t;
    }),
  };
}
```

这是跨场景的改进——resize、move、以及任何导致 clip duration 变化的操作都能先尝试修复转场而不是直接删除。类似 Premiere 的"自动缩短转场"行为。

#### Q5: drop（外部素材拖入）的转场处理

**结论：drop 不需要 skipNormalize，只需去掉 block 即可。**

关键发现：在 Koma 的模型中，有转场的 clip 对必须紧密相邻（`sameCutPoint` 检查）。紧密相邻意味着没有间隙可以插入新 clip。所以 `findNextAvailablePosition` 不会把新 clip 插入到有转场的相邻 clip 之间——它会自动跳过，把新 clip 放到轨道末尾或其他有间隙的位置。

处理方式：
- 去掉 SimpleTimeline.tsx 第 637-641 行的 block
- `normalizeTimelineTracks` 在 `updateTracks` 中执行一次即可兜底
- 不需要 skipNormalize，不需要额外逻辑

### 第二轮：产品深度分析（参考竞品交互）

（基于第一轮结论的细化确认，与架构分析一致）

- "一键转场"按钮确认放 toolbar，与导出按钮同级
- 批量删除 Popconfirm 确认交互不变
- 拖动中失效转场的红色视觉反馈方案确认
- 松手后自动清理 + toast 通知方案确认

### 第二轮跨视角共识与决策更新

| # | 决策 | 理由 | 影响 |
|---|------|------|------|
| 1 | skipNormalize 方案 b 最终确认 | 4 方案对比 + 开源参考，实现成本最低、视觉反馈最好 | §4.1 不变 |
| 2 | 不需要 throttle/rAF | resolveTimelineTracks < 0.1ms/帧，加 early return 即可 | §9 移除性能风险 |
| 3 | 清理通知用 prevTransitionCountRef | 不在 updater 中写副作用，兼容 concurrent mode | §4.1 实现细化 |
| 4 | resize 也用 skipNormalize | 与 move 统一方案，降低实现复杂度 | §4.1 扩展 |
| 5 | normalize 增加 clamp 步骤 | 先修复再删除，类似 Premiere 自动缩短转场 | §4.1 新增，**重要改进** |
| 6 | drop 只去 block，不需要 skipNormalize | findNextAvailablePosition 不会插入紧密相邻 clip 之间 | §4.1 简化 |
| 7 | handleMoveClip 加 early return | 位置未变时返回原引用，免费跳过 re-render | §4.1 小优化 |

---

### 第三轮：架构深度分析（链式 clamp、normalize 时序、跨轨道验证、测试策略）

#### Q1: clampTransitionDurations 必须链式感知

二轮的单侧 clamp（`min(from.dur, to.dur) * 0.9`）在链式场景下不够：

数值示例：A(3s)→B(1.5s)→C(4s)，A→B 转场 1.5s，B→C 转场 1.5s。resize B 到 1.5s 后：
- 单侧 clamp：`min(3, 1.5) = 1.5 * 0.9 = 1.35s`
- 链式约束：`1.35 + 1.35 = 2.7 > 1.5`，仍然违反

解决方案：串行预算分配（参考 Kdenlive `requestClipResize` 的 `qMin(mixDuration, newClipDuration - otherSideMix)`）。按 clip 顺序处理 transitions，用 `incomingUsed` Map 记录每个 clip 已被 incoming 转场消耗的预算，后续转场从剩余预算中 clamp。

**已更新 §4.1.3 为链式感知版本，废弃固定 0.9 系数。**

#### Q2: invalidTransitions 传递路径验证

代码验证确认：
1. `resolveTimelineTracks` → `ResolvedTrackTimeline`（含 `invalidTransitions`）
2. `SimpleTimeline` 的 `resolvedTracksMap` 已包含完整数据
3. skipNormalize 期间，`resolveTimelineTracks` 内部的 normalize 仍会产生 `invalidTransitions`，传递路径不受影响

传递方式：传 `invalidTransitionIds: Set<string>` 比 `Transition[]` 更高效（`Set.has()` O(1)），在父组件用 `useMemo` 计算。

#### Q3: handleMouseUp / handleResizeUp normalize 时序

对比三种方案后确认方案 B：

| 方案 | 描述 | 问题 |
|------|------|------|
| A | `updateTracks(prev => prev)` | identity updater 可能被 React 跳过 |
| **B** | **ref 先置 false，再调 updateTracks** | **正确，ref 同步赋值不受 batching 影响** |
| C | 不主动触发，等下次操作 | invalid 状态残留，不推荐 |

`handleResizeUp` 当前只有 `setResizeState(null)`，Phase 2 需补充 `isDraggingRef.current = false` + `updateTracks(prev => prev)`。

#### Q4: 跨轨道拖动清理验证

`handleMoveClip`（SimpleEditor.tsx:298-327）验证结果：
- 跨轨道：`isLeavingTrack === true` 时正确过滤所有引用该 clip 的转场
- 目标轨道：只添加 clip，不自动添加转场（正确）
- 同轨道：不清理转场，依赖 normalize 兜底（正确）
- skipNormalize 期间：拖动通过 `setDragState` 驱动，`onMoveClip` 只在 mouseUp 时调用，此时 `isDraggingRef.current` 已是 `false`，normalize 正常执行

潜在注意点：同轨道移动时转场短暂 invalid，`resolveTimelineTracks` 的 `invalidTransitions` 正确反映，TransitionOverlay 可显示橙色警告态。

#### Q5: Segment 1 测试策略

设计 4 类测试用例（参考现有 `transitionResolver.test.ts` 风格）：

1. **clampTransitionDurations 单元测试**
   - 单侧 clamp：转场时长超过较短 clip 时被截断
   - 链式 clamp：中间 clip 预算不足时后侧转场被压缩（数值精度验证）
   - clamp 后 duration=0 的转场保持原值（由 validate 拒绝）

2. **normalize + clamp 集成测试**
   - normalize 后链式约束始终满足
   - 超出链式约束的转场被 clamp 而非丢弃

3. **skipNormalize 行为测试**
   - 拖动中不 normalize，转场保留
   - 松手后 normalize，非相邻转场被清理

4. **跨轨道清理测试**
   - 源轨道转场被清理，目标轨道不自动添加
   - 同轨道移动转场保留，由 normalize 决定合法性

### 第三轮：产品深度分析（Quick Add 边界、toolbar 状态、反馈文案、右键菜单）

#### Q1: Quick Add 6 种边界场景

参考竞品：剪映批量添加时静默跳过已有转场和有间隙切点；Premiere Apply Default Transitions 只作用于选中边界。

| 场景 | 按钮状态 | 点击后行为 | 提示文案 |
|------|----------|-----------|---------|
| 空轨道 | disabled | — | tooltip: "轨道无片段" |
| 单 clip | disabled | — | tooltip: "需要至少 2 个相邻片段" |
| 全部已有转场 | disabled | — | tooltip: "所有切点已有转场" |
| 部分已有 | enabled | 跳过已有，只填空 | toast: "已为 N 个切点添加淡变转场" |
| 有间隙 | enabled（若有紧密切点） | 跳过间隙切点 | toast 追加 "（跳过 M 个间隙切点）" |
| 无选中 clip | enabled | 作用于所有视频轨道 | 同上 |

间隙判断复用 `getMaxTransitionDuration` 返回 0 的逻辑。

#### Q2: Toolbar 按钮状态矩阵

- "一键转场"：`Wand2` 图标，主操作样式，`addableCount === 0` 时 disabled，动态文案 `一键转场 (N)`
- "清除转场"：`Eraser` 图标，ghost 危险样式（`text-zinc-500 hover:text-red-400`），`existingCount === 0` 时 disabled，动态文案 `清除转场 (N)`
- 数量为 0 时不显示括号部分

#### Q3: 失效转场反馈文案

- 正常态：`淡变 0.5s`，cyan-400
- 失效态（拖动中）：保留 `淡变 0.5s` + 叠加 `⚠ 将被移除`，orange-400，opacity 60%
- 不用红色（已被碰撞检测占用），橙色语义更接近"警告/即将发生"
- 松手后清理 toast：`message.warning('已移除 N 个失效转场')`（warning 而非 success，被动清理）

#### Q4: 批量删除状态清理

- 统一 `setSelectedTransitionId(null)`，不回退到某个 clip
- Popconfirm 点击触发（非 hover），`okButtonProps={{ danger: true }}`
- 文案：`"删除所有转场"` + `"将删除该轨道上的 N 个转场，无法撤销"`
- 删除后：`message.success('已清除全部 N 个转场')`

#### Q5: Quick Add 后选中状态

不自动选中（剪映/CapCut 同行为）。理由：批量添加 N 个转场，自动选中任何一个都是武断的；保持无选中态不打断用户心流。

toast 文案：`"已为 N 个切点添加淡变转场"` 优于 `"已添加 N 个转场"`（信息密度更高，说明作用对象和效果类型）。

#### Q6: 轨道右键菜单

clip 右键菜单新增转场操作组（在"复制片段"之后、"删除片段"之前）：
- "为此切点添加转场"（有相邻 clip 且无转场时 enabled）
- "删除此转场"（有转场时 enabled）

轨道头右键菜单（新增 `contextMenu.type === 'track'`）：
- "一键转场 (N)" / "清除转场 (N)"，disabled 条件与 toolbar 一致

### 第三轮：前端深度分析（TransitionOverlay 重构、渲染方案、slider 实现）

#### Q1: TransitionOverlay Props 重构

传整个 `ResolvedTrackTimeline` 替代散装 props（`track` + `resolvedClipWindows`）：

```typescript
interface TransitionOverlayProps {
  resolvedTimeline: ResolvedTrackTimeline;
  pixelsPerSecond: number;
  selectedTransitionId: string | null;
  onSelectTransition?: (id: string | null) => void;
  onAddTransition?: (trackId: string, fromClipId: string, toClipId: string) => void;
  onUpdateTransitionDuration?: (trackId: string, transitionId: string, duration: number) => void;
  onDeleteTransition?: (trackId: string, transitionId: string) => void;
}
```

组件内部用 `useMemo` 派生 `clipWindowsMap`、`invalidIds`、`plansByTransitionId`。`maxDuration` 直接从 `plansByTransitionId` 读取，不再调用 `getChainAwareMaxDuration`。

SimpleTimeline 渲染变更：
```typescript
const resolvedTimeline = resolvedTracksMap.get(track.id);
if (!resolvedTimeline) return null;
<TransitionOverlay resolvedTimeline={resolvedTimeline} ... />
```

#### Q2: 失效转场渲染

- 失效转场可点击可选中（用户需要选中才能删除），选中后只显示删除按钮，不展开 slider
- 正常→失效→正常 用 CSS `transition-colors duration-200` 平滑过渡
- 失效转场不渲染跨度色块（没有对应的 `NormalizedTransitionPlan`）

#### Q3: 跨度色块定位

- `left = activeStartTime * pixelsPerSecond`，`width = (activeEndTime - activeStartTime) * pixelsPerSecond`
- z-index 层级：`z-5`（clip z-10 之下，转场标签 z-20 之下）
- 颜色：`rgba(34,211,238,0.12)` + 左右边框 `rgba(34,211,238,0.4)`
- `minWidth: 2` 保证低缩放比例下可见

#### Q4: Inline Slider 方案

- 原生 `input[type=range]`，`accent-color: cyan-500`（与 SimpleTimeline 缩放滑块一致）
- 宽度：`Math.max(60, Math.min(120, plan.maxDuration * pixelsPerSecond * 0.8))`
- `onChange` 实时更新（resolver 纯函数，无副作用）
- 小屏降级：计算宽度 < 60px 时回退到 +/- 按钮

#### Q5: Popconfirm 集成

- `placement="topRight"`，`disabled` 时不触发
- `okButtonProps={{ danger: true }}`
- 单个转场删除（× 按钮）不需要 Popconfirm

#### Q6: 数据传递变更

纯 prop 重组：删除 `clipWindows` Map 构建（移入组件内部 useMemo），删除 `track` prop（从 `resolvedTimeline.track` 读取），加 early return 替代 `?? []` 防御。

### 第三轮跨视角共识与决策更新

| # | 决策 | 理由 | 影响 |
|---|------|------|------|
| 1 | clamp 升级为链式感知（串行预算分配） | 单侧 clamp 在链式场景下仍违反约束，参考 Kdenlive | §4.1.3 重写，§9 风险 7 解决 |
| 2 | handleMouseUp/handleResizeUp 用方案 B | ref 同步赋值不受 React batching 影响，无竞态 | §4.1.7 新增 |
| 3 | 跨轨道清理逻辑已验证正确 | handleMoveClip 显式过滤 + normalize 兜底 | §4.1.8 新增（确认项） |
| 4 | TransitionOverlay 传 resolvedTimeline 聚合对象 | 避免 props 膨胀，内部 useMemo 派生所需数据 | §4.3 + §7 更新 |
| 5 | 失效转场用橙色（orange-400）而非红色 | 红色已被碰撞检测占用，橙色语义更准确 | §4.1.6 更新 |
| 6 | Inline slider 用原生 range + 小屏降级 | Ant Design Slider 在 10px 标签里难控制 | §4.3 更新 |
| 7 | Quick Add 6 种边界场景完整覆盖 | 含 disabled 条件、toast 文案、间隙跳过 | §4.2 扩展 |
| 8 | 新增 getAddableTransitionCount / getExistingTransitionCount | toolbar + 右键菜单 + Quick Add 共享计算 | §4.2 + §7 新增 |
| 9 | 右键菜单分 clip 级和轨道级 | clip 级做单个转场操作，轨道级做批量操作 | §4.2 新增 |
| 10 | Quick Add 后不自动选中 | 剪映/CapCut 同行为，不打断用户心流 | §4.2 确认 |
| 11 | Segment 1 测试策略：4 类测试用例 | 链式 clamp、normalize 集成、skipNormalize 状态机、跨轨道清理 | §8 Segment 1 扩展 |

### 第三轮补充发现 → 第四轮全部关闭

#### 待决议项（四轮已全部关闭）

**1. clamp 实现位置** → ✅ 方案 B：集成到 validateTransitions 内部

四轮决策理由：
- Kdenlive `requestMixResize` 和 Olive `TransitionBlock` 都采用集成模式
- 消除浮点二次计算分歧（独立 clamp 和 validate 对 effectiveMax 计算路径不同，可能产生 ±1e-15 差异）
- 链式预算账本在 validate 循环内精确累加，clamp 后立即更新
- 外部调用方（`useTransitionHandlers`、`handleMoveClip` 等）零改动
- §4.1.3 已更新为集成方案

**2. 0.9 系数 vs 绝对最小可见时长** → ✅ 方案 b：`effectiveMax - MIN_VISIBLE_DURATION(0.1s)`

四轮决策理由：
- 行业标准最小可见时长为 1 帧（~0.04s），Koma 已有 `Math.max(0.1, duration)` 下限
- 方案 a（0.9 系数）对 60s clip 浪费 6s 空间，对 1s clip 恰好但属巧合
- 方案 c（无系数）有零长度风险：clip 完全被转场覆盖，导出到剪映时 segment 时长为 0 会失败
- `MIN_VISIBLE_DURATION = 0.1` 放入 `constants.ts`
- §4.1.3 已更新

**3. isDraggingRef 管理层级** → ✅ 方案 a：`onDragStateChange` prop

四轮决策理由（推翻三轮建议）：
- 与 Kdenlive Controller/Model 分层一致：状态通知走 signal/prop，不污染数据操作的参数签名
- undo/redo 扩展友好：Editor 层有完整的拖拽生命周期信息，无需从 options 推断
- `useTransitionHandlers` 的 `updateTracks` 签名保持不变
- 方案 b（options.skipNormalize）实际上需要 `handleMoveClip` 也接受 isDragging 参数，改动量与方案 a 相当但语义更模糊
- §4.1.2 需更新：移除 `options.skipNormalize` 参数设计，改为 `isDraggingRef` + `onDragStateChange`

**4. NormalizedTransitionPlan 增加 chainAwareMaxDuration** → ✅ 不加

四轮决策理由：
- 要消费这个字段必须额外传 `transitionPlans` prop，接口改动量反而大于收益
- `getChainAwareMaxDuration` 只在选中转场时（展开控制条）才触发，不是热路径
- `NormalizedTransitionPlan` 是导出数据结构，加入仅供 UI 消费的计算字段会污染语义
- TransitionOverlay 继续直接调用 `getChainAwareMaxDuration`

**5. clip 右键菜单的转场操作粒度** → ✅ 方案 a：操作后切点

四轮决策理由：
- 剪映右键 clip 没有转场操作（转场入口是切点处的 + 图标），Premiere 的 Apply Default Transitions 作用于两端但粒度太粗
- 用户右键 clip 时视觉焦点在 clip 上，"这个 clip 之后"是最自然的语义
- 前切点已由上一个 clip 的右键菜单覆盖，不需要重复入口
- Phase 2 只操作后切点，Phase 3 可扩展为前/后

**6. Quick Add 作用域** → ✅ 主轨道优先（四轮新增决策）

- 默认作用于主轨道（`isMainTrack === true`）
- 有选中 clip 时作用于该 clip 所在轨道
- 不作用于所有视频轨道（叠加轨道加 fade 转场几乎无意义，剪映同行为）

**7. Toolbar 按钮文案** → ✅ 固定文案，不带计数（四轮新增决策）

- 没有主流 NLE 在批量操作按钮上显示动态计数
- 动态计数造成视觉跳动，信息价值不足以抵消噪音

**8. "所有切点已有转场"时 Quick Add 按钮状态** → ✅ enabled + info toast（四轮新增决策）

- disabled 语义是"你不能做"，实际是"已经做完了"，语义不准确
- toast 是主动反馈，符合用户"点击确认状态"的心理模型

**9. 失效转场交互** → ✅ pointer-events-none，不可交互（四轮新增决策）

- 失效转场是瞬态，松手后 normalize 自动清理
- 可选中会导致 selectedTransitionId 指向幽灵 id，状态不一致
- 拖动中禁用转场交互符合直觉

**10. z-index 层级** → ✅ 确认无需调整（四轮验证）

- 色块 z-5，未选中 clip z-0，选中 clip z-10，标签 z-20
- TransitionOverlay 在 clip 之前渲染（DOM 顺序），色块自然在 clip 之下
- resize handle z-20 在 clip 子 stacking context 内，不与标签冲突

**11. Inline slider onChange** → ✅ 直接提交，不加 debounce（四轮验证）

- 调用链 < 1ms（20 clips + 5 transitions），不是性能瓶颈
- 项目已有缩放 slider 直接 onChange 提交先例，影响范围更大但无性能问题
- debounce 会破坏实时反馈

---

### 第五轮：实现前最终验证（架构/前端/产品三视角边界压测）

#### 架构视角：validateTransitions 集成 clamp 边界验证

**V1: transitions 排序依赖 — 必须修复** ✅ 已修正

`track.transitions` 的顺序取决于用户添加顺序（append 到数组末尾），不保证按 clip 顺序。clamp 的串行预算分配依赖处理顺序——不同顺序会产生不同的 clamp 结果。

数值示例：Clips A(3s)→B(1s)→C(3s)，transitions=[B→C(0.8s), A→B(0.8s)]（用户先添加 B→C）
- 按数组顺序：B→C 先占 B 的 0.8s 预算，A→B 被 clamp 到 0.1s
- 按 clip 顺序：A→B 先占 B 的 0.8s 预算，B→C 被 clamp 到 0.1s

修复：§4.1.3 伪代码已加入 `sortedTransitions`，按 fromClip 在 sortedClips 中的 index 排序。开销 O(t log t)，t < 20，可忽略。

开源参考：Kdenlive 的 mix 列表存储在 MLT playlist 中，playlist 天然按时间顺序排列，不需要显式排序。Koma 的 `track.transitions` 是独立数组，必须显式排序。

**V2: clampedIds 传递 — 确认无问题**

`clampedIds` 在 `normalizeTrackTransitionsWithInvalid` 中被丢弃是正确设计。Phase 2 不需要"被自动缩短"的 UI 提示。保留在 `validateTransitions` 返回值中供未来扩展。Kdenlive/Premiere resize 后 mix 被缩短时也没有专门的视觉反馈。

**V3: 浮点精度边界 — 确认无问题**

三个场景手动计算验证：
- 场景 A（1/3 秒 clip）：1e-9 容差正确吸收浮点误差
- 场景 B（链式 A→B→C）：串行预算分配数值正确，B 剩余可见时长 = MIN_VISIBLE_DURATION
- 场景 C（clampMax=0 边界）：clip 时长 ≤ 0.1s 时不能有转场，0.2s 中间 clip 最多一侧转场。均合理。

**V4: getChainAwareMaxDuration 与 clamp 不一致 — 需修复** ✅ 已修正

`getChainAwareMaxDuration` 返回 `effectiveMax`，但 `validateTransitions` 的 clamp 上限是 `effectiveMax - MIN_VISIBLE_DURATION`。slider 拖到 max 后会被 clamp 弹回 0.1s。

修复：§4.1.3 注意事项已补充 `getChainAwareMaxDuration` 也需减去 `MIN_VISIBLE_DURATION`。

**V5: normalizeTimelineTracks 幂等性 — 确认无问题**

clamp 集成后仍幂等，前提是 V1 排序修复到位。构造 clamp 触发场景验证：第一次 clamp 后的值在第二次 normalize 中不再触发 clamp。

**V6: deriveLegacyTransitions 与 clamp 交互 — 确认无问题**

legacy 转场在第一次经过 `updateTracks` → `normalizeTimelineTracks` 后被持久化为新格式（`track.transitions` 被设置），后续不再重复派生。旧数据中 clip 被转场完全覆盖的情况会被自动修复为保留 0.1s 可见时长。

#### 前端视角：React 18 时序安全性验证

**F1: onDragStateChange React 18 时序 — 确认无问题**

React 18 automatic batching 覆盖所有上下文（包括原生事件处理器）。`isDraggingRef.current = false` 是同步赋值，`setTracks` updater 执行时 ref 值已正确。碰撞回退场景：`onMoveClip`（ref 仍为 true，跳过 normalize）→ `onDragStateChange(false)`（ref 置 false + normalizeNow）→ React flush 时按排队顺序执行两个 updater。时序安全。

**F2: TransitionOverlay memo 失效 — 确认无问题**

当前散装 props 中 `clipWindows` Map 在渲染函数内 `new Map(...)` 构造，memo 从未生效。重构为 `resolvedTimeline`（useMemo 缓存）后反而略有改善。TransitionOverlay 渲染开销极低（< 0.1ms），不需要自定义 areEqual。

**F3: prevTransitionCountRef 误报 — Bug，必须修复** ✅ 已修正

用户点"清除转场"或删除单个转场时，`prevTransitionCountRef` 检测到数量减少会误弹"已自动清理"warning toast，与用户主动操作的 success toast 重复。

修复：§4.1.4 已重写，通知逻辑移到 SimpleEditor，增加 `isUserDeletingRef` 标志区分用户主动删除和 normalize 自动清理。

**F4: isDraggingRef 闭包陷阱 — 确认无问题**

`useCallback` 依赖数组为空正确：`isDraggingRef` 通过 ref 访问，`normalizeTimelineTracks` 是纯函数。StrictMode 双调用不影响（ref 在两次调用间不变）。建议实现时加注释标注依赖数组为空的原因。

**F5: handleMoveClip early return 被 normalize 抵消 — 设计缺陷** ✅ 已修正

`normalizeTimelineTracks` 的 `tracks.map()` 总是返回新数组，即使内容不变。当 updater 返回 `prev` 时，非拖动状态下 `normalizeTimelineTracks(prev)` 返回新对象，React 不会 bailout。

修复：§4.1.2 的 `updateTracks` 已加入 `if (updated === prev) return prev` 快速路径，所有使用 `updateTracks` 的地方都受益。

**F6: useMemo 依赖正确性 — 优化建议**

`resolvedTimeline.invalidTransitions` 每次都是新数组，useMemo 每次重算。建议统一用 `[resolvedTimeline]` 作为依赖，语义更清晰。计算开销极低（空数组或 < 20 元素），不是性能问题。

#### 产品视角：决策一致性验证

**P1: D7/D8 与 §4.2 表格矛盾 — 必须修复** ✅ 已修正

§4.2 边界场景表格写"所有切点已有转场 → disabled"，与 D8 决策"enabled + info toast"矛盾。

修复：§4.2 表格已更新，"所有切点已有转场"改为 enabled + info toast。disabled 条件从 `addableCount === 0` 改为 `clipCount <= 1`（空轨道/单 clip 才 disabled）。

**P2: Quick Add 作用域叠加轨道矛盾 — 必须修复** ✅ 已修正

D6 的"有选中 clip 时作用于该 clip 所在轨道"在叠加轨道场景下违反预期（D6 自己也说叠加轨道加 fade 无意义）。

修复：§4.2 交互入口已更新，Quick Add toolbar 按钮始终作用于主轨道，不受 selectedClipId 影响。轨道头右键菜单非主轨道隐藏"一键转场"。

竞品参考：剪映批量添加转场只作用于主时间线，不作用于画中画轨道。

**P3: 清理通知与批量删除 toast 冲突 — 与 F3 同一问题** ✅ 已修正

批量删除后 prevTransitionCountRef 误弹 warning toast，与 handleDeleteAllTransitions 的 success toast 重复。修复方案同 F3。

**P4: 失效转场文案误导 — 已修正** ✅ 已修正

"将被移除"暗示不可逆，但拖回原位可恢复。改为"⚠ 无效"（描述当前状态而非预测未来）。增加 transition-delay 200ms 避免快速拖动闪烁。

竞品参考：Premiere 无效转场显示红色斜线纹理（表示"无效"而非"将被删除"）。

**P5: Segment 1/2 交付间隔 — 风险可控**

Segment 1 单独交付体验已优于 Phase 1（不再 block 拖动 + clamp 保留大部分转场）。建议同版本发布但允许分 PR，Segment 2 在 Segment 1 merge 后 24h 内提交。

**P6: 右键菜单边界场景 — Segment 2 实现时处理**

4 个边界场景补充：
- 最后一个 clip（无后切点）：菜单项 disabled + tooltip "该片段后没有相邻片段"
- clip 间有间隙：菜单项 disabled + tooltip "片段之间存在间隙"
- 非视频轨道：完全隐藏转场菜单项（`track.type === 'video'` 守卫）
- 已有转场切点：菜单项变为"删除此转场"（已覆盖）

### 第五轮跨视角共识

| # | 修正 | 来源 | 严重性 | 影响 |
|---|------|------|--------|------|
| 1 | validateTransitions 入口排序 transitions | V1 架构 | 高 | §4.1.3 伪代码已更新 |
| 2 | getChainAwareMaxDuration 减去 MIN_VISIBLE_DURATION | V4 架构 | 中 | §4.1.3 注意事项已补充 |
| 3 | prevTransitionCountRef 移到 Editor + isUserDeletingRef | F3 前端 = P3 产品 | 高 | §4.1.4 已重写 |
| 4 | updateTracks 加 `updated === prev` 快速路径 | F5 前端 | 中 | §4.1.2 已更新 |
| 5 | §4.2 表格与 D8 对齐（全部已有转场 → enabled+toast） | P1 产品 | 高 | §4.2 表格已更新 |
| 6 | Quick Add 始终作用于主轨道 | P2 产品 | 高 | §4.2 交互入口已更新 |
| 7 | 失效转场文案"⚠ 无效" + transition-delay 200ms | P4 产品 | 中 | §4.1.6 已更新 |
| 8 | useMemo 依赖统一用 `[resolvedTimeline]` | F6 前端 | 低 | 实现时处理 |
| 9 | 右键菜单 4 个边界场景 | P6 产品 | 中 | Segment 2 实现时处理 |
| 10 | Segment 1/2 同版本发布 | P5 产品 | 低 | 流程建议 |

确认无问题项：F1（React 18 时序安全）、F2（memo 失效但开销极低）、F4（无闭包陷阱）、V2（clampedIds 设计正确）、V3（浮点精度安全）、V5（幂等性保证）、V6（legacy 兼容正确）。
