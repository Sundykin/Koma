# 转场功能 implementation-breakdown-v1（正式版）

> 参见：[`transition-doc-map.md`](./transition-doc-map.md)

> 版本：v1
> 状态：冻结

## 1. 文档目的

本文件将转场功能长期规划 v1、ADR v1、Phase Gate / Stop-Loss v1、最小语义契约 v1，进一步收敛为一份**可执行但不扩范围**的实施拆分文档。

本文件回答四件事：

1. Phase 1 到底先做什么
2. 按什么顺序做
3. 每一段的验收标准是什么
4. 哪些事情明确不在 implementation-breakdown-v1 范围内

本文件是实施层文档，不是路线争论文档。
它默认沿用已经冻结的上位判断：

- 编辑态唯一真值是 `Track.transitions[]`
- Phase 1 只做 `fade`
- cut-point-first 是主交互模型
- preview / export 共享语义，不共享实现
- 本期是**受控的最小语义迁移 + `fade` 轻量能力验证**

补充说明：
- 本文件负责描述**实施分段**。
- 本次 approved change 的**正式需求与设计**以 `openspec/changes/update-transition-semantics-migration/` 为准。
- 当前更贴近真实代码落点的 implementation planning 参考见 `/Users/mjy/.claude/plans/precious-roaming-moth.md`。

---

## 2. 实施目标

implementation-breakdown-v1 的唯一目标是帮助团队通过：

- **Gate A：模型冻结门**
- **Gate B：Phase 1 可用闭环门**
- 为 **Gate C：编辑稳定门** 做最小必要准备

本文件不追求：

- Phase 2 效率闭环
- 更多 transition 类型
- 复杂 inspector
- 资源型 / 插件型 transition
- 平台化 capability registry
- 本地逐帧导出的完整重构

---

## 3. 总体实施原则

## 3.1 顺序原则

实施顺序固定为：

1. 语义冻结
2. 数据语义迁移
3. 导出链路同步迁移
4. 预览最小闭环
5. UI 最小入口
6. 稳定性与回归补齐

不得跳步。

## 3.2 闭环原则

每一段都必须回答：

- 真值在哪里
- 时间语义是否统一
- 是否影响现有保存/加载
- 是否影响 preview / export 一致性
- 是否新增了回归风险

## 3.3 止损原则

一旦出现以下情况，必须暂停向后推进：

- `Clip.transition` 与 `Track.transitions[]` 形成双写/双真值
- preview / export 各自补时间逻辑
- UI 先行但语义未收敛
- capability 提示不清或 silent fallback
- 为未来 effect / GPU / 插件扩展提前设计复杂抽象

---

## 4. 推荐实施分段

为避免误解，本文件不再使用 A/B/C/D 作为抽象代号，而采用更贴近真实目标的分段命名。

### Segment 0：语义冻结
### Segment 1：数据语义迁移
### Segment 2：剪映导出同步迁移
### Segment 3：预览最小闭环
### Segment 4：UI 最小入口
### Segment 5：稳定性与回归补齐

---

## 5. Segment 0：语义冻结

## 5.1 目标

在编码前冻结最小语义，避免实现过程中反复重定义行为。

## 5.2 必须冻结的内容

### 1. 唯一真值
- 编辑态唯一真值为 `Track.transitions[]`
- `Clip.transition` 只读兼容，不再新写

### 2. 最小模型

```ts
type Transition = {
  id: string
  fromClipId: string
  toClipId: string
  type: 'fade'
  duration: number
}
```

### 3. 锚点规则
- 只允许同一 track 的相邻 clip cut point
- 不支持跨 track
- 不支持非相邻 relation
- 不支持 clip 自由挂载

### 4. 时间规则
- transition duration = overlap 时长
- track 总时长 = clip 总时长 - overlap 总和
- timeline / preview / export 必须基于同一 resolver/layout 结果

### 5. 生命周期规则
- 删除 clip：关联 transition 直接删除
- 移动 clip 后破坏邻接：原 transition 直接删除
- 插入 clip 打断 cut point：原 transition 直接删除
- 替换 clip 且 identity 不变：可保留 transition

### 6. Phase 1 范围规则
- 只做 `fade`
- 不做第二种 transition
- 不做 batch / default / quick add
- 不做复杂 inspector
- 不做资源型 transition

## 5.3 产出物

- 最小语义契约文档冻结
- Go / No-Go 结论冻结
- Phase 1 成功标准冻结

## 5.4 验收标准

满足以下条件才允许进入 Segment 1：

- 团队不再对真值结构有分歧
- 生命周期规则已明确
- 总时长语义已明确
- Phase 1 范围边界已明确
- 没有“先做一半再决定”的模糊空间

## 5.5 对应 Gate

- Gate A

---

## 6. Segment 1：数据语义迁移

## 6.1 目标

把编辑态从 `clip.transition` 迁移到 `Track.transitions[]`，完成最小模型与持久化层收口。

## 6.2 涉及范围

重点影响点包括但不限于：

- `frontend/src/types/editor.ts:85`
- `frontend/src/types/editor.ts:88-97`
- `frontend/src/types/editor.ts:217-223`
- `frontend/src/store/trackStore.ts:892-909`

## 6.3 核心任务

### 1. 类型结构调整
- 在 `Track` 上引入 `transitions[]`
- 调整 transition 类型为最小冻结模型
- 明确 `Clip.transition` 为兼容读取字段

### 2. store 状态迁移
- 所有新增/修改/删除路径统一写 `Track.transitions[]`
- 禁止编辑态继续新写 `clip.transition`
- 选择态、编辑态、序列化态围绕新真值组织

### 3. 保存/加载迁移
- 保存项目时输出 `Track.transitions[]`
- 读取旧项目时允许兼容吸收 `Clip.transition`
- 兼容读取后进入统一编辑态真值

### 4. 总时长语义迁移
- `getDuration()` 不再沿用纯 clip end max 模型
- 改为消费 overlap 语义后的 track 总时长

## 6.4 风险

- 双真值残留
- 旧项目兼容失败
- duration 回归
- 选择态和编辑态指向错误

## 6.5 验收标准

- 新项目保存后只依赖 `Track.transitions[]`
- 旧项目中 `Clip.transition` 可被兼容读取
- 编辑态不存在长期双写
- duration 计算符合 overlap 语义
- 删除/移动/插入 clip 的 transition 生命周期行为符合冻结规则

## 6.6 不通过时禁止

- 禁止进入 UI 实现
- 禁止进入 preview 实现
- 禁止进入更多 export target

## 6.7 对应 Gate

- Gate A
- Gate B 的第 7、8、10 项前置条件
- Stop-Loss 2
- Stop-Loss 3

---

## 7. Segment 2：剪映导出同步迁移

## 7.1 目标

先把最有现实价值的一条导出链路与新语义对齐，建立“至少一条 export 正确输出”的闭环。

## 7.2 涉及范围

重点影响点包括但不限于：

- `frontend/src/services/draftExport/exportCapabilityChecker.ts:33-40`
- `frontend/src/services/draftExport/exportCapabilityChecker.ts:77-79`
- `frontend/src/services/draftExport/jianyingUtils.ts`

## 7.3 核心任务

### 1. capability 判断迁移
- capability 检测从 `clip.transition` 迁移到 `Track.transitions[]`
- 支持 / 不支持提示基于新真值输出
- 不允许 silent fallback

### 2. transition 映射迁移
- 剪映导出逻辑消费 `Track.transitions[]`
- 只支持 `fade`
- duration 与 clip 关系基于统一时间语义归一化

### 3. 错误反馈与边界提示
- 不支持场景有清晰反馈
- 不允许用户误判某条导出路径已正确支持

## 7.4 风险

- capability 与真实导出行为不一致
- 旧模型读取分支未清理干净
- preview/export 时间语义再次分叉

## 7.5 验收标准

- `fade` 在剪映导出链路中可正确输出
- capability 判断与实际结果一致
- 不支持时明确提示
- 没有因新语义导致的明显时间错位

## 7.6 不通过时禁止

- 禁止宣称 Phase 1 已闭环
- 禁止推进多 export target
- 禁止进入更多 effect 讨论

## 7.7 对应 Gate

- Gate B 第 6、9、10 项
- Gate E 第 4、5 项前置条件
- Stop-Loss 4

---

## 8. Segment 3：预览最小闭环

## 8.1 目标

在不重做整套渲染架构的前提下，让 preview 至少能正确消费 `fade` 的最小时间语义。

## 8.2 涉及范围

重点影响点包括但不限于：

- `frontend/src/components/editor/SimplePlayer.tsx:88-101`
- `frontend/src/components/editor/SimplePlayer.tsx:114-159`
- `frontend/src/engine/simpleEngine.ts:265-266`
- `frontend/src/services/simpleExportRenderer.ts:260-287`

## 8.3 分两步推进

### Step 3.1：active transition 判定
先建立：
- overlap 区间识别
- 当前时刻 active transition 判定
- from / to clip 的最小消费结果

这一层先解决语义，不先追求复杂视觉效果。

### Step 3.2：preview fade 呈现
在 active transition 语义成立后，再补上 `fade` 的最小视觉渲染。

## 8.4 原则

- 先统一时间语义，再做视觉呈现
- 不为未来多 effect 预埋复杂抽象
- 不把本地逐帧导出重构抬成 MVP 阻塞项

## 8.5 风险

- 仍沿用硬切可见性判断
- 视觉看似可用但时间语义不准
- preview 与 export 各自实现一套 overlap 规则

## 8.6 验收标准

- preview 可识别 active `fade`
- overlap 时间区间正确
- preview 与已接通的 export 链路无明显时间错位
- duration 调整后结果可预测

## 8.7 不通过时禁止

- 禁止继续做第二种 transition
- 禁止做效率层能力
- 禁止把 preview 演示当作系统成熟依据

## 8.8 对应 Gate

- Gate B 第 5、10 项
- Gate C 第 3、8 项
- Stop-Loss 1
- Stop-Loss 2

---

## 9. Segment 4：UI 最小入口

## 9.1 目标

提供刚好够用的 cut-point-first 交互入口，不提前扩成复杂编辑体系。

## 9.2 涉及范围

重点影响点包括但不限于：

- `frontend/src/components/editor/SimpleTimeline.tsx:906-933`
- `frontend/src/components/editor/SimplePropertiesPanel.tsx`

## 9.3 Phase 1 只做的内容

### timeline
- cut point 有最小可见标记或占位
- 可选中已有 transition
- 可删除 transition
- 可修改 duration

### inspector / 面板
- 只做必要补充编辑
- 不作为唯一主入口
- 不扩展复杂参数

## 9.4 Phase 1 不做的内容

- 默认转场
- quick add
- batch apply
- 多选批量编辑
- 第二种 transition 类型
- 深度 inspector 语义

## 9.5 风险

- UI 先行造成伪完成
- 交互入口与真实语义不一致
- timeline 与 preview 状态不同步

## 9.6 验收标准

- 用户能在 cut point 感知并操作 `fade`
- 用户可完成 add / edit / remove 最小路径
- 删除后 timeline 状态恢复正确
- UI 不引入新的双真值

## 9.7 不通过时禁止

- 禁止宣称可用闭环已完成
- 禁止扩复杂 UI 入口
- 禁止进入效率层建设

## 9.8 对应 Gate

- Gate B 第 1、2、3、4 项
- Gate C 第 1、2、4 项
- Stop-Loss 10

---

## 10. Segment 5：稳定性与回归补齐

## 10.1 目标

在 Phase 1 闭环完成后，补齐最小回归体系，支撑 Gate C，并为后续 Gate E 打基础。

## 10.2 核心任务

### 1. migration fixture
- 建立旧项目兼容读取样例
- 建立新项目保存/重开样例

### 2. 核心路径测试
至少覆盖：
- add transition
- edit duration
- remove transition
- save / reload
- old project read compatibility
- preview / export 关键时间语义
- capability 支持 / 不支持反馈

### 3. 异常输入处理
- 非法 transition duration
- 缺失 clip 引用
- 非相邻关系输入
- 项目文件中的不可信 transition 数据

## 10.3 风险

- 回归体系无法发现 preview/export 分叉
- migration 损坏不易被发现
- capability 失真

## 10.4 验收标准

- 核心回归路径可稳定运行
- 旧/新 schema 边界清晰
- 不可信输入有基础保护
- Gate C 可被验证，而不是靠人工主观判断

## 10.5 不通过时禁止

- 禁止进入 Phase 2
- 禁止扩 effect 数量
- 禁止对外宣称工作流成熟

## 10.6 对应 Gate

- Gate C
- Gate E 前置条件
- Stop-Loss 11
- Stop-Loss 12

---

## 11. 推荐执行顺序

推荐的最小执行顺序如下：

1. Segment 0：语义冻结
2. Segment 1：数据语义迁移
3. Segment 2：剪映导出同步迁移
4. Segment 3：预览最小闭环
5. Segment 4：UI 最小入口
6. Segment 5：稳定性与回归补齐

### 为什么不是先做 UI
因为当前最大风险不是“看不见转场入口”，而是：

- 双真值
- 时间语义分散
- 导出与 capability 继续绑定旧模型

### 为什么剪映导出早于 UI
因为本期 Phase 1 要求“至少一条 export 链路正确输出”，而且导出链路已经存在基础能力，价值更接近真实交付闭环。

### 为什么 preview 早于 UI 完整化
因为如果 preview 还停留在硬切模型，UI 再完整也只是伪完成。

---

## 12. 任务颗粒度建议

implementation-breakdown-v1 只定义实施段，不直接展开到逐文件逐函数级任务。

下一层任务清单建议按以下粒度展开：

### Level 1：实施段
- Segment 0
- Segment 1
- Segment 2
- Segment 3
- Segment 4
- Segment 5

### Level 2：段内任务
例如 Segment 1 下拆：
- 类型调整
- store 写路径调整
- 保存/加载迁移
- duration 语义迁移

### Level 3：验收项
每个段只挂最少必要验收项，不在此文档中继续下钻到实现细节。

这样做的目的是防止在路线尚未偏差受控前，就过早陷入过细任务列表。

---

## 13. 明确不纳入本版的事项

以下内容不进入 implementation-breakdown-v1：

- default transition
- default duration
- quick add
- batch apply / multi-apply
- 第二种 transition 类型
- easing / resourceId / 任意参数体系
- 资源型 transition
- 插件型 transition
- shader runtime
- marketplace / pack 能力
- platform capability registry
- 为 GPU / OpenCL / Vulkan / VideoToolbox 预埋架构
- 高级编辑工作流（replace / reposition / advanced handles）

---

## 14. 通过标准

implementation-breakdown-v1 被认为成功，不是因为“文档拆得够细”，而是因为它满足以下标准：

1. 能指导团队按固定顺序推进
2. 不会把工程拆分误导成需求优先级
3. 能直接映射到 Gate B / Gate C 的验收条件
4. 能直接暴露 Stop-Loss 触发点
5. 能防止项目在 Phase 1 被效率层、效果层、扩展层内容倒灌

---

## 15. 与其他文档的关系

本文件与以下文档配套使用：

- [转场功能长期规划 v1](./transition-long-term-plan-v1.md)
- [转场功能 ADR v1](./transition-adr-v1.md)
- [转场功能 Phase Gate / Stop-Loss v1](./transition-phase-gates-v1.md)
- [转场功能最小语义契约与 Go/No-Go 决策 v1](./transition-minimum-semantics-v1.md)
- [转场功能文档入口](./transition-doc-entry.md)

关系如下：

- 长期规划：定义路线顺序
- ADR：定义架构冻结
- Phase Gate：定义阶段准入与止损
- 最小语义契约：定义当前阶段语义边界
- implementation-breakdown-v1：定义可执行实施分段

---

## 16. 最终结论

Phase 1 不应被描述为“加转场支持”。

更准确的描述是：

**在严格范围控制下，把系统从 clip 挂载式硬切模型，迁移到最小关系型转场语义，并完成 `fade` 的 preview + 至少一条 export 链路闭环。**

因此 implementation-breakdown-v1 的价值，不在于把任务列得越多越好，而在于确保团队始终按以下顺序前进：

- 先收敛语义
- 再收敛真值
- 再收敛导出
- 再收敛预览
- 最后补最小 UI 与回归

只有这样，Phase 1 才不会在还没稳定时就被误推进到 Phase 2。