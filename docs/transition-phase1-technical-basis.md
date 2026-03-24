# 转场 Phase 1 技术基线

> 状态：Draft
> 作用：为 Phase 1 实现提供统一技术依据，收敛数据模型、时间语义、preview / export 分层、实施顺序与阻塞项。

---

## 1. 文档定位

本文件面向实现，不替代正式需求与正式设计。

- 正式需求与设计真值：`openspec/changes/update-transition-semantics-migration/`
- 架构冻结结论：[`transition-adr-v1.md`](./transition-adr-v1.md)
- 最小语义契约：[`transition-minimum-semantics-v1.md`](./transition-minimum-semantics-v1.md)
- 实施拆分：[`implementation-breakdown-v1.md`](./implementation-breakdown-v1.md)
- Gate / Stop-Loss：[`transition-phase-gates-v1.md`](./transition-phase-gates-v1.md)

本文件只回答一件事：在既有冻结前提下，Phase 1 技术上应该如何落地，才能最小化语义分叉风险。

---

## 2. 已冻结前提

以下结论在本文件中不再重开讨论：

- 编辑态唯一真值是 `Track.transitions[]`
- `Clip.transition` 仅兼容读取，不再新写
- Phase 1 只做 `fade`
- 只支持同轨相邻 clip 的 cut point
- `duration` 表示 overlap 时长
- preview / export 共享语义，不共享实现
- 时间语义必须由单一 resolver / layout 结果驱动

---

## 3. 数据模型基线

### 3.1 编辑态唯一真值

编辑态所有新增、修改、删除操作都只作用于 `Track.transitions[]`。

Phase 1 最小模型保持冻结状态：

```ts
type Transition = {
  id: string
  fromClipId: string
  toClipId: string
  type: 'fade'
  duration: number
}
```

### 3.2 为什么不继续使用 clip-attached 模型

不建议继续把 transition 挂在单个 clip 上，原因如下：

1. 转场语义天然属于两个相邻 clip 的边界，而不是任一单独 clip 的私有属性。
2. clip-attached 会引入 ownership 歧义，导致 timeline、preview、export 对“谁拥有这段时间”产生不同解释。
3. 一旦存在 overlap 语义，track 总时长和 cut point 占用都不再能由 clip 独立推导。

这一方向与本地 ADR 冻结结论一致，也与 OpenTimelineIO 将 transition 定义为相邻项之间关系对象的思路一致。

### 3.3 旧数据兼容边界

- 允许从旧项目的 `Clip.transition` 读取兼容信息
- 加载后必须立即归一化进入 `Track.transitions[]`
- 编辑态、保存态、preview、export、capability 都不得继续读取旧字段作为当前真值

禁止：

- 双写
- 双真值
- “新逻辑读 relation，旧逻辑读 clip.transition”的长期并存

---

## 4. Normalized Transition Plan 候选结构

为满足“共享语义，不共享实现”，建议在持久化模型与执行层之间建立一层归一化结果。

该层不是新的编辑真值，而是 resolver 的派生产物。

```ts
type NormalizedTransitionPlan = {
  transitionId: string
  trackId: string
  type: 'fade'

  fromClipId: string
  toClipId: string

  cutPointTime: number
  duration: number

  activeStartTime: number
  activeEndTime: number

  fromClipVisibleRange: {
    start: number
    end: number
  }
  toClipVisibleRange: {
    start: number
    end: number
  }

  exportVideoOffset: number
  exportAudioOverlap: number

  constraints: {
    maxDuration: number
    adjacencyValid: boolean
    sameTrackValid: boolean
  }
}
```

说明：

- `duration` 仍然是编辑态语义中的 overlap 时长
- `cutPointTime` 表示 relation 所锚定的 cut point
- `activeStartTime / activeEndTime` 供 timeline、preview、export 共用
- `exportVideoOffset` 是导出层编译字段，不应反向污染编辑态模型
- `constraints.maxDuration` 供 UI 与校验层共用，避免每层各算一套

本层的职责：

1. 把最小编辑模型解释成唯一时间真相
2. 为 preview 提供可消费的 active range
3. 为 export 提供目标后端可编译的 offset / overlap 输入
4. 为 UI 提供 cut point 占位和 duration 上限

---

## 5. maxDuration 与合法性规则建议

### 5.1 Phase 1 合法性规则

每个 transition 必须同时满足：

1. `fromClipId` 与 `toClipId` 必须存在
2. 两者必须位于同一 track
3. 两者必须是相邻 clip
4. `type` 只能是 `fade`
5. `duration` 必须大于 0
6. `duration` 不得超过 `maxDuration`
7. 同一 cut point 不允许存在两条 transition
8. 两条 transition 不允许相邻重叠

### 5.2 maxDuration 建议

Phase 1 建议采用保守规则：

`maxDuration = min(fromClipAvailableOverlap, toClipAvailableOverlap)`

在当前阶段，`fromClipAvailableOverlap` 与 `toClipAvailableOverlap` 应按 Koma 当前解析后可见时长和 cut point 两侧可用于重叠的时长计算，不引入 Premiere / Final Cut Pro 式更成熟的 handle 拖拽工作流。

原因：

1. OTIO 明确要求 transition offset 不得超过相邻项的可用时长。
2. Adobe / Apple 官方文档都强调 transition 依赖可用 media handles。
3. FFmpeg 的 `xfade` / `acrossfade` 最终也需要一个确定的、可编译的 overlap 时长。
4. Phase 1 的目标是稳定闭环，不是复刻成熟 NLE 的高级 handles 行为。

### 5.3 生命周期规则建议

继续沿用已冻结的简单规则：

- 删除 clip：删除关联 transition
- 插入 clip 打断 cut point：删除原 transition
- 移动 clip 破坏邻接：删除原 transition
- 替换内容但 clip identity 不变：可保留 transition

不建议 Phase 1 引入自动重绑、自动拆分、自动修复。

---

## 6. Preview / Export 分层基线

### 6.1 分层原则

建议采用三层分离：

1. 持久化编辑层：`Track.transitions[]`
2. 语义解析层：resolver / layout / normalized transition plan
3. 执行适配层：preview adapter / export adapter / capability checker

### 6.2 为什么共享语义但不共享实现

这是合理且必要的。

- preview 的目标是交互反馈与低延迟
- export 的目标是确定性交付
- FFmpeg 明确要求输入在帧率、分辨率、像素格式、时间基上先归一化，这更适合作为导出执行层，而不是交互预览核心

因此：

- preview 应消费 normalized transition plan，完成最小 fade 播放
- export 也消费同一 plan，再编译到具体后端
- 两者共享的是语义与时间模型，不是同一个渲染器

### 6.3 导出层约束

若导出路径使用 FFmpeg，则至少需要显式处理：

- 视频：`xfade` 的 `duration` 与 `offset`
- 音频：`acrossfade` 的 overlap 时长
- 输入统一：帧率、分辨率、格式、时间基

这些约束应位于 export adapter 内部，不应反向定义编辑态主模型。

---

## 7. Phase 1 最小实施顺序

建议按以下顺序推进，不得跳步：

1. 冻结 `maxDuration` 与合法性规则
2. 定义并实现 resolver / normalized transition plan
3. 完成 `Clip.transition` 到 `Track.transitions[]` 的编辑态迁移
4. 完成保存 / 重开 / 老项目兼容读取
5. 接通第一条 export 链路
6. 接通最小 preview fade
7. 最后补 cut-point UI 入口、时长编辑与回归体系

原因：

- 如果先做 UI，最容易制造“看起来可用了”的伪完成感
- 如果先做 preview 而没有 resolver，时间语义会马上分叉
- 如果先做多后端 export，会把 capability 与 unsupported 提示复杂度提前放大

---

## 8. 阻塞项

以下事项在进入正式实现前应视为明确阻塞项：

1. `maxDuration` 公式未冻结  
   后果：UI、preview、export 会对非法 duration 有不同处理。

2. normalized transition plan 结构未冻结  
   后果：timeline、preview、export 会各自产生“临时时间逻辑”。

3. 第一条 Phase 1 export 目标未确定  
   后果：capability 判断、unsupported 提示与回归基线都无法收敛。

4. 旧项目兼容 fixture 未准备  
   后果：迁移阶段无法验证 `Clip.transition` 读取是否可靠。

5. 非法数据输入校验边界未定义  
   后果：存储、导出、预览可能分别对坏数据做不一致处理。

---

## 9. 直接结论

Phase 1 技术上应坚持以下路线：

- 关系对象模型，不回退到 clip-attached
- overlap-first 的最小编辑语义，不提前扩成完整 NLE 参数模型
- 单一 resolver / layout 作为时间唯一真相来源
- preview / export 共享语义，不共享实现
- 先 resolver，再迁移，再首条 export，再 preview，再 UI

若上述约束任一未冻结，不建议直接进入实现。

---

## 10. 参考资料

- [OpenTimelineIO 官方文档：Timeline Structure](https://opentimelineio.readthedocs.io/en/v0.16.0/tutorials/otio-timeline-structure.html)
- [FFmpeg 官方文档：Filters Documentation](https://ffmpeg.org/ffmpeg-filters.html)
- [Adobe Premiere Pro 官方文档：Transitions overview](https://helpx.adobe.com/lv/premiere/desktop/add-video-effects/apply-video-transitions/transitions-overview.html)
- [Adobe Premiere Pro 官方文档：Move cuts and transitions simultaneously](https://helpx.adobe.com/ua/premiere/desktop/add-video-effects/apply-video-transitions/move-cuts-and-transitions-simultaneously.html)
- [Apple Final Cut Pro 官方文档：How transitions are created](https://support.apple.com/es-us/guide/final-cut-pro/ver761c7150/mac)
- [Apple Final Cut Pro 官方文档：Add video transitions and fades](https://support.apple.com/en-lamr/guide/final-cut-pro/ver761c7432/mac)
