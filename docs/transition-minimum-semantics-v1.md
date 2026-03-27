# 转场功能最小语义契约与 Go/No-Go 决策 v1（正式版）

> 参见：[`transition-doc-map.md`](./transition-doc-map.md)

> 版本：v1
> 状态：冻结

## 1. 文档目的

本文件用于在进入转场实现拆分前，先冻结：

- 最小语义契约
- 本期路线选择条件
- Go/No-Go 决策项
- Phase 1 成功标准

本文件不替代长期规划、ADR 与 Phase Gate，也不替代 OpenSpec 的正式 spec deltas。
它作为三者之间的实施前收敛层，防止团队在尚未确定路线时，直接进入接口细化、任务拆分和编码，导致：

- 工程拆分被误当成需求优先级
- 先做架构迁移，后验证用户价值
- UI 先行造成“看起来快完成了”的伪进展
- preview / export / persistence / capability 继续分叉
- 在 `clip.transition` 与 `Track.transitions[]` 之间长期维持双真值

---

## 2. 当前现实判断

基于现有代码路径梳理，转场不是局部能力补丁，而是一次跨层改造议题。

### 2.1 当前系统现状

1. 当前编辑态数据模型仍以 clip 挂载转场为主
   - `frontend/src/types/editor.ts:85`
   - `frontend/src/types/editor.ts:88-97`
   - `frontend/src/types/editor.ts:217-223`

2. timeline 仍没有 cut-point-first 的转场入口与可视化占位
   - `frontend/src/components/editor/SimpleTimeline.tsx:906-933`

3. 本地预览与本地导出仍是硬切模型，没有 transition overlap 语义
   - `frontend/src/components/editor/SimplePlayer.tsx:88-101`
   - `frontend/src/components/editor/SimplePlayer.tsx:114-159`
   - `frontend/src/engine/simpleEngine.ts:265-266`
   - `frontend/src/services/simpleExportRenderer.ts:260-287`

4. 剪映导出已有 transition 基础能力，但仍绑定旧模型
   - `frontend/src/services/draftExport/exportCapabilityChecker.ts:33-40`
   - `frontend/src/services/draftExport/exportCapabilityChecker.ts:77-79`

5. store 持久化与总时长算法尚未进入 overlap 心智
   - `frontend/src/store/trackStore.ts:892-909`

### 2.2 由此得出的结论

因此，所谓转场 Phase 1，并不是“补一个效果配置 UI”，而是至少涉及：

- 数据真值迁移
- 时间语义迁移
- 存储与加载兼容
- preview 消费逻辑调整
- export 归一化与映射调整
- capability 判断迁移
- 最小 UI 入口补齐

换言之，**A/B/C/D 只能作为工程拆分，不应直接等同于需求优先级。**

---

## 3. 路线决策前提

在进入实施任务清单前，团队必须先承认以下前提：

### 3.1 这不是单点增强，而是系统语义切换

从 `clip.transition` 迁移到 `Track.transitions[]`，本质上是把系统从“硬切 clip 模型”推进到“支持重叠语义的关系模型”。

### 3.2 不允许用工程正确性替代用户价值验证

先做类型迁移、store 迁移、导出迁移，在工程上是正确顺序；但如果没有足够用户价值证据，过早进入跨层改造会把团队锁进高维护成本路径。

### 3.3 不允许用 UI 可见性制造伪完成感

timeline badge、接缝占位、属性编辑入口，都容易让项目看起来“已经差不多能用了”。
如果 preview / export / persistence 仍不稳定，这类 UI 进展不能被视为闭环完成。

### 3.4 不允许长期保留双真值

`Track.transitions[]` 与 `Clip.transition` 若长期并存为双写或双真值，将持续放大：

- 迁移复杂度
- 时间语义分叉
- preview / export 不一致
- 回归成本

因此过渡兼容只能是读取兼容，不应成为长期编辑态结构。

---

## 4. 最小语义契约

以下内容在任务拆分前必须冻结。

## 4.1 唯一真值

### 决策
编辑态唯一真值为 `Track.transitions[]`。

### 约束
- 新增转场只写入 `Track.transitions[]`
- 修改转场只更新 `Track.transitions[]`
- 删除转场只从 `Track.transitions[]` 删除
- `Clip.transition` 仅用于旧项目兼容读取，不再作为新写入结构

### 禁止
- 禁止编辑态双写
- 禁止 UI 从 `Clip.transition` 与 `Track.transitions[]` 混合读取当前真值
- 禁止 preview 与 export 分别依赖不同真值来源

---

## 4.2 转场锚点

### 决策
Phase 1 中，转场只允许发生在同一 track 上两个相邻 clip 的 cut point。

### 约束
- 不允许脱离 cut point 独立存在
- 不允许挂载到单个 clip 作为自由属性
- 不允许跨非相邻 clip 建立 relation
- 不允许跨 track 建立 Phase 1 转场关系

### 影响
- cut-point-first 为唯一主交互模型
- inspector 只作为补充编辑层
- timeline 必须最终提供切点级可见性

---

## 4.3 最小模型

### 决策
Phase 1 只冻结最小模型：

```ts
type Transition = {
  id: string
  fromClipId: string
  toClipId: string
  type: 'fade'
  duration: number
}
```

### 不进入本期模型的字段
- easing
- resourceId
- 任意 params
- manifest 扩展字段
- 插件型运行时字段
- 资源型 transition 字段

### 原则
当前价值来自闭环与稳定性，不来自参数深度。

---

## 4.4 时间语义

### 决策
transition duration 表示两个相邻 clip 在 cut point 上的 overlap 时长。

### 约束
- track 总时长 = clip 总时长之和 - transitions overlap 总和
- timeline、preview、export 的时间判断都必须基于同一 resolver/layout 结果
- UI 不得自行定义另一套时间真相

### 禁止
- 禁止 timeline 单独算 overlap
- 禁止 preview 直接用硬切可见区间推断 active transition
- 禁止 export 通过平台适配时临时补时间语义

---

## 4.5 生命周期行为

在 Phase 1 中，以下行为规则必须先写清楚，再允许进入实现：

### 删除 clip
- 若某 transition 的 `fromClipId` 或 `toClipId` 指向被删除 clip，该 transition 必须失效
- 默认策略：直接删除关联 transition，不做自动重绑

### 移动 clip
- 若移动后原有相邻关系被破坏，原 transition 默认删除
- 不做隐式重绑到新邻接 clip

### 插入 clip
- 插入导致原 cut point 被打断时，原 transition 默认删除
- 不做自动拆分或自动重挂

### 替换 clip 内容
- 若 clip identity 不变，仅内容替换，则 transition 关系可保留
- 若本质上是删旧建新，则按删除规则处理

### 原则
Phase 1 优先选择**规则简单、结果可预测**，而不是“看起来更智能”的自动修复。

---

## 4.6 preview / export 关系

### 决策
preview 与 export 共享语义，不共享实现。

### Phase 1 要求
- preview 至少支持 `fade`
- export 至少一条链路正确输出 `fade`
- 两者基于同一 transition 语义与时间模型

### Phase 1 不要求
- 所有 export target 同时支持
- 本地逐帧导出与第三方导出链路完全同等级成熟
- 高级 transition 在 preview 与 export 中全面一致

---

## 4.7 capability 语义

### 决策
Phase 1 capability 只回答：
- 支持
- 不支持
- 如何反馈

### 约束
- 不支持场景必须有明确提示
- 不允许 silent fallback
- 不允许用户误以为某条导出链路已正确支持 transition

---

## 5. 三个 Go / No-Go 决策

在继续细化任务前，团队必须显式确认以下 3 个决策。

## Go / No-Go 1：目标用户是谁

### 选项 A：轻度生成用户
特点：
- 更关注快速出片
- 对深度编辑控制敏感度低
- 更在意默认工作流是否低成本

### 选项 B：重度编辑用户
特点：
- 更关注时间线精确控制
- 对 cut point、时长调整、编辑反馈要求更高
- 对一致性、稳定性、语义可预测性要求更高

### 本期默认结论
Phase 1 默认先服务**轻度生成用户**，验证转场是否具备高频使用价值。

---

## Go / No-Go 2：本期做什么路线

### 选项 A：轻量能力验证
目标：
- 证明用户会不会使用转场
- 证明 `fade` 是否值得进入默认工作流
- 证明最小闭环是否成立

### 选项 B：编辑级系统建设
目标：
- 建立完整、稳定、可维护的转场关系系统
- 为后续 default / batch / 更多 effect 打地基
- 接受跨数据模型、预览、导出、治理的持续投入

### 本期默认结论
Phase 1 默认按**轻量能力验证**推进，不把本期包装成完整编辑级系统交付。

---

## Go / No-Go 3：一致性是否为硬要求

### 选项 A：三链路硬一致
要求 preview / 原生导出 / 剪映导出同时建立严格一致性。

### 选项 B：Phase 1 有限一致
要求：
- preview 与至少一条 export 链路一致
- 其他链路可暂不纳入首轮硬承诺
- 必须明确暴露 capability 边界

### 本期默认结论
Phase 1 采用**有限一致**：
- preview + 至少一条 export 链路正确闭环
- 不强制要求所有链路首轮同时成熟

---

## 6. 本期推荐路线

基于上面的默认决策，当前推荐路线为：

### 6.1 定位
- 面向轻度生成用户
- 做轻量能力验证
- 采用有限一致策略

### 6.2 含义
这意味着本期目标不是“把转场系统一次性做完整”，而是：

1. 验证 `fade` 是否值得进入主工作流
2. 验证 cut-point-first 模型是否可被当前产品吸收
3. 验证新语义是否能在 preview + 一条 export 链路中稳定成立
4. 在不引入双真值的前提下，建立后续 Phase 2 的可扩展基础

---

## 7. Phase 1 成功标准

Phase 1 的成功标准不是“代码改完”或“路径都接上”，而是以下条件同时成立。

### 7.1 用户可完成最小闭环
用户可完成：
- 在 cut point 添加 `fade`
- 修改 duration
- 删除 transition
- 在 timeline 看见 transition 占位或接缝标记
- 在 preview 看到基础 `fade`
- 在至少一条 export 链路中得到正确结果

### 7.2 时间语义稳定
- track 总时长符合 overlap 语义
- preview 与 export 没有明显时间错位
- duration 修改不会导致明显时间异常

### 7.3 数据语义稳定
- transition 信息保存后不丢失
- 重开项目后仍可读取
- 老项目兼容可读
- 编辑态不存在长期双真值

### 7.4 用户认知可接受
- 用户能够理解转场发生在 cut point
- 用户不会把 transition 误认为 clip 内单点特效
- 不支持场景有明确反馈

### 7.5 范围没有失控
以下内容没有倒灌进入 Phase 1：
- 第二种 transition 类型
- 复杂 inspector
- default transition / batch apply
- 资源型 transition
- 插件型 transition
- 为未来 GPU / OpenCL / shader 预埋复杂抽象

---

## 8. 工程拆分与需求优先级的关系

为避免误解，明确如下：

### 8.1 工程拆分可使用以下结构
- 数据语义迁移
- 剪映导出同步迁移
- 预览最小闭环
- UI 最小入口

### 8.2 但这不是需求优先级
需求优先级必须先由以下三件事决定：
- 目标用户是谁
- 本期是验证还是系统建设
- 一致性要求是否为硬约束

### 8.3 禁止的错误推进方式
- 先把四块都做了，再看用户反应
- 先做最重的迁移，再倒推用户价值
- 先把 UI 做出来，再补时间语义
- 先让多条导出链路各自适配，再回头统一模型

---

## 9. 实施前必须补齐的文档项

在进入开发任务清单前，至少应先补齐以下内容：

1. 最小语义契约
2. clip 删除 / 移动 / 插入时的 transition 生命周期规则
3. Phase 1 成功标准
4. capability 反馈边界
5. 过渡兼容策略（仅读取兼容，不长期双写）

未补齐前，不建议继续扩任务颗粒度。

---

## 10. 与现有文档的关系

本文件与以下文档配套使用：

- [转场功能长期规划 v1](./transition-long-term-plan-v1.md)
- [转场功能 ADR v1](./transition-adr-v1.md)
- [转场功能 Phase Gate / Stop-Loss v1](./transition-phase-gates-v1.md)
- [转场功能文档入口](./transition-doc-entry.md)

关系如下：

- 长期规划 v1：回答长期路线与阶段顺序
- ADR v1：回答架构冻结决策
- Phase Gate / Stop-Loss v1：回答推进控制规则
- 本文件：回答“在实施拆分前，当前最小语义和本期路线到底是什么”

---

## 11. 最终结论

本期不应把转场包装成“常规功能增强”。

本期应明确为：

**一次受控的最小语义迁移 + `fade` 轻量能力验证。**

只有在以下三点被证明后，才允许进入更重投入：

1. 用户确实会高频使用
2. preview / export 语义能稳定收敛
3. `Track.transitions[]` 作为唯一真值的迁移成本可控

在此之前，团队必须持续抵制三种错误倾向：

- 以工程拆分替代需求决策
- 以 UI 进度替代闭环成熟度
- 以新增 effect 数量替代系统价值
