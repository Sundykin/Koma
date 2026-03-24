# 转场功能 ADR v1（正式版）

> 参见：[`transition-doc-map.md`](./transition-doc-map.md)

## ADR-1：转场作为关系对象，而不是 clip 内嵌属性

**状态**：Accepted

### 决策
转场在编辑态中建模为两个相邻 clip 之间的关系对象，而不是某个单独 clip 的内嵌属性。

### 原因
- 转场天然发生在两个片段之间
- clip 内嵌字段会带来 ownership 歧义
- 更利于 cut point 交互、批量操作、合法性校验
- 更利于统一时间计算与导出语义

### 影响
- 编辑态以 transition relation 为核心
- 不能再把 clip 当作 transition 的唯一宿主

---

## ADR-2：编辑态唯一真值使用 `Track.transitions[]`

**状态**：Accepted

### 决策
编辑态唯一真值使用 `Track.transitions[]`。`Clip.transition` 只保留为兼容读取来源，不再作为新写入结构。

### 原因
- 避免双真值和双写
- 让 transition 关系与 track 时间布局自然对齐
- 降低 timeline、preview、export 三处语义分叉风险

### 影响
- 新增/修改/删除 transition 统一写入 `Track.transitions[]`
- `Clip.transition` 仅作迁移输入

---

## ADR-3：交互模型采用 cut-point-first

**状态**：Accepted

### 决策
转场主交互以 cut point 为中心，而不是从 clip 属性面板出发。

### 原因
- 主流 NLE 工具都以 edit boundary / cut point 为 transition 入口
- default transition、quick apply、batch apply 都天然依赖 cut point 心智
- 更符合关系对象数据模型

### 影响
- timeline 上必须有切点级入口
- inspector 是补充层，不是唯一入口

---

## ADR-4：Phase 1 模型最小化，不为未来预埋复杂字段

**状态**：Accepted

### 决策
Phase 1 只采用最小 transition 模型，不提前加入 easing、resourceId、任意 params 等复杂字段。

### 冻结模型

```ts
type Transition = {
  id: string
  fromClipId: string
  toClipId: string
  type: 'fade'
  duration: number
}
```

### 原因
- 高频价值来自默认工作流，不来自参数深度
- 字段扩张会放大 migration、resolver、preview/export 联动成本

---

## ADR-5：时间语义由统一 resolver/layout 计算

**状态**：Accepted

### 决策
timeline 总时长、transition 占用关系、overlap 规则、preview 可见区间、export 前归一化输入都由统一 resolver/layout 计算。

### 原因
- 不允许 timeline、preview、export 各算一套
- transition 会改变剪辑时间结构，必须统一处理

### 影响
- resolver 成为核心基础设施
- UI 消费结果，不自行定义时间真相

---

## ADR-6：preview 与 export 共享语义，不共享实现

**状态**：Accepted

### 决策
preview 与 export 使用同一 transition 语义和时间模型，但不共享同一个渲染实现。

### 原因
- 预览目标是交互性、低延迟、即时反馈
- 导出目标是确定性、最终交付
- FFmpeg 等后端更适合作为导出路径，而不是交互预览核心

---

## ADR-7：系统长期区分 editing-grade 与 final-grade

**状态**：Accepted

### 决策
长期工作流中明确区分：
1. editing-grade interactive preview
2. final-grade deterministic export

### 原因
- 编辑可操作并不等于最终质量已验证
- 重型或资源型 transition 尤其需要这种区分

---

## ADR-8：导出前先做 transition 归一化，再进入具体后端

**状态**：Accepted

### 决策
在进入 Jianying、FFmpeg 或未来其他 export target 前，先把 transition 与 clip 时间关系归一化为统一中间表示。

### 原因
- 不同导出后端对时间、offset、输入格式要求不同
- 统一归一化能降低多后端扩展成本

---

## ADR-9：内部 effect id 采用 canonical id，不绑定单一平台

**状态**：Accepted

### 决策
内部使用 canonical transition effect id，外部导出目标通过 adapter 映射为具体平台能力。

### 原因
- 避免把内部模型绑到某个导出平台
- 有利于 capability 判断与不支持提示

---

## ADR-10：capability 先做最小表，不做平台化注册系统

**状态**：Accepted

### 决策
Phase 1~2 只建立最小 capability 表，回答支持/不支持及提示策略，不建设复杂 capability registry/platform。

### 原因
- 当前需要的是确定性判断，而不是平台化扩展框架

---

## ADR-11：效率优先于效果扩张

**状态**：Accepted

### 决策
在 `fade` 闭环稳定后，优先做 default transition、default duration、quick add、batch apply，而不是优先增加更多 transition 类型。

### 原因
- 高频使用依赖默认工作流与快速批量操作
- 功能种类增加不等于工作流价值增加

---

## ADR-12：资源型 transition 单独建类，不并入主路线

**状态**：Accepted

### 决策
stinger / track matte / asset-based transition 不视为 `fade` 的线性下一步，而是单独类别的问题域。

### 原因
- 它们依赖媒体资源、同步、布局、分辨率和打包规范
- 会显著放大 preview/export/workflow 复杂度

---

## ADR-13：扩展生态若未来存在，必须 manifest-first / validation-first

**状态**：Accepted

### 决策
如果未来支持 transition pack、plugin、shader 或其他扩展生态，必须先建立 manifest/schema、版本约束、导入校验和 trust 模型，再谈分发与开放。

### 原因
- 扩展生态不天然等于安全、稳定、可维护
- 治理必须先于开放

---

## ADR-14：性能后端不反向定义主模型

**状态**：Accepted

### 决策
OpenCL/GPU/硬件加速等 specialized backend 不参与主模型设计，不决定 Phase 1/2 的数据结构、交互模型与架构边界。

### 原因
- 性能后端属于环境相关的 specialized path
- 主系统应先解决语义、时间模型和默认工作流

---

## ADR-15：成熟度以工作流稳定性衡量，而不是功能数量

**状态**：Accepted

### 决策
转场系统的成熟度不以支持多少种 transition 衡量，而以工作流稳定性和结果可预测性衡量。

### 标准
- 默认工作流是否顺滑
- 时间语义是否稳定
- preview/export 是否一致
- 导出结果是否可预测
- 高频使用价值是否成立

---

## References

- Adobe Premiere Pro: Set and apply default transitions
- Adobe Premiere Pro: Quick transitions
- Apple Final Cut Pro: Add transitions and fades
- Blackmagic DaVinci Resolve Edit page
- FFmpeg Filters Documentation: xfade / xfade_opencl
- Kdenlive Proxy Settings
- Shotcut Forum: Settings Proxy Editing
- OBS Knowledge Base: Track Matte Stinger Transitions
